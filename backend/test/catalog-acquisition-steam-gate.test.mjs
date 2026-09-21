import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CatalogAcquisitionService,
  STEAM_QUALITY_GATE_CONFIG,
} from '../dist/modules/sync/catalog-acquisition.service.js';

function createRawCandidate(overrides = {}) {
  const id = overrides.id ?? 1001;
  const isSteam = overrides.hasSteam !== undefined ? overrides.hasSteam : true;
  const external_games = isSteam
    ? [{ external_game_source: { name: 'Steam' }, uid: String(overrides.steamAppId ?? 200000 + id) }]
    : [];

  return {
    id,
    name: overrides.name ?? `Test Game ${id}`,
    slug: overrides.slug ?? `test-game-${id}`,
    game_type: 0,
    total_rating: 85,
    total_rating_count: 150,
    first_release_date: Math.floor(new Date('2023-05-10').getTime() / 1000),
    genres: [{ name: 'Strategy' }],
    themes: [{ name: 'Sci-fi' }],
    platforms: [{ name: 'PC (Microsoft Windows)' }],
    involved_companies: [
      { developer: true, company: { name: 'Indie Studio A', id: 101 } },
      { publisher: true, company: { name: 'Indie Publisher B', id: 102 } },
    ],
    external_games,
    videos: [
      { name: 'Official Launch Trailer', video_id: 'dQw4w9WgXcQ' },
    ],
    ...overrides,
  };
}

test('TESTE A — 99 reviews / 100% positivas: REJECTED insufficientSteamReviews', async () => {
  const rawGame = createRawCandidate({
    id: 101,
    name: 'Game 99 Reviews',
    steamAppId: 10100,
    steamReview: {
      totalReviews: 99,
      totalPositive: 99,
      totalNegative: 0,
      positivePercentage: 100,
      reviewScoreDesc: 'Positive',
    },
  });

  const service = new CatalogAcquisitionService({ loadExistingCatalog: async () => [] });
  const manifest = await service.plan({ rawCandidates: [rawGame] });

  assert.equal(manifest.totals.ready, 0);
  assert.equal(manifest.totals.rejected, 1);
  assert.equal(manifest.rejectionReasons.insufficientSteamReviews, 1);

  const candidate = manifest.buckets.rejected[0];
  assert.equal(candidate.bucket, 'REJECTED');
  assert.equal(candidate.rejectionReason, 'insufficientSteamReviews');
  assert.equal(candidate.steamQualityGatePassed, false);
  assert.equal(candidate.steamEvidenceStatus, 'STEAM_VERIFIED');
  assert.equal(candidate.steamReviewCount, 99);
  assert.equal(candidate.steamPositivePercentage, 100);
});

test('TESTE B — 100 reviews / 80% positivas: PASS Steam quality gate -> READY', async () => {
  const rawGame = createRawCandidate({
    id: 102,
    name: 'Game 100 Reviews 80 Percent',
    steamAppId: 10200,
    steamReview: {
      totalReviews: 100,
      totalPositive: 80,
      totalNegative: 20,
      positivePercentage: 80,
      reviewScoreDesc: 'Very Positive',
    },
  });

  const service = new CatalogAcquisitionService({ loadExistingCatalog: async () => [] });
  const manifest = await service.plan({ rawCandidates: [rawGame] });

  assert.equal(manifest.totals.ready, 1);
  assert.equal(manifest.totals.rejected, 0);

  const candidate = manifest.buckets.ready[0];
  assert.equal(candidate.bucket, 'READY');
  assert.equal(candidate.steamQualityGatePassed, true);
  assert.equal(candidate.steamEvidenceStatus, 'STEAM_VERIFIED');
  assert.equal(candidate.steamReviewCount, 100);
  assert.equal(candidate.steamPositivePercentage, 80);
});

test('TESTE C — 100 reviews / 79% positivas: REJECTED poorSteamRating', async () => {
  const rawGame = createRawCandidate({
    id: 103,
    name: 'Game 100 Reviews 79 Percent',
    steamAppId: 10300,
    steamReview: {
      totalReviews: 100,
      totalPositive: 79,
      totalNegative: 21,
      positivePercentage: 79,
      reviewScoreDesc: 'Mostly Positive',
    },
  });

  const service = new CatalogAcquisitionService({ loadExistingCatalog: async () => [] });
  const manifest = await service.plan({ rawCandidates: [rawGame] });

  assert.equal(manifest.totals.ready, 0);
  assert.equal(manifest.totals.rejected, 1);
  assert.equal(manifest.rejectionReasons.poorSteamRating, 1);

  const candidate = manifest.buckets.rejected[0];
  assert.equal(candidate.bucket, 'REJECTED');
  assert.equal(candidate.rejectionReason, 'poorSteamRating');
  assert.equal(candidate.steamQualityGatePassed, false);
  assert.equal(candidate.steamEvidenceStatus, 'STEAM_VERIFIED');
  assert.equal(candidate.steamReviewCount, 100);
  assert.equal(candidate.steamPositivePercentage, 79);
});

test('TESTE D — 500 reviews / 95% positivas: PASS -> READY', async () => {
  const rawGame = createRawCandidate({
    id: 104,
    name: 'Game 500 Reviews 95 Percent',
    steamAppId: 10400,
    steamReview: {
      totalReviews: 500,
      totalPositive: 475,
      totalNegative: 25,
      positivePercentage: 95,
      reviewScoreDesc: 'Overwhelmingly Positive',
    },
  });

  const service = new CatalogAcquisitionService({ loadExistingCatalog: async () => [] });
  const manifest = await service.plan({ rawCandidates: [rawGame] });

  assert.equal(manifest.totals.ready, 1);
  assert.equal(manifest.totals.rejected, 0);

  const candidate = manifest.buckets.ready[0];
  assert.equal(candidate.bucket, 'READY');
  assert.equal(candidate.steamQualityGatePassed, true);
  assert.equal(candidate.steamEvidenceStatus, 'STEAM_VERIFIED');
  assert.equal(candidate.steamReviewCount, 500);
  assert.equal(candidate.steamPositivePercentage, 95);
});

test('TESTE E — 10 reviews / 100% positivas: REJECTED insufficientSteamReviews', async () => {
  const rawGame = createRawCandidate({
    id: 105,
    name: 'Game 10 Reviews 100 Percent',
    steamAppId: 10500,
    steamReview: {
      totalReviews: 10,
      totalPositive: 10,
      totalNegative: 0,
      positivePercentage: 100,
      reviewScoreDesc: 'Positive',
    },
  });

  const service = new CatalogAcquisitionService({ loadExistingCatalog: async () => [] });
  const manifest = await service.plan({ rawCandidates: [rawGame] });

  assert.equal(manifest.totals.ready, 0);
  assert.equal(manifest.totals.rejected, 1);
  assert.equal(manifest.rejectionReasons.insufficientSteamReviews, 1);

  const candidate = manifest.buckets.rejected[0];
  assert.equal(candidate.bucket, 'REJECTED');
  assert.equal(candidate.rejectionReason, 'insufficientSteamReviews');
  assert.equal(candidate.steamQualityGatePassed, false);
});

test('TESTE F — 10.000 reviews / 40% positivas: REJECTED poorSteamRating', async () => {
  const rawGame = createRawCandidate({
    id: 106,
    name: 'Game 10000 Reviews 40 Percent',
    steamAppId: 10600,
    steamReview: {
      totalReviews: 10000,
      totalPositive: 4000,
      totalNegative: 6000,
      positivePercentage: 40,
      reviewScoreDesc: 'Mixed',
    },
  });

  const service = new CatalogAcquisitionService({ loadExistingCatalog: async () => [] });
  const manifest = await service.plan({ rawCandidates: [rawGame] });

  assert.equal(manifest.totals.ready, 0);
  assert.equal(manifest.totals.rejected, 1);
  assert.equal(manifest.rejectionReasons.poorSteamRating, 1);

  const candidate = manifest.buckets.rejected[0];
  assert.equal(candidate.bucket, 'REJECTED');
  assert.equal(candidate.rejectionReason, 'poorSteamRating');
  assert.equal(candidate.steamQualityGatePassed, false);
});

test('TESTE G — Jogo legítimo sem Steam: não inventa reviews e não rejeita apenas pela ausência da Steam', async () => {
  const consoleExclusive = createRawCandidate({
    id: 107,
    name: 'Console Legend Exclusive',
    hasSteam: false,
    platforms: [{ name: 'PlayStation 5' }, { name: 'Nintendo Switch' }],
  });

  const service = new CatalogAcquisitionService({ loadExistingCatalog: async () => [] });
  const manifest = await service.plan({ rawCandidates: [consoleExclusive] });

  assert.equal(manifest.totals.ready, 1);
  assert.equal(manifest.totals.rejected, 0);

  const candidate = manifest.buckets.ready[0];
  assert.equal(candidate.bucket, 'READY');
  assert.equal(candidate.steamEvidenceStatus, 'NON_STEAM');
  assert.equal(candidate.steamAppId, undefined);
  assert.equal(candidate.steamReviewCount, undefined);
  assert.equal(candidate.steamPositivePercentage, undefined);
  assert.equal(candidate.steamQualityGatePassed, undefined);
});

test('TESTE H — Jogo com Steam App ID mas sem evidência disponível: falha fechado como steamEvidenceUnavailable', async () => {
  const rawGame = createRawCandidate({
    id: 108,
    name: 'Steam Game Without Review Data',
    steamAppId: 10800,
    // No steamReview supplied, and provider returns undefined
  });

  const service = new CatalogAcquisitionService({
    loadExistingCatalog: async () => [],
    steamReviewProvider: async () => undefined,
  });
  const manifest = await service.plan({ rawCandidates: [rawGame] });

  assert.equal(manifest.totals.ready, 0);
  assert.equal(manifest.totals.rejected, 1);
  assert.equal(manifest.rejectionReasons.steamEvidenceUnavailable, 1);

  const candidate = manifest.buckets.rejected[0];
  assert.equal(candidate.bucket, 'REJECTED');
  assert.equal(candidate.rejectionReason, 'steamEvidenceUnavailable');
  assert.equal(candidate.steamEvidenceStatus, 'STEAM_EVIDENCE_UNAVAILABLE');
  assert.equal(candidate.steamQualityGatePassed, false);
  assert.equal(candidate.steamReviewCount, undefined);
  assert.equal(candidate.steamPositivePercentage, undefined);
});

test('TESTE I — apply() defesa em profundidade: candidato Steam abaixo do gate não chama GameSyncService', async () => {
  let syncCalled = false;
  const fakeSyncService = {
    sync: async () => {
      syncCalled = true;
      return { inserted: 1, linked: 0, unmatched: 0 };
    },
  };

  const service = new CatalogAcquisitionService();

  // Craft a manifest containing a candidate below steam quality gate
  const failingCandidate = {
    igdbId: 999,
    name: 'Unqualified Game',
    slug: 'unqualified-game',
    releaseYear: 2023,
    releaseDate: new Date('2023-05-10'),
    genres: ['Strategy'],
    themes: ['Sci-fi'],
    platforms: ['PC (Microsoft Windows)'],
    studio: 'Studio',
    publisher: 'Publisher',
    metadataStatus: 'VALID',
    platformStatus: 'SUPPORTED',
    effectiveRating: 85,
    effectiveVotes: 150,
    metricSource: 'TOTAL_RATING',
    adjustedRating: 82.5,
    exposureBand: 'discovery',
    clusters: ['strategy_tactical'],
    primaryCluster: 'strategy_tactical',
    trailerStatus: 'PLAYABLE_TRAILER',
    primaryVideoId: 'dQw4w9WgXcQ',
    disqualifiedVideoCount: 0,
    validVideoCount: 1,
    steamAppId: 99900,
    steamAppIds: [99900],
    steamReviewCount: 50,
    steamPositivePercentage: 90,
    steamQualityGatePassed: false,
    steamEvidenceStatus: 'STEAM_VERIFIED',
    dedupeStatus: 'NEW',
    passedQualityGate: true,
    qualityGateFailReasons: [],
    finalEligible: true,
    bucket: 'READY',
  };

  const manifest = {
    totals: { discovered: 1, alreadyExists: 0, ambiguous: 0, rejected: 0, ready: 1 },
    rejectionReasons: {
      unsupportedPlatform: 0,
      invalidMetadata: 0,
      ineligible: 0,
      insufficientQuality: 0,
      noTrailer: 0,
      insufficientSteamReviews: 0,
      poorSteamRating: 0,
      steamEvidenceUnavailable: 0,
    },
    buckets: { alreadyExists: [], ambiguous: [], rejected: [], ready: [failingCandidate] },
    candidates: [failingCandidate],
    byBand: { emerging: [], discovery: [failingCandidate], mid_tail: [], older_gems: [] },
    byCluster: {
      strategy_tactical: [failingCandidate],
      simulation: [],
      racing: [],
      horror: [],
      puzzle_point_click: [],
      niche_rpg: [],
      platform_action_indie: [],
    },
    funnelByCluster: {},
    trailerSummary: { playableTrailer: 1, disqualifiedTrailer: 0, noTrailer: 0 },
    gateSummary: { passedQualityGate: 1, failedQualityGate: 0, unsupportedPlatform: 0, invalidMetadata: 0 },
    evaluated: [failingCandidate],
  };

  const result = await service.apply(manifest, {
    limit: 1,
    gameSyncService: fakeSyncService,
    existingCatalog: [],
  });

  assert.equal(syncCalled, false, 'GameSyncService.sync must NOT be called for candidate below Steam quality gate');
  assert.equal(result.inserted, 0);
  assert.equal(result.failed, 1);
  assert.equal(result.results[0].status, 'FAILED');
  assert.match(result.results[0].error, /failed Steam quality gate/i);
});

test('TESTE J — Limites exatos: 100 reviews e 80.0% positivas passam perfeitamente', async () => {
  assert.equal(STEAM_QUALITY_GATE_CONFIG.minReviewCount, 100);
  assert.equal(STEAM_QUALITY_GATE_CONFIG.minPositivePercentage, 80.0);

  const exactBoundaryGame = createRawCandidate({
    id: 110,
    name: 'Exact Boundary Game',
    steamAppId: 11000,
    steamReview: {
      totalReviews: 100,
      totalPositive: 80,
      totalNegative: 20,
      positivePercentage: 80.0,
      reviewScoreDesc: 'Positive',
    },
  });

  const service = new CatalogAcquisitionService({ loadExistingCatalog: async () => [] });
  const manifest = await service.plan({ rawCandidates: [exactBoundaryGame] });

  assert.equal(manifest.totals.ready, 1);
  assert.equal(manifest.totals.rejected, 0);
  assert.equal(manifest.buckets.ready[0].steamQualityGatePassed, true);
  assert.equal(manifest.buckets.ready[0].steamReviewCount, 100);
  assert.equal(manifest.buckets.ready[0].steamPositivePercentage, 80.0);
  assert.equal(manifest.buckets.ready[0].bucket, 'READY');
});

test('TESTE 1 — payload Steam válido com total_reviews = 0 vira insufficientSteamReviews com zero real', async () => {
  const zeroReviewGame = createRawCandidate({
    id: 111,
    name: 'Real Zero Reviews Game',
    steamAppId: 11100,
    steamReview: {
      totalReviews: 0,
      totalPositive: 0,
      totalNegative: 0,
      positivePercentage: 0,
      reviewScoreDesc: 'No user reviews',
    },
  });

  const service = new CatalogAcquisitionService({ loadExistingCatalog: async () => [] });
  const manifest = await service.plan({ rawCandidates: [zeroReviewGame] });

  assert.equal(manifest.totals.ready, 0);
  assert.equal(manifest.totals.rejected, 1);
  assert.equal(manifest.rejectionReasons.insufficientSteamReviews, 1);

  const candidate = manifest.buckets.rejected[0];
  assert.equal(candidate.bucket, 'REJECTED');
  assert.equal(candidate.rejectionReason, 'insufficientSteamReviews');
  assert.equal(candidate.steamReviewCount, 0, 'Zero real deve ser preservado como 0');
  assert.equal(candidate.steamPositivePercentage, 0);
  assert.equal(candidate.steamEvidenceStatus, 'STEAM_VERIFIED');
  assert.equal(candidate.steamQualityGatePassed, false);
});

test('TESTE 2 — objeto Steam sem campo de reviews vira steamEvidenceUnavailable e NÃO zero', async () => {
  const invalidReviewObjGame = createRawCandidate({
    id: 112,
    name: 'Malformed Review Object Game',
    steamAppId: 11200,
    steamReview: {}, // Missing totalReviews field entirely
  });

  const service = new CatalogAcquisitionService({ loadExistingCatalog: async () => [] });
  const manifest = await service.plan({ rawCandidates: [invalidReviewObjGame] });

  assert.equal(manifest.totals.ready, 0);
  assert.equal(manifest.totals.rejected, 1);
  assert.equal(manifest.rejectionReasons.steamEvidenceUnavailable, 1);

  const candidate = manifest.buckets.rejected[0];
  assert.equal(candidate.bucket, 'REJECTED');
  assert.equal(candidate.rejectionReason, 'steamEvidenceUnavailable');
  assert.equal(candidate.steamReviewCount, undefined, 'Missing review field MUST be undefined, not 0');
  assert.equal(candidate.steamPositivePercentage, undefined);
  assert.equal(candidate.steamEvidenceStatus, 'STEAM_EVIDENCE_UNAVAILABLE');
  assert.equal(candidate.steamQualityGatePassed, false);
});

test('TESTE 3 — snapshot antigo sem review evidence vira steamEvidenceUnavailable e NÃO zero', async () => {
  const legacySnapshotGame = createRawCandidate({
    id: 113,
    name: 'Legacy Snapshot Candidate',
    steamAppId: 11300,
    // Neither raw.steamReview nor steamReviews map entry provided
  });

  const service = new CatalogAcquisitionService({ loadExistingCatalog: async () => [] });
  const manifest = await service.plan({
    rawCandidates: [legacySnapshotGame],
    steamReviews: {}, // Empty cache
  });

  assert.equal(manifest.totals.ready, 0);
  assert.equal(manifest.totals.rejected, 1);
  assert.equal(manifest.rejectionReasons.steamEvidenceUnavailable, 1);

  const candidate = manifest.buckets.rejected[0];
  assert.equal(candidate.bucket, 'REJECTED');
  assert.equal(candidate.rejectionReason, 'steamEvidenceUnavailable');
  assert.equal(candidate.steamReviewCount, undefined, 'Legacy snapshot without evidence must remain undefined');
  assert.equal(candidate.steamPositivePercentage, undefined);
  assert.equal(candidate.steamEvidenceStatus, 'STEAM_EVIDENCE_UNAVAILABLE');
});

test('TESTE 4 — provider lança erro (rede/timeout) vira steamEvidenceUnavailable e NÃO zero', async () => {
  const errorGame = createRawCandidate({
    id: 114,
    name: 'Network Error Game',
    steamAppId: 11400,
  });

  const service = new CatalogAcquisitionService({
    loadExistingCatalog: async () => [],
    steamReviewProvider: async () => {
      throw new Error('HTTP 503 Service Unavailable / Timeout');
    },
  });

  const manifest = await service.plan({ rawCandidates: [errorGame] });

  assert.equal(manifest.totals.ready, 0);
  assert.equal(manifest.totals.rejected, 1);
  assert.equal(manifest.rejectionReasons.steamEvidenceUnavailable, 1);

  const candidate = manifest.buckets.rejected[0];
  assert.equal(candidate.bucket, 'REJECTED');
  assert.equal(candidate.rejectionReason, 'steamEvidenceUnavailable');
  assert.equal(candidate.steamReviewCount, undefined, 'Provider error must yield undefined review count');
  assert.equal(candidate.steamPositivePercentage, undefined);
  assert.equal(candidate.steamEvidenceStatus, 'STEAM_EVIDENCE_UNAVAILABLE');
});

test('TESTE 5 — payload válido com 99 / 100% vira insufficientSteamReviews', async () => {
  const ninetyNineGame = createRawCandidate({
    id: 115,
    name: 'Almost Made It 99 Reviews',
    steamAppId: 11500,
    steamReview: {
      totalReviews: 99,
      totalPositive: 99,
      totalNegative: 0,
      positivePercentage: 100,
      reviewScoreDesc: 'Positive',
    },
  });

  const service = new CatalogAcquisitionService({ loadExistingCatalog: async () => [] });
  const manifest = await service.plan({ rawCandidates: [ninetyNineGame] });

  assert.equal(manifest.totals.ready, 0);
  assert.equal(manifest.totals.rejected, 1);
  assert.equal(manifest.rejectionReasons.insufficientSteamReviews, 1);
  assert.equal(manifest.buckets.rejected[0].rejectionReason, 'insufficientSteamReviews');
  assert.equal(manifest.buckets.rejected[0].steamReviewCount, 99);
  assert.equal(manifest.buckets.rejected[0].steamPositivePercentage, 100);
});

test('TESTE 6 — payload válido com 100 / 80% vira PASS (READY)', async () => {
  const passingGame = createRawCandidate({
    id: 116,
    name: 'Passing Boundary Game',
    steamAppId: 11600,
    steamReview: {
      totalReviews: 100,
      totalPositive: 80,
      totalNegative: 20,
      positivePercentage: 80.0,
      reviewScoreDesc: 'Positive',
    },
  });

  const service = new CatalogAcquisitionService({ loadExistingCatalog: async () => [] });
  const manifest = await service.plan({ rawCandidates: [passingGame] });

  assert.equal(manifest.totals.ready, 1);
  assert.equal(manifest.totals.rejected, 0);
  assert.equal(manifest.buckets.ready[0].bucket, 'READY');
  assert.equal(manifest.buckets.ready[0].steamQualityGatePassed, true);
  assert.equal(manifest.buckets.ready[0].steamReviewCount, 100);
  assert.equal(manifest.buckets.ready[0].steamPositivePercentage, 80.0);
});

