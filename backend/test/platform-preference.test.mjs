import test from 'node:test';
import assert from 'node:assert/strict';
import { matchesPlatformPreference as matches } from '../dist/modules/games/platform-preference.js';
import { GameService } from '../dist/modules/games/game.service.js';

test('canonical families match exact aliases, not arbitrary substrings', () => {
  assert.equal(matches(['PS5'], ['PlayStation'], false), true);
  assert.equal(matches(['PlayStation'], ['PlayStation 4'], false), true);
  assert.equal(matches(['p'], ['PlayStation'], false), false);
  assert.equal(matches(['PlayStation'], ['Not PlayStation'], false), false);
  assert.equal(matches([], ['PlayStation'], false), false);
});

test('Steam requires store evidence; combined preferences use OR', () => {
  assert.equal(matches(['Steam'], ['PC'], false), false);
  assert.equal(matches(['Steam'], ['PC'], true), true);
  assert.equal(matches(['PlayStation', 'Steam'], ['PC'], true), true);
  assert.equal(matches(['PlayStation', 'Steam'], ['PlayStation'], false), true);
  assert.equal(matches(['PlayStation', 'Steam'], ['Switch'], false), false);
});

test('feed gives one +15 bonus and retains games outside the preferred families', async () => {
  const record = (id, title, platforms, steamAppId) => ({
    id, title, slug: title.toLowerCase(), rating: 9, ratingCount: 100,
    releaseDate: new Date('2025-01-01'), createdAt: new Date('2025-01-01'),
    description: 'A complete adventure with enough real metadata for this ranking fixture.',
    coverUrl: 'https://example.com/cover.jpg', heroUrl: null,
    studio: title, publisher: title, isFree: false, steamAppId,
    genres: [], platforms: platforms.map(name => ({ platform: { name } })),
    media: [{ type: 'TRAILER', url: 'https://www.youtube.com/watch?v=abcdefghijk', provider: 'YOUTUBE' }],
    steamOffers: [], storeOffers: [],
  });
  const records = [record('1', 'Alpha', ['PlayStation', 'PC'], 123),
    record('2', 'Beta', ['PC'], 456), record('3', 'Gamma', ['Switch'], null)];
  const service = new GameService({ game: { findMany: async () => records } });
  const baseline = await service.getFeedGames(20);
  const ranked = await service.getFeedGames(20, [], ['PlayStation', 'Steam']);
  assert.equal(ranked.length, 3);
  for (const game of ranked) {
    const delta = game.matchScore - baseline.find(item => item.id === game.id).matchScore;
    assert.equal(delta, game.id === '3' ? 0 : 15);
  }
});
