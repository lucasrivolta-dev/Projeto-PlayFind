import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { GameService } from '../modules/games/game.service.js';
import { matchesPlatformPreference } from '../modules/games/platform-preference.js';

// Read-only audit of the real catalog through the same service used by /feed.
const db = new PrismaClient();
try {
  const service = new GameService(db);
  for (const preferences of [['PlayStation'], ['PlayStation', 'Steam']]) {
    for (const limit of [20, 100]) {
      const games = await service.getFeedGames(limit, [], preferences);
      const rows = games.map((game) => ({
        id: game.id,
        title: game.title,
        platforms: game.platforms,
        steamAppId: game.steamAppId,
        compatible: matchesPlatformPreference(preferences, game.platforms,
          Boolean(game.steamAppId || game.steam?.isAvailable ||
            game.storeOffers.some((offer) => offer.store === 'STEAM' && offer.isAvailable))),
      }));
      const compatible = rows.filter((game) => game.compatible).length;
      console.log(JSON.stringify({
        preferences, requested: limit, total: rows.length, compatible,
        outside: rows.length - compatible,
        percent: rows.length ? compatible / rows.length * 100 : null,
        games: rows,
      }));
    }
  }
} finally {
  await db.$disconnect();
}
