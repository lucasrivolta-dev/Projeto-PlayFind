import test from 'node:test';
import assert from 'node:assert/strict';
import { mapIgdbGame } from '../dist/modules/integrations/igdb/igdb.mapper.js';
import { matchGames } from '../dist/modules/sync/game-matcher.service.js';
import { GameSyncService } from '../dist/modules/sync/game-sync.service.js';
import { PrismaGameRepository } from '../dist/modules/games/prisma-game.repository.js';
import { GameService } from '../dist/modules/games/game.service.js';

const existingId = '9fecf99a-ffc3-45bc-82eb-b7dd328b3b31';

// Public IGDB fields verified by a read-only request on 2026-09-13.
const modern = {
  id: 113112,
  name: 'Hades',
  slug: 'hades--1',
  first_release_date: 1600300800,
  external_games: [
    { uid: '71297', external_game_source: { name: 'GiantBomb' } },
    { uid: '1145360', external_game_source: { name: 'Steam' } },
  ],
  involved_companies: [{ developer: true, publisher: true, company: { name: 'Supergiant Games' } }],
  videos: [
    { video_id: 'YZZFlcE0fWE' },
    { video_id: 'sr__hTXlDZk' },
    { video_id: '593xCDfumN0' },
    { video_id: 'Bz8l935Bv0Y' },
  ],
};
const old = {
  id: 80529,
  name: 'Hades',
  slug: 'hades',
  first_release_date: 799286400,
  external_games: [{ uid: '59708', external_game_source: { name: 'GiantBomb' } }],
  involved_companies: [
    { developer: true, company: { name: 'Ablex' } },
    { publisher: true, company: { name: 'LG Software' } },
  ],
};

test('The imported Hades 1995 is not the Supergiant game and must remain separate', () => {
  assert.equal(mapIgdbGame(old).steamAppId, undefined);
  assert.deepEqual(matchGames(mapIgdbGame(old), mapIgdbGame(modern)), {
    matched: false,
    score: 50,
    reasons: ['lançamentos distantes'],
  });
});

// Exercise the real mapper, sync service and Prisma repository against isolated
// storage, never by syncing over the user's real Hades or its personal records.
function isolatedPrisma() {
  const game = {
    id: existingId,
    title: 'Hades',
    slug: 'hades',
    igdbId: null,
    steamAppId: 1145360,
    releaseDate: new Date('2020-09-17'),
    studio: 'Supergiant Games',
    publisher: 'Supergiant Games',
    media: [],
    genres: [],
    platforms: [],
    steamOffers: [],
  };
  const personal = {
    library: [
      {
        gameId: game.id,
        userId: 'test-player',
        status: 'PLAYED',
        isFavorite: true,
        rating: 5,
        reviewText: 'Review retained',
      },
    ],
    likes: [{ gameId: game.id, userId: 'test-player' }],
  };
  const records = [game];
  let creates = 0;
  const matches = (row, where) =>
    Object.entries(where).every(([key, value]) =>
      key === 'title' ? row.title.toLowerCase() === value.equals.toLowerCase() : row[key] === value,
    );
  return {
    records,
    personal,
    get creates() {
      return creates;
    },
    client: {
      game: {
        findMany: async ({ where, take }) =>
          records.filter((row) => where.OR.some((filter) => matches(row, filter))).slice(0, take),
        findUnique: async ({ where }) => records.find((row) => matches(row, where)) ?? null,
        update: async ({ where, data }) =>
          Object.assign(
            records.find((row) => row.id === where.id),
            data,
          ),
        create: async () => {
          creates++;
          throw new Error('Unexpected duplicate creation');
        },
      },
      gameMedia: {
        findFirst: async ({ where }) =>
          records
            .find((row) => row.id === where.gameId)
            ?.media.find((item) => item.url === where.url) ?? null,
        create: async ({ data }) => {
          const row = records.find((item) => item.id === data.gameId);
          row.media.push({ ...data, id: `media-${row.media.length + 1}` });
        },
      },
    },
  };
}

for (const uid of ['1145360', 1145360, ' 1145360 ']) {
  test(`Verified Steam UID (${JSON.stringify(uid)}) updates the original ID and preserves personal relations`, async () => {
    const db = isolatedPrisma();
    const before = structuredClone(db.personal);
    const incoming = mapIgdbGame({
      ...modern,
      external_games: [{ uid, external_game_source: { name: ' Steam ' } }],
    });
    const service = new GameSyncService(new PrismaGameRepository(db.client), () => {});
    for (let i = 0; i < 2; i++) {
      assert.deepEqual(await service.sync([incoming]), {
        received: 1,
        inserted: 0,
        linked: 1,
        unmatched: 0,
      });
      assert.equal(db.records.length, 1);
      assert.equal(db.records[0].id, existingId);
      assert.equal(db.records[0].igdbId, 113112);
      assert.equal(db.records[0].steamAppId, 1145360);
      assert.equal(db.records[0].slug, 'hades');
      assert.deepEqual(db.personal, before);
      assert.equal(db.creates, 0);
    }
  });
}

test('Existing game update persists IGDB YouTube videos and exposes deterministic API trailers', async () => {
  const db = isolatedPrisma();
  const beforeLibrary = structuredClone(db.personal.library);
  const beforeLikes = structuredClone(db.personal.likes);
  const incoming = mapIgdbGame(modern);
  const service = new GameSyncService(new PrismaGameRepository(db.client), () => {});

  const first = await service.sync([incoming]);
  const second = await service.sync([incoming]);
  assert.deepEqual(first, { received: 1, inserted: 0, linked: 1, unmatched: 0 });
  assert.deepEqual(second, first);
  assert.equal(db.records.length, 1);
  assert.equal(db.records[0].id, existingId);
  assert.equal(db.records[0].igdbId, 113112);
  assert.deepEqual(db.personal.library, beforeLibrary);
  assert.deepEqual(db.personal.likes, beforeLikes);
  assert.deepEqual(
    db.records[0].media.map((item) => item.url),
    incoming.trailers,
  );

  const gameService = new GameService({
    game: {
      findUnique: async ({ where }) => {
        const row = db.records.find(
          (item) =>
            item.id === where.id ||
            item.slug === where.slug ||
            item.steamAppId === where.steamAppId ||
            item.igdbId === where.igdbId,
        );
        return row ? { ...row, genres: [], platforms: [], steamOffers: [] } : null;
      },
    },
  });
  const detail = await gameService.getGameById(existingId);
  assert.equal(detail.primaryTrailer?.provider, 'YOUTUBE');
  assert.deepEqual(
    detail.trailerDetails.map((item) => item.videoId),
    ['YZZFlcE0fWE', 'sr__hTXlDZk', '593xCDfumN0', 'Bz8l935Bv0Y'],
  );
  assert.equal(db.records[0].media.length, 4);
});

test('Verified external identity takes precedence over title, slug and release heuristics', async () => {
  const db = isolatedPrisma();
  const incoming = {
    ...mapIgdbGame(modern),
    title: 'Localized title',
    slug: 'localized',
    releaseDate: new Date('2010-01-01'),
  };
  const result = await new GameSyncService(new PrismaGameRepository(db.client), () => {}).sync([
    incoming,
  ]);
  assert.equal(result.inserted, 0);
  assert.equal(result.linked, 1);
  assert.equal(db.records[0].id, existingId);
});

test('Mapper skips malformed IDs and rejects ambiguous Steam identities', () => {
  const steam = (uid) => ({ uid, external_game_source: { name: 'sTeAm' } });
  assert.equal(
    mapIgdbGame({ ...modern, external_games: [steam('bad'), steam('1145360')] }).steamAppId,
    1145360,
  );
  assert.equal(
    mapIgdbGame({
      ...modern,
      external_games: [{ uid: '1145360', external_game_source: { name: 'NotSteam' } }],
    }).steamAppId,
    undefined,
  );
  for (const uid of [0, -1, 1.5, '1e3', '', Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(mapIgdbGame({ ...modern, external_games: [steam(uid)] }).steamAppId, undefined);
  }
  const ambiguous = mapIgdbGame({ ...modern, external_games: [steam('1145360'), steam('123')] });
  assert.equal(ambiguous.steamAppId, undefined);
  assert.deepEqual(ambiguous.steamAppIds, [1145360, 123]);
});
