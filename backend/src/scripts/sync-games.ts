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

const required = (name: string) => {
  const value = process.env[name];
  if (!value)
    throw new Error(
      `${name} não configurada. Copie .env.example para .env e preencha as credenciais localmente.`,
    );
  return value;
};

const query =
  process.env.IGDB_SYNC_QUERY ??
  'fields name,slug,summary,cover.url,screenshots.url,genres.name,platforms.name,first_release_date,involved_companies.company.name,involved_companies.developer,involved_companies.publisher,total_rating; where version_parent = null; limit 50;';

const client = new IgdbClient(required('IGDB_CLIENT_ID'), required('IGDB_CLIENT_SECRET'));
const rawGames = (await client.search(query)) as IgdbGameDto[];
const games = rawGames.map((game) => mapIgdbGame(game));

console.log(`IGDB: ${games.length} jogos recebidos.`);

const prisma = new PrismaClient();
try {
  const repository = new PrismaGameRepository(prisma);
  const syncService = new GameSyncService(repository);

  const steamKey = process.env.STEAM_API_KEY;
  let steamEnricher: ((game: NormalizedGame) => Promise<NormalizedGame | undefined>) | undefined;

  if (steamKey) {
    const steamClient = new SteamClient(steamKey);
    steamEnricher = async (game: NormalizedGame) => {
      try {
        const appId = await steamClient.findByName(game.title);
        if (!appId) return game;
        const details = await steamClient.details(appId);
        return enrichWithSteam(game, appId, details);
      } catch {
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
