import test from 'node:test';
import assert from 'node:assert/strict';
import { mapIgdbGame } from '../dist/modules/integrations/igdb/igdb.mapper.js';
import { CatalogAcquisitionService, candidateToNormalizedGame } from '../dist/modules/sync/catalog-acquisition.service.js';
import { GameSyncService } from '../dist/modules/sync/game-sync.service.js';
import { GameService } from '../dist/modules/games/game.service.js';
import { PrismaGameRepository } from '../dist/modules/games/prisma-game.repository.js';

const videos = [
  { video_id: '9EoytHy0uyg', name: 'Trailer' },
  { video_id: 'Xt-BR3J8hRg', name: 'Announcement Trailer' },
  { video_id: 'QyTZjdBG3jo', name: 'Release Date Trailer' },
];
const expected = 'Xt-BR3J8hRg';
const raw = {
  id: 141273,
  name: 'Tukoni: Forest Keepers',
  slug: 'tukoni-forest-keepers',
  summary: 'A puzzle adventure in a magical forest.',
  cover: { url: '//images.igdb.com/igdb/image/upload/t_thumb/coa6c9.jpg' },
  platforms: [{ name: 'PC (Microsoft Windows)' }],
  videos,
};

test('planning and mapping choose the same named trailer regardless of IGDB order', async () => {
  for (const variant of [videos, [...videos].reverse(), [videos[2], videos[0], videos[1]]]) {
    const game = { ...raw, videos: variant };
    const manifest = await new CatalogAcquisitionService().plan({ rawCandidates: [game], existingCatalog: [], steamReviews: {} });
    const candidate = manifest.evaluated[0];
    const normalized = candidateToNormalizedGame(candidate);
    assert.equal(candidate.primaryVideoId, expected);
    assert.equal(candidate.primaryTrailerUrl, `https://www.youtube.com/watch?v=${expected}`);
    assert.equal(normalized.trailerDetails[0].videoId, candidate.primaryVideoId);
    assert.deepEqual(normalized.trailerDetails.map((trailer) => trailer.videoId),
      mapIgdbGame(game).trailerDetails.map((trailer) => trailer.videoId));
  }
});

test('equal-ranked videos and duplicate IDs have a stable order', () => {
  const pair = [
    { video_id: 'bbbbbbbbbbb', name: 'Trailer' },
    { video_id: 'aaaaaaaaaaa', name: 'Trailer' },
    { video_id: 'aaaaaaaaaaa', name: 'Announcement Trailer' },
  ];
  const first = mapIgdbGame({ ...raw, videos: pair });
  const reversed = mapIgdbGame({ ...raw, videos: [...pair].reverse() });
  assert.deepEqual(first.trailerDetails, reversed.trailerDetails);
  assert.deepEqual(first.trailerDetails.map((trailer) => trailer.videoId), ['aaaaaaaaaaa', 'bbbbbbbbbbb']);
});

test('Tukoni fixture plan, normalization, and sync preserve one primary ID without DB access', async () => {
  const manifest = await new CatalogAcquisitionService().plan({ rawCandidates: [raw], existingCatalog: [], steamReviews: {} });
  const candidate = manifest.evaluated[0];
  const normalized = candidateToNormalizedGame(candidate);
  const written = [];
  const repository = {
    findCandidates: async () => [],
    upsertByExternalId: async (game) => { written.push(game); return game; },
  };
  const result = await new GameSyncService(repository, () => {}).sync([normalized]);
  assert.equal(result.inserted, 1);
  assert.equal(candidate.primaryVideoId, expected);
  assert.equal(written[0].trailerDetails[0].videoId, expected);
  assert.equal(written[0].trailers[0], candidate.primaryTrailerUrl);
});

test('repository and API break equal media sortOrder ties by id', async () => {
  let repositoryQuery;
  const repository = new PrismaGameRepository({ game: { findMany: async (query) => { repositoryQuery = query; return []; } } });
  await repository.findCandidates({ title: 'Tukoni: Forest Keepers', slug: 'tukoni-forest-keepers', igdbId: 141273 });
  assert.deepEqual(repositoryQuery.include.media.orderBy, [{ sortOrder: 'asc' }, { id: 'asc' }]);

  let apiQuery;
  const service = new GameService({ game: { findUnique: async (query) => { apiQuery = query; return null; } } });
  assert.equal(await service.getGameById('tukoni-forest-keepers'), null);
  assert.deepEqual(apiQuery.include.media.orderBy, [{ sortOrder: 'asc' }, { id: 'asc' }]);
});
