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
      candidates.map((game: any) => {
        const rawVideos = (game.videos ?? []) as Array<{ name?: string; video_id?: string }>;
        const videos = rawVideos.map((v) => ({
          name: v.name ?? null,
          videoId: v.video_id ?? null,
        }));
        const hasPlayableTrailer = rawVideos.some((v) => Boolean(v.video_id?.trim()));

        return {
          igdbId: game.id,
          name: game.name,
          mode: cliOptions.mode,
          releaseDate: game.first_release_date
            ? new Date(game.first_release_date * 1000).toISOString()
            : null,
          rating: game.rating !== undefined ? Number(game.rating.toFixed(1)) : null,
          ratingCount: game.rating_count ?? null,
          total_rating:
            game.total_rating !== undefined ? Number(game.total_rating.toFixed(1)) : null,
          total_rating_count: game.total_rating_count ?? null,
          ...(game.adjustedRating !== undefined
            ? { adjustedRating: Number(game.adjustedRating.toFixed(3)) }
            : {}),
          videoCount: rawVideos.length,
          hasPlayableTrailer,
          videos,
        };
      }),
      null,
      2,
    ),
  );
  process.exit(0);
}

const games = selectedRawGames.map((game) => mapIgdbGame(game));

const datasourceUrl =
  process.env.USE_TEST_DB === 'true' && process.env.TEST_DATABASE_URL
    ? process.env.TEST_DATABASE_URL
    : undefined;
const prisma = new PrismaClient(datasourceUrl ? { datasourceUrl } : undefined);
if (datasourceUrl) {
  console.log('Ambiente de sincronização: TEST_DATABASE_URL (Neon TEST)');
}
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
    `Sincronização concluída: ${result.inserted} novos, ${result.linked} vinculados, ${result.unmatched} sem match${result.rejected ? `, ${result.rejected} rejeitados` : ''}.`,
  );
  if (result.rejections && Object.keys(result.rejections).length > 0) {
    console.log('Motivos de rejeição:', JSON.stringify(result.rejections, null, 2));
  }
} finally {
  await prisma.$disconnect();
}
