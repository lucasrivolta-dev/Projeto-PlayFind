import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CatalogAcquisitionService,
  STEAM_QUALITY_GATE_CONFIG,
} from '../dist/modules/sync/catalog-acquisition.service.js';

function game(id, reviews, positive, overrides = {}) {
  return {
    id,
    name: `Discovery Test ${id}`,
    slug: `discovery-test-${id}`,
    game_type: 0,
    total_rating: 85,
    total_rating_count: 150,
    first_release_date: Math.floor(Date.UTC(2023, 4, 10) / 1000),
    genres: [{ name: 'Strategy' }],
    themes: [{ name: 'Sci-fi' }],
    platforms: [{ name: 'PC (Microsoft Windows)' }],
    involved_companies: [
      { developer: true, company: { name: 'Discovery Studio' } },
      { publisher: true, company: { name: 'Discovery Publisher' } },
    ],
    external_games: [{ external_game_source: { name: 'Steam' }, uid: String(500000 + id) }],
    steamReview: {
      totalReviews: reviews,
      totalPositive: Math.round(reviews * positive / 100),
      totalNegative: reviews - Math.round(reviews * positive / 100),
      positivePercentage: positive,
    },
    videos: [{ name: 'Official Launch Trailer', video_id: 'dQw4w9WgXcQ' }],
    ...overrides,
  };
}

async function plan(rawCandidates) {
  return new CatalogAcquisitionService().plan({ rawCandidates, existingCatalog: [] });
}

test('A: a lesser-known game outranks a mainstream game of similar quality', async () => {
  const manifest = await plan([game(1, 400, 92), game(2, 100000, 93)]);
  assert.deepEqual(manifest.candidates.map(c => c.igdbId), [1, 2]);
  assert.equal(manifest.candidates[0].steamExposureBand, 'HIDDEN_GEM');
  assert.equal(manifest.candidates[1].steamExposureBand, 'MAINSTREAM');
  assert(manifest.candidates[0].discoveryPriority > manifest.candidates[1].discoveryPriority);
});

test('B: low sentiment does not win merely through obscurity', async () => {
  const manifest = await plan([game(3, 110, 80), game(4, 800, 97)]);
  assert.deepEqual(manifest.candidates.map(c => c.igdbId), [4, 3]);
  assert.equal(manifest.candidates[0].steamExposureBand, 'HIDDEN_GEM');
  assert.equal(manifest.candidates[1].steamExposureBand, 'HIDDEN_GEM');
});

test('quality can overcome the bonus of a less exposed neighboring band', async () => {
  const manifest = await plan([game(15, 110, 80), game(16, 1000, 97)]);
  assert.deepEqual(manifest.candidates.map(c => c.igdbId), [16, 15]);
});

test('C: mainstream volume changes priority, never eligibility', async () => {
  const manifest = await plan([game(5, 150000, 93)]);
  assert.equal(manifest.totals.ready, 1);
  assert.equal(manifest.candidates[0].steamExposureBand, 'MAINSTREAM');
  assert.equal(manifest.candidates[0].finalEligible, true);
});

for (const [label, reviews, expected] of [
  ['D', 100, 'HIDDEN_GEM'],
  ['D upper', 999, 'HIDDEN_GEM'],
  ['E', 1000, 'DISCOVERY'],
  ['E upper', 9999, 'DISCOVERY'],
  ['F', 10000, 'ESTABLISHED'],
  ['F upper', 49999, 'ESTABLISHED'],
  ['G', 50000, 'MAINSTREAM'],
]) {
  test(`${label}: ${reviews} Steam reviews is ${expected}`, async () => {
    const manifest = await plan([game(100 + reviews, reviews, 90)]);
    assert.equal(manifest.candidates[0].steamExposureBand, expected);
  });
}

test('H: NON_STEAM uses IGDB quality, has no invented Steam band, and stays eligible', async () => {
  const nonSteam = game(6, 0, 0, { external_games: [], steamReview: undefined });
  const manifest = await plan([nonSteam, game(7, 500, 90)]);
  const candidate = manifest.candidates.find(c => c.igdbId === 6);
  assert.equal(candidate.bucket, 'READY');
  assert.equal(candidate.steamEvidenceStatus, 'NON_STEAM');
  assert.equal(candidate.steamExposureBand, undefined);
  assert.equal(candidate.discoveryPriority, Number((candidate.adjustedRating + 3).toFixed(2)));
});

test('I: shuffled input gives identical READY order and diagnostic scores', async () => {
  const pool = [
    game(8, 400, 92), game(9, 100000, 93), game(10, 800, 97),
    game(11, 10000, 90), game(12, 1000, 90),
  ];
  const first = await plan(pool);
  const shuffled = await plan([pool[4], pool[1], pool[3], pool[0], pool[2]]);
  const summary = m => m.candidates.map(c => [c.igdbId, c.steamExposureBand, c.discoveryPriority]);
  assert.deepEqual(summary(first), summary(shuffled));
});

test('J: official Steam quality gate remains 100 reviews and 80 percent', async () => {
  assert.deepEqual(STEAM_QUALITY_GATE_CONFIG, {
    minReviewCount: 100,
    minPositivePercentage: 80,
  });
  const manifest = await plan([game(13, 99, 100), game(14, 100, 80)]);
  assert.equal(manifest.buckets.rejected.find(c => c.igdbId === 13).rejectionReason, 'insufficientSteamReviews');
  assert.equal(manifest.candidates.find(c => c.igdbId === 14).steamQualityGatePassed, true);
});
