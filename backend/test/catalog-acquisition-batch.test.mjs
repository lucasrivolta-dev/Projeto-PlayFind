import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyCatalogAcquisitionDiversity,
  CATALOG_ACQUISITION_DIVERSITY_PRIORITY_TOLERANCE,
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

test('H — limit above 50 is rejected before any writer, limit 50 is accepted', () => {
  let writerCalls = 0;
  assert.throws(
    () => parseCatalogAcquisitionApplyArgs(['--batch', '--apply', '--limit', '51']),
    /--limit entre 1 e 50/,
  );
  assert.throws(
    () => createCatalogAcquisitionBatchPlan(manifest([]), { limit: 51, catalogCountBefore: 0 }),
    /between 1 and 50/,
  );
  assert.throws(
    () => parseCatalogAcquisitionApplyArgs(['--batch', '--apply', '--limit', '100']),
    /--limit entre 1 e 50/,
  );
  assert.throws(
    () => createCatalogAcquisitionBatchPlan(manifest([]), { limit: 100, catalogCountBefore: 0 }),
    /between 1 and 50/,
  );
  assert.doesNotThrow(() =>
    parseCatalogAcquisitionApplyArgs(['--batch', '--apply', '--limit', '50']),
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

test('M/A — comparable candidates interrupt a dominant fictional genre sequence', () => {
  const input = [
    candidate(1, { genres: ['Mythic'], discoveryPriority: 100 }),
    candidate(2, { genres: ['Mythic'], discoveryPriority: 99.9 }),
    candidate(3, { genres: ['Mythic'], discoveryPriority: 99.8 }),
    candidate(4, { genres: ['Logic'], discoveryPriority: 99.7 }),
    candidate(5, { genres: ['Rhythm'], discoveryPriority: 99.6 }),
  ];
  const selected = applyCatalogAcquisitionDiversity(input, 5);
  assert.equal(selected[0].igdbId, 1);
  assert.notEqual(selected[1].genres[0], 'Mythic');
  assert(selected.some((item) => item.igdbId === 2));
  assert(selected.some((item) => item.igdbId === 3));
});

test('N/B — quality guard prevents a much weaker diverse candidate from jumping ahead', () => {
  const input = [
    candidate(1, { genres: ['Mythic'], discoveryPriority: 100 }),
    candidate(2, { genres: ['Mythic'], discoveryPriority: 99.8 }),
    candidate(3, {
      genres: ['Logic'],
      discoveryPriority: 99.8 - CATALOG_ACQUISITION_DIVERSITY_PRIORITY_TOLERANCE - 0.01,
    }),
  ];
  const selected = applyCatalogAcquisitionDiversity(input, 3);
  assert.deepEqual(
    selected.slice(0, 2).map((item) => item.igdbId),
    [1, 2],
  );
});

test('O/C — diversity selection is deterministic for equivalent shuffled input', () => {
  const input = Array.from({ length: 12 }, (_, index) =>
    candidate(index + 1, {
      genres: [index % 3 === 0 ? 'Mythic' : index % 3 === 1 ? 'Logic' : 'Rhythm'],
      discoveryPriority: 100 - Math.floor(index / 2) * 0.2,
    }),
  );
  const first = applyCatalogAcquisitionDiversity(input, 10).map((item) => item.igdbId);
  const second = applyCatalogAcquisitionDiversity([...input].reverse(), 10).map(
    (item) => item.igdbId,
  );
  assert.deepEqual(first, second);
});

test('P/D — dominant-genre candidates are deferred, never hard rejected', () => {
  const input = [
    candidate(1, { genres: ['Mythic'], discoveryPriority: 100 }),
    candidate(2, { genres: ['Mythic'], discoveryPriority: 99.9 }),
    candidate(3, { genres: ['Logic'], discoveryPriority: 99.8 }),
    candidate(4, { genres: ['Mythic'], discoveryPriority: 99.7 }),
  ];
  const selected = applyCatalogAcquisitionDiversity(input, input.length);
  assert.deepEqual(new Set(selected.map((item) => item.igdbId)), new Set([1, 2, 3, 4]));
  assert(selected.findIndex((item) => item.igdbId === 2) > 0);
});

test('Q/E — every genre of a multi-genre candidate contributes to pressure', () => {
  const input = [
    candidate(1, { genres: ['Repeated'], discoveryPriority: 100 }),
    candidate(2, { genres: ['Novel', 'Repeated'], discoveryPriority: 99.9 }),
    candidate(3, { genres: ['Fresh'], discoveryPriority: 99.8 }),
  ];
  const selected = applyCatalogAcquisitionDiversity(input, 3);
  assert.deepEqual(
    selected.map((item) => item.igdbId),
    [1, 3, 2],
  );
});

test('R/F — diversity rule is generic and contains no production genre names', () => {
  const input = [
    candidate(1, { genres: ['Amber'], discoveryPriority: 100 }),
    candidate(2, { genres: ['Amber'], discoveryPriority: 99.9 }),
    candidate(3, { genres: ['Cobalt'], discoveryPriority: 99.8 }),
  ];
  assert.deepEqual(
    applyCatalogAcquisitionDiversity(input, 3).map((item) => item.genres[0]),
    ['Amber', 'Cobalt', 'Amber'],
  );
});

test('S/G — diversity supports batch limits 1, 5, 10, 25 and 50', () => {
  const input = Array.from({ length: 60 }, (_, index) =>
    candidate(index + 1, {
      genres: [`Genre ${index % 5}`],
      discoveryPriority: 100 - index * 0.05,
    }),
  );
  for (const limit of [1, 5, 10, 25, 50]) {
    const selected = applyCatalogAcquisitionDiversity(input, limit);
    assert.equal(selected.length, limit);
    assert.equal(new Set(selected.map((item) => item.igdbId)).size, limit);
  }
});

test('T/H — representative top-25 fixture reduces concentration without material score loss', () => {
  const input = Array.from({ length: 35 }, (_, index) => {
    const baseGenre =
      index < 25 && ![4, 9, 14, 19].includes(index) ? 'Mythic' : `Diverse ${index % 7}`;
    return candidate(index + 1, {
      genres: [baseGenre, ...(index % 6 === 0 ? ['Secondary'] : [])],
      discoveryPriority: 100 - index * 0.1,
    });
  });
  const before = input.slice(0, 25);
  const after = applyCatalogAcquisitionDiversity(input, 25);
  const countGenre = (items, genre) => items.filter((item) => item.genres.includes(genre)).length;
  const average = (items) =>
    items.reduce((sum, item) => sum + item.discoveryPriority, 0) / items.length;

  assert.equal(countGenre(before, 'Mythic'), 21);
  assert(countGenre(after, 'Mythic') < 21);
  assert(average(after) >= average(before) - 1);
  assert(
    after.some((item) => item.igdbId === 1),
    'strongest candidate must remain selected',
  );
  assert(
    before.slice(0, 17).every((item) => after.some((selected) => selected.igdbId === item.igdbId)),
    'the quality head must remain inside a batch of 25',
  );
});

test('U — batch 50 dry-run validates exactly 50 candidates with zero writes', async () => {
  const plan = planOf(60, 50);
  const runtime = dependencies();
  const result = await runCatalogAcquisitionBatch(plan, runtime.deps, { apply: false });

  assert.equal(result.result, 'PASS');
  assert.equal(result.processed, 50);
  assert.equal(result.inserted, 0);
  assert.equal(runtime.writes.length, 0);
  assert.equal(runtime.validations.length, 50);
  assert.equal(result.results.length, 50);
  assert(result.results.every((r) => r.result === 'VALIDATED'));
});

test('V — batch 50 stops at candidate 27 on failure, remaining 28-50 never execute', async () => {
  const plan = planOf(60, 50);
  const runtime = dependencies({
    applyCandidate: (item) => {
      if (item.position !== 27) return undefined;
      return {
        requested: 1,
        processed: 1,
        inserted: 0,
        skippedAlreadyExists: 0,
        skippedAmbiguous: 0,
        failed: 1,
        results: [
          { ...successfulApply(item.candidate).results[0], status: 'FAILED', error: 'candidate 27 error' },
        ],
      };
    },
  });
  const result = await runCatalogAcquisitionBatch(plan, runtime.deps, { apply: true });

  assert.equal(result.result, 'PARTIAL');
  assert.equal(result.processed, 27);
  assert.equal(result.inserted, 26);
  assert.equal(result.failed, 1);
  assert.equal(result.stoppedAt, 27);
  assert.deepEqual(
    runtime.writes,
    Array.from({ length: 27 }, (_, i) => i + 1),
  );
  assert(!runtime.writes.includes(28));
  assert(!runtime.writes.includes(50));
});

test('W — batch 50 snapshot plan freezes exactly 50 candidates deterministically', () => {
  const candidates = Array.from({ length: 70 }, (_, index) => candidate(index + 1));
  const plan1 = createCatalogAcquisitionBatchPlan(manifest(candidates), {
    limit: 50,
    catalogCountBefore: 454,
    sessionId: 'session-a',
  });
  const plan2 = createCatalogAcquisitionBatchPlan(manifest(candidates), {
    limit: 50,
    catalogCountBefore: 454,
    sessionId: 'session-b',
  });

  assert.equal(plan1.selected.length, 50);
  assert.equal(plan2.selected.length, 50);
  assert.deepEqual(
    plan1.selected.map((item) => item.candidate.igdbId),
    plan2.selected.map((item) => item.candidate.igdbId),
  );
  assert.deepEqual(
    plan1.selected.map((item) => item.identityKey),
    plan2.selected.map((item) => item.identityKey),
  );
});

test('X — batch 50 enforces Steam Quality Gate and trailer contract fail-closed', async () => {
  const plan = planOf(60, 50);

  // Steam gate failure at item 10 stops batch before writer 10
  const steamFailRuntime = dependencies({
    revalidate: (item) => ({
      dedupeStatus: 'NEW',
      identityMatches: true,
      finalEligible: true,
      steamQualityGatePassed: item.position !== 10,
    }),
  });
  const steamResult = await runCatalogAcquisitionBatch(plan, steamFailRuntime.deps, { apply: true });
  assert.equal(steamResult.result, 'PARTIAL');
  assert.equal(steamResult.stoppedAt, 10);
  assert.equal(steamFailRuntime.writes.length, 9);

  // Trailer mismatch at item 15 stops batch immediately
  const trailerMismatchRuntime = dependencies({
    persistedPrimary: (item) => (item.position === 15 ? 'divergent-trailer' : undefined),
  });
  const trailerResult = await runCatalogAcquisitionBatch(plan, trailerMismatchRuntime.deps, { apply: true });
  assert.equal(trailerResult.result, 'PARTIAL');
  assert.equal(trailerResult.stoppedAt, 15);
  assert.equal(trailerMismatchRuntime.writes.length, 15);
  assert.match(trailerResult.results[14].error, /Persisted primary trailer mismatch/);
});
