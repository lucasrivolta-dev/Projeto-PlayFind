import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createCatalogAcquisitionBatchPlan,
  runCatalogAcquisitionBatch,
} from '../dist/modules/sync/catalog-acquisition-batch.js';
import { parseCatalogAcquisitionApplyArgs } from '../dist/scripts/catalog-acquisition-apply-selection.js';

function candidate(igdbId, overrides = {}) {
  return {
    igdbId,
    name: `Game ${igdbId}`,
    slug: `game-${igdbId}`,
    releaseYear: 2024,
    releaseDate: new Date('2024-01-01'),
    genres: ['Strategy'],
    themes: [],
    platforms: ['PC (Microsoft Windows)'],
    studio: 'Studio',
    publisher: 'Publisher',
    metadataStatus: 'VALID',
    platformStatus: 'SUPPORTED',
    effectiveRating: 85,
    effectiveVotes: 200,
    metricSource: 'TOTAL_RATING',
    adjustedRating: 84,
    exposureBand: 'discovery',
    clusters: ['strategy_tactical'],
    primaryCluster: 'strategy_tactical',
    trailerStatus: 'PLAYABLE_TRAILER',
    primaryVideoId: `video-${igdbId}`,
    primaryTrailerUrl: `https://www.youtube.com/watch?v=video-${igdbId}`,
    disqualifiedVideoCount: 0,
    validVideoCount: 1,
    steamAppId: 900000 + igdbId,
    steamAppIds: [900000 + igdbId],
    steamReviewCount: 500,
    steamPositivePercentage: 95,
    steamExposureBand: 'HIDDEN_GEM',
    discoveryPriority: 100 - igdbId / 1000,
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

function manifest(candidates) {
  return {
    candidates,
    buckets: { ready: candidates, alreadyExists: [], ambiguous: [], rejected: [] },
    evaluated: candidates,
  };
}

function successfulApply(candidate) {
  return {
    requested: 1,
    processed: 1,
    inserted: 1,
    skippedAlreadyExists: 0,
    skippedAmbiguous: 0,
    failed: 0,
    results: [
      {
        igdbId: candidate.igdbId,
        name: candidate.name,
        slug: candidate.slug,
        status: 'INSERTED',
      },
    ],
  };
}

function dependencies(options = {}) {
  let count = options.initialCount ?? 100;
  const writes = [];
  const validations = [];
  return {
    writes,
    validations,
    deps: {
      catalogCount: async () => count,
      revalidate: async (item) => {
        validations.push(item.candidate.igdbId);
        return (
          options.revalidate?.(item) ?? {
            dedupeStatus: 'NEW',
            identityMatches: true,
            finalEligible: true,
            steamQualityGatePassed: true,
          }
        );
      },
      applyCandidate: async (item) => {
        writes.push(item.candidate.igdbId);
        const custom = options.applyCandidate?.(item);
        if (custom) return custom;
        count += options.countIncrement?.(item) ?? 1;
        return successfulApply(item.candidate);
      },
      readPersisted: async (item) => ({
        identityMatches: true,
        primaryVideoId: options.persistedPrimary?.(item) ?? item.candidate.primaryVideoId,
      }),
      readApiPrimaryVideoId: async (item) =>
        options.apiPrimary?.(item) ?? item.candidate.primaryVideoId,
      readPostWriteDedupe: async (item) => options.postWriteDedupe?.(item) ?? 'ALREADY_EXISTS',
    },
  };
}

function planOf(size, limit = size) {
  const candidates = Array.from({ length: size }, (_, index) => candidate(index + 1));
  return createCatalogAcquisitionBatchPlan(manifest(candidates), {
    limit,
    catalogCountBefore: 100,
    sessionId: 'test-session',
  });
}

test('A — happy batch processes exactly five frozen READY candidates in order', async () => {
  const plan = planOf(20, 5);
  const runtime = dependencies();
  const result = await runCatalogAcquisitionBatch(plan, runtime.deps, { apply: true });

  assert.equal(result.result, 'PASS');
  assert.equal(result.processed, 5);
  assert.equal(result.inserted, 5);
  assert.deepEqual(runtime.writes, [1, 2, 3, 4, 5]);
  assert.equal(result.catalogCountAfter, 105);
});

test('B — failure on the third candidate stops before D and E', async () => {
  const plan = planOf(5);
  const runtime = dependencies({
    applyCandidate: (item) => {
      if (item.position !== 3) return undefined;
      return {
        requested: 1,
        processed: 1,
        inserted: 0,
        skippedAlreadyExists: 0,
        skippedAmbiguous: 0,
        failed: 1,
        results: [
          { ...successfulApply(item.candidate).results[0], status: 'FAILED', error: 'boom' },
        ],
      };
    },
  });
  const result = await runCatalogAcquisitionBatch(plan, runtime.deps, { apply: true });

  assert.equal(result.result, 'PARTIAL');
  assert.equal(result.processed, 3);
  assert.equal(result.inserted, 2);
  assert.equal(result.stoppedAt, 3);
  assert.deepEqual(runtime.writes, [1, 2, 3]);
});

test('C — candidate becoming ALREADY_EXISTS stops without fallback', async () => {
  const plan = planOf(5);
  const runtime = dependencies({
    revalidate: (item) => ({
      dedupeStatus: item.position === 2 ? 'ALREADY_EXISTS' : 'NEW',
      identityMatches: true,
      finalEligible: true,
      steamQualityGatePassed: true,
    }),
  });
  const result = await runCatalogAcquisitionBatch(plan, runtime.deps, { apply: true });
  assert.equal(result.stoppedAt, 2);
  assert.equal(result.skippedAlreadyExists, 1);
  assert.deepEqual(runtime.writes, [1]);
});

test('D — candidate becoming AMBIGUOUS stops immediately', async () => {
  const plan = planOf(5);
  const runtime = dependencies({
    revalidate: (item) => ({
      dedupeStatus: item.position === 2 ? 'AMBIGUOUS' : 'NEW',
      identityMatches: true,
      finalEligible: true,
      steamQualityGatePassed: true,
    }),
  });
  const result = await runCatalogAcquisitionBatch(plan, runtime.deps, { apply: true });
  assert.equal(result.stoppedAt, 2);
  assert.equal(result.skippedAmbiguous, 1);
  assert.deepEqual(runtime.writes, [1]);
});

test('E — current Steam gate failure stops before writer', async () => {
  const plan = planOf(3);
  const runtime = dependencies({
    revalidate: (item) => ({
      dedupeStatus: 'NEW',
      identityMatches: true,
      finalEligible: true,
      steamQualityGatePassed: item.position !== 1,
    }),
  });
  const result = await runCatalogAcquisitionBatch(plan, runtime.deps, { apply: true });
  assert.equal(result.result, 'FAIL');
  assert.equal(result.stoppedAt, 1);
  assert.deepEqual(runtime.writes, []);
});

test('F — persisted trailer divergence stops the batch', async () => {
  const plan = planOf(3);
  const runtime = dependencies({
    persistedPrimary: (item) => (item.position === 2 ? 'different-video' : undefined),
  });
  const result = await runCatalogAcquisitionBatch(plan, runtime.deps, { apply: true });
  assert.equal(result.stoppedAt, 2);
  assert.match(result.results[1].error, /Persisted primary trailer mismatch/);
  assert.deepEqual(runtime.writes, [1, 2]);
});

test('G — catalog count increasing by more than one stops the batch', async () => {
  const plan = planOf(3);
  const runtime = dependencies({ countIncrement: (item) => (item.position === 2 ? 2 : 1) });
  const result = await runCatalogAcquisitionBatch(plan, runtime.deps, { apply: true });
  assert.equal(result.stoppedAt, 2);
  assert.match(result.results[1].error, /Catalog count anomaly/);
  assert.deepEqual(runtime.writes, [1, 2]);
});

test('H — limit above 25 is rejected before any writer', () => {
  let writerCalls = 0;
  assert.throws(
    () => parseCatalogAcquisitionApplyArgs(['--batch', '--apply', '--limit', '26']),
    /--limit entre 1 e 25/,
  );
  assert.throws(
    () => createCatalogAcquisitionBatchPlan(manifest([]), { limit: 26, catalogCountBefore: 0 }),
    /between 1 and 25/,
  );
  assert.equal(writerCalls, 0);
});

test('I — missing --apply selects explicit batch dry-run and performs zero writes', async () => {
  const cli = parseCatalogAcquisitionApplyArgs(['--batch', '--limit', '3']);
  assert.equal(cli.batch, true);
  assert.equal(cli.apply, false);
  assert.equal(cli.dryRun, true);

  const plan = planOf(3);
  const runtime = dependencies();
  const result = await runCatalogAcquisitionBatch(plan, runtime.deps, { apply: cli.apply });
  assert.equal(result.result, 'PASS');
  assert.equal(result.inserted, 0);
  assert.deepEqual(runtime.writes, []);
});

test('J — dry-run lists and validates selected candidates without writes', async () => {
  const plan = planOf(8, 4);
  const runtime = dependencies();
  const result = await runCatalogAcquisitionBatch(plan, runtime.deps, { apply: false });
  assert.deepEqual(runtime.validations, [1, 2, 3, 4]);
  assert.deepEqual(runtime.writes, []);
  assert.deepEqual(
    result.results.map((row) => row.result),
    ['VALIDATED', 'VALIDATED', 'VALIDATED', 'VALIDATED'],
  );
  assert.equal(result.catalogCountAfter, 100);
});

test('K — same manifest freezes the same candidates in the same order', () => {
  const input = manifest(Array.from({ length: 10 }, (_, index) => candidate(index + 1)));
  const first = createCatalogAcquisitionBatchPlan(input, {
    limit: 5,
    catalogCountBefore: 100,
    sessionId: 'one',
  });
  const second = createCatalogAcquisitionBatchPlan(input, {
    limit: 5,
    catalogCountBefore: 100,
    sessionId: 'two',
  });
  assert.deepEqual(
    first.selected.map((item) => item.candidate.igdbId),
    second.selected.map((item) => item.candidate.igdbId),
  );
  assert.deepEqual(
    first.selected.map((item) => item.identityKey),
    second.selected.map((item) => item.identityKey),
  );
});

test('L — failure never replaces a frozen candidate with the next manifest item', async () => {
  const plan = planOf(6, 5);
  const runtime = dependencies({
    applyCandidate: (item) => {
      if (item.position !== 3) return undefined;
      return {
        requested: 1,
        processed: 1,
        inserted: 0,
        skippedAlreadyExists: 0,
        skippedAmbiguous: 0,
        failed: 1,
        results: [{ ...successfulApply(item.candidate).results[0], status: 'FAILED' }],
      };
    },
  });
  await runCatalogAcquisitionBatch(plan, runtime.deps, { apply: true });
  assert.deepEqual(runtime.writes, [1, 2, 3]);
  assert(!runtime.writes.includes(6));
});

test('batch CLI rejects missing/zero limits and accidental manual multi-apply', () => {
  assert.throws(() => parseCatalogAcquisitionApplyArgs(['--batch', '--apply']), /--limit/);
  assert.throws(
    () => parseCatalogAcquisitionApplyArgs(['--batch', '--apply', '--limit', '0']),
    /número inteiro positivo/,
  );
  assert.throws(
    () => parseCatalogAcquisitionApplyArgs(['--apply', '--limit', '20']),
    /seleção explícita --igdb-id/,
  );
});
