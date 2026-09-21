import test from 'node:test';
import assert from 'node:assert/strict';
import { CatalogAcquisitionService } from '../dist/modules/sync/catalog-acquisition.service.js';
import {
  formatSelectedCanary,
  parseCatalogAcquisitionApplyArgs,
  selectExactCanary,
} from '../dist/scripts/catalog-acquisition-apply-selection.js';

function candidate(igdbId, overrides = {}) {
  return {
    igdbId,
    name: `Game ${igdbId}`,
    slug: `game-${igdbId}`,
    releaseYear: 2023,
    releaseDate: new Date('2023-05-10'),
    genres: ['Strategy'],
    themes: ['Sci-fi'],
    platforms: ['PC (Microsoft Windows)'],
    studio: 'Test Studio',
    publisher: 'Test Publisher',
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
    primaryTrailerUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    disqualifiedVideoCount: 0,
    validVideoCount: 1,
    steamAppId: 200000 + igdbId,
    steamAppIds: [200000 + igdbId],
    steamReviewCount: 500,
    steamPositivePercentage: 90,
    steamExposureBand: 'HIDDEN_GEM',
    discoveryPriority: 90.5,
    steamQualityGatePassed: true,
    steamEvidenceStatus: 'STEAM_VERIFIED',
    dedupeStatus: 'NEW',
    passedQualityGate: true,
    qualityGateFailReasons: [],
    finalEligible: true,
    bucket: 'READY',
    ...overrides,
  };
}

function manifest(...evaluated) {
  const ready = evaluated.filter((item) => item.bucket === 'READY');
  return {
    evaluated,
    candidates: ready,
    buckets: { ready },
  };
}

const argsFor = (id) => ['--apply', '--limit', '1', '--igdb-id', String(id)];

async function invokeExact(pool, igdbId, apply) {
  const selected = selectExactCanary(pool, igdbId);
  return apply(pool, { limit: 1, candidates: [selected] });
}

test('A: IGDB B passes to apply as the only candidate, never READY A or C', async () => {
  const a = candidate(101);
  const b = candidate(102);
  const c = candidate(103);
  const pool = manifest(a, b, c);
  const options = parseCatalogAcquisitionApplyArgs(argsFor(102));
  const selected = selectExactCanary(pool, options.igdbId);
  assert.equal(selected, b);

  const written = [];
  let passedCandidates;
  const service = new CatalogAcquisitionService();
  const result = await invokeExact(pool, options.igdbId, (input, applyOptions) => {
    passedCandidates = applyOptions.candidates;
    return service.apply(input, {
      ...applyOptions,
      existingCatalog: [],
      gameSyncService: {
        sync: async (games) => {
          written.push(...games.map((game) => game.igdbId));
          return { inserted: games.length, linked: 0, unmatched: 0 };
        },
      },
    });
  });
  assert.deepEqual(passedCandidates, [b]);
  assert.deepEqual(written, [102]);
  assert.equal(result.processed, 1);
  assert.equal(result.inserted, 1);
});

test('B: missing IGDB ID aborts before apply, even when another READY exists', async () => {
  const pool = manifest(candidate(101));
  let applyCalls = 0;
  await assert.rejects(
    invokeExact(pool, 999, async () => {
      applyCalls++;
    }),
    /ABORT.*processed=0 writes=0/,
  );
  assert.equal(applyCalls, 0);
});

for (const [label, bucket] of [
  ['C', 'REJECTED'],
  ['D', 'ALREADY_EXISTS'],
  ['E', 'AMBIGUOUS'],
]) {
  test(`${label}: ${bucket} candidate aborts before apply`, async () => {
    const blocked = candidate(102, { bucket, finalEligible: false });
    const pool = manifest(candidate(101), blocked, candidate(103));
    let applyCalls = 0;
    await assert.rejects(
      invokeExact(pool, 102, async () => {
        applyCalls++;
      }),
      /ABORT.*processed=0 writes=0/,
    );
    assert.equal(applyCalls, 0);
    assert.deepEqual(
      pool.candidates.map((item) => item.igdbId),
      [101, 103],
    );
  });
}

test('F: explicit IGDB selection rejects any limit other than one', () => {
  assert.throws(
    () => parseCatalogAcquisitionApplyArgs(['--apply', '--igdb-id', '102', '--limit', '2']),
    /--igdb-id exige --limit 1/,
  );
  assert.throws(
    () => parseCatalogAcquisitionApplyArgs(['--apply', '--igdb-id', '102', '--limit', '0']),
    /--limit deve ser um número inteiro positivo/,
  );
});

test('G: explicit IGDB selection without limit aborts', () => {
  assert.throws(
    () => parseCatalogAcquisitionApplyArgs(['--apply', '--igdb-id', '102']),
    /requer argumento explícito --limit/,
  );
});

test('H: missing --apply aborts before a writer can be constructed', () => {
  assert.throws(
    () => parseCatalogAcquisitionApplyArgs(['--limit', '1', '--igdb-id', '102']),
    /requer flag explícita --apply/,
  );
});

test('I: selected identity report contains exactly the requested IGDB ID', () => {
  const selected = selectExactCanary(manifest(candidate(101), candidate(102)), 102);
  const report = formatSelectedCanary(selected);
  assert.match(report, /^SELECTED CANARY\n/);
  assert.match(report, /^igdbId: 102$/m);
  assert.doesNotMatch(report, /^igdbId: 101$/m);
  for (const field of [
    'name:',
    'steamAppId:',
    'slug:',
    'bucket:',
    'finalEligible:',
    'steamEvidenceStatus:',
    'steamReviewCount:',
    'steamPositivePercentage:',
    'steamExposureBand:',
    'discoveryPriority:',
  ]) {
    assert(report.includes(field), `missing report field ${field}`);
  }
});

test('J: unusable requested B never falls back to READY A or C', async () => {
  const pool = manifest(
    candidate(101),
    candidate(102, { bucket: 'REJECTED', finalEligible: false }),
    candidate(103),
  );
  let applyCalls = 0;
  await assert.rejects(
    invokeExact(pool, 102, async () => {
      applyCalls++;
    }),
    /ABORT/,
  );
  assert.equal(applyCalls, 0);
  assert.deepEqual(
    pool.candidates.map((item) => item.igdbId),
    [101, 103],
  );
});

test('an inconsistent READY candidate or failed Steam gate aborts before apply', () => {
  const notFinal = candidate(201, { finalEligible: false });
  assert.throws(() => selectExactCanary(manifest(notFinal), 201), /ABORT/);

  const failedGate = candidate(202, { steamQualityGatePassed: false });
  assert.throws(
    () => selectExactCanary(manifest(failedGate), 202),
    /Steam Quality Gate.*processed=0 writes=0/,
  );

  const lowReviews = candidate(203, { steamReviewCount: 99, steamPositivePercentage: 100 });
  assert.throws(() => selectExactCanary(manifest(lowReviews), 203), /Steam Quality Gate/);

  const lowPositive = candidate(204, { steamReviewCount: 100, steamPositivePercentage: 79 });
  assert.throws(() => selectExactCanary(manifest(lowPositive), 204), /Steam Quality Gate/);
});
