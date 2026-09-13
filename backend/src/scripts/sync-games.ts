import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { IgdbClient } from '../modules/integrations/igdb/igdb.client.js';
import { mapIgdbGame } from '../modules/integrations/igdb/igdb.mapper.js';
import type { IgdbGameDto } from '../modules/integrations/igdb/igdb.types.js';
import { SteamClient } from '../modules/integrations/steam/steam.client.js';
import { enrichWithSteam } from '../modules/integrations/steam/steam.mapper.js';
import { PrismaGameRepository } from '../modules/games/prisma-game.repository.js';
import { GameSyncService } from '../modules/sync/game-sync.service.js';
import type { NormalizedGame } from '../modules/games/normalized-game.js';
import {
  ensureVideoField,
  buildSyncQuery,
  parseSyncArgs,
  rankDiscoverCandidates,
} from '../modules/integrations/igdb/igdb-query.js';

const required = (name: string) => {
  const value = process.env[name];
  if (!value)
    throw new Error(
      `${name} não configurada. Copie .env.example para .env e preencha as credenciais localmente.`,
    );
  return value;
};

const cliOptions = parseSyncArgs(process.argv.slice(2));
const hasExplicitCli = process.argv.slice(2).length > 0;
const query = hasExplicitCli
  ? buildSyncQuery(cliOptions)
  : ensureVideoField(process.env.IGDB_SYNC_QUERY ?? buildSyncQuery(cliOptions));

console.log(
  `Modo: ${cliOptions.mode}${cliOptions.igdbId !== undefined ? `\nIGDB ID: ${cliOptions.igdbId}` : `\nLimite: ${cliOptions.limit}`}`,
);
console.log('Query IGDB preparada.');

const client = new IgdbClient(required('IGDB_CLIENT_ID'), required('IGDB_CLIENT_SECRET'));
const rawGames = (await client.search(query)) as IgdbGameDto[];

const selectedRawGames =
  cliOptions.mode === 'discover'
    ? rankDiscoverCandidates(rawGames as any[]).slice(0, cliOptions.limit)
    : rawGames;

if (cliOptions.dryRun) {
  const candidates = selectedRawGames.slice(0, cliOptions.limit);
  console.log(
    JSON.stringify(
      candidates.map((game: any) => ({
        igdbId: game.id,
        name: game.name,
        total_rating: game.total_rating,
        total_rating_count: game.total_rating_count,
        ...(game.adjustedRating !== undefined
          ? { adjustedRating: Number(game.adjustedRating.toFixed(3)) }
          : {}),
        releaseDate: game.first_release_date
          ? new Date(game.first_release_date * 1000).toISOString()
          : null,
      })),
      null,
      2,
    ),
  );
  process.exit(0);
}

const games = selectedRawGames.map((game) => mapIgdbGame(game));

console.log(`IGDB: ${games.length} jogos recebidos.`);

const prisma = new PrismaClient();
try {
  const repository = new PrismaGameRepository(prisma);
  const syncService = new GameSyncService(repository);

  const steamKey = process.env.STEAM_API_KEY;
  let steamEnricher: ((game: NormalizedGame) => Promise<NormalizedGame | undefined>) | undefined;

  // A Steam API key is only needed for the fallback app-list lookup. Known
  // Steam IDs from IGDB can still be enriched through the public details API.
  if (steamKey || games.some((game) => game.steamAppId !== undefined || game.steamAppIds?.length)) {
    const steamClient = new SteamClient(steamKey ?? '');
    steamEnricher = async (game: NormalizedGame) => {
      try {
        const appId =
          game.steamAppId ??
          (game.steamAppIds?.length
            ? await steamClient.resolvePrimaryApp(game.title, game.steamAppIds)
            : steamKey
              ? await steamClient.findByName(game.title)
              : undefined);
        if (!appId) {
          if (game.steamAppIds?.length) {
            console.warn(
              `Steam: IDs ambíguos para IGDB ${game.igdbId} "${game.title}": ${game.steamAppIds.join(', ')}. Nenhum foi associado.`,
            );
          }
          return game;
        }
        const details = await steamClient.details(appId);
        return enrichWithSteam(game, appId, details);
      } catch (error) {
        console.warn(
          `Steam: não foi possível enriquecer "${game.title}".`,
          error instanceof Error ? error.message : error,
        );
        return game;
      }
    };
  }

  const result = await syncService.sync(games, steamEnricher);
  console.log(
    `Sincronização concluída: ${result.inserted} novos, ${result.linked} vinculados, ${result.unmatched} sem match.`,
  );
} finally {
  await prisma.$disconnect();
}
