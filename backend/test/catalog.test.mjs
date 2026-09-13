import assert from 'node:assert/strict';
import test from 'node:test';
import { mapIgdbGame } from '../dist/modules/integrations/igdb/igdb.mapper.js';
import { GameSyncService } from '../dist/modules/sync/game-sync.service.js';
import { matchGames } from '../dist/modules/sync/game-matcher.service.js';

test('Matching keeps editions, remakes and demos separate', () => {
  const game = {
    title: 'Game',
    developer: 'Studio',
    publisher: 'Publisher',
    releaseDate: new Date('2025-01-01'),
    platforms: ['PC'],
    genres: [],
    screenshots: [],
  };
  for (const suffix of ['Remastered', 'Remake', 'Deluxe Edition', 'Demo', '2']) {
    assert.equal(matchGames(game, { ...game, title: `Game ${suffix}` }).matched, false);
  }
});

test('IGDB image normalization preserves complete URLs', () => {
  for (const url of ['//images.example/cover.jpg', 'https://images.example/cover.jpg']) {
    const game = mapIgdbGame({ id: 1, name: 'Game', cover: { url } });
    assert.equal(game.coverUrl, 'https://images.example/cover.jpg');
  }
  assert.equal(mapIgdbGame({ id: 1, name: 'Game' }).coverUrl, undefined);
});

test('Sync links the stored database ID rather than the title or slug', async () => {
  const source = {
    title: 'Game',
    slug: 'game',
    igdbId: 1,
    releaseDate: new Date('2025-01-01'),
    platforms: ['PC'],
    genres: [],
    screenshots: [],
  };
  const links = [];
  const service = new GameSyncService(
    {
      findCandidates: async () => [{ ...source, id: 'database-id' }],
      linkExternalIds: async (id, sources) => links.push({ id, sources }),
      upsertByExternalId: async () => assert.fail('A matched game must not be duplicated'),
      markSynced: async () => {},
    },
    () => {},
  );
  const result = await service.sync([source]);
  assert.equal(result.linked, 1);
  assert.deepEqual(links, [{ id: 'database-id', sources: { igdbId: 1 } }]);
});
