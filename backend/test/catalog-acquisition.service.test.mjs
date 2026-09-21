import test from 'node:test';
import assert from 'node:assert/strict';
import { CatalogAcquisitionService } from '../dist/modules/sync/catalog-acquisition.service.js';

function createRawGame(overrides = {}) {
  return {
    id: 1001,
    name: 'Tactical Horizon',
    slug: 'tactical-horizon',
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
    external_games: [
      { external_game_source: { name: 'Steam' }, uid: '1234560' },
    ],
    videos: [
      { name: 'Official Launch Trailer', video_id: 'dQw4w9WgXcQ' },
    ],
    ...overrides,
  };
}

test('TESTE A — PIPELINE FELIZ: Jogo elegível com tudo válido vira READY', async () => {
  const rawGame = createRawGame();
  const service = new CatalogAcquisitionService({
    loadExistingCatalog: async () => [],
  });

  const manifest = await service.plan({
    rawCandidates: [rawGame],
  });

  assert.equal(manifest.totals.discovered, 1);
  assert.equal(manifest.totals.ready, 1);
  assert.equal(manifest.totals.alreadyExists, 0);
  assert.equal(manifest.totals.ambiguous, 0);
  assert.equal(manifest.totals.rejected, 0);

  assert.equal(manifest.buckets.ready.length, 1);
  assert.equal(manifest.buckets.ready[0].igdbId, 1001);
  assert.equal(manifest.buckets.ready[0].bucket, 'READY');
  assert.equal(manifest.buckets.ready[0].finalEligible, true);
  assert.equal(manifest.candidates.length, 1);
  assert.equal(manifest.candidates[0].name, 'Tactical Horizon');
});

test('TESTE B — EXISTENTE: Candidato já presente no banco vira ALREADY_EXISTS e não READY', async () => {
  const rawGame = createRawGame();
  const existingCatalog = [
    {
      id: 'db-game-1',
      title: 'Tactical Horizon',
      slug: 'tactical-horizon',
      igdbId: 1001,
      steamAppId: 1234560,
    },
  ];

  const service = new CatalogAcquisitionService({
    loadExistingCatalog: async () => existingCatalog,
  });

  const manifest = await service.plan({
    rawCandidates: [rawGame],
  });

  assert.equal(manifest.totals.discovered, 1);
  assert.equal(manifest.totals.alreadyExists, 1);
  assert.equal(manifest.totals.ready, 0);
  assert.equal(manifest.buckets.alreadyExists.length, 1);
  assert.equal(manifest.buckets.alreadyExists[0].bucket, 'ALREADY_EXISTS');
  assert.equal(manifest.buckets.ready.length, 0);
  assert.equal(manifest.candidates.length, 0);
});

test('TESTE C — AMBIGUOUS: Candidato com conflito de identidade vira AMBIGUOUS e nunca READY', async () => {
  const rawGame = createRawGame({
    id: 2002,
    name: 'Cyber Odyssey Remaster',
    slug: 'cyber-odyssey-remaster',
  });
  // Similar title within delta [2, 12] triggers AMBIGUOUS in dedupeCandidate
  const existingCatalog = [
    {
      id: 'db-game-2',
      title: 'Cyber Odyssey',
      slug: 'cyber-odyssey',
      igdbId: 8888,
    },
  ];

  const service = new CatalogAcquisitionService({
    loadExistingCatalog: async () => existingCatalog,
  });

  const manifest = await service.plan({
    rawCandidates: [rawGame],
  });

  assert.equal(manifest.totals.discovered, 1);
  assert.equal(manifest.totals.ambiguous, 1);
  assert.equal(manifest.totals.ready, 0);
  assert.equal(manifest.buckets.ambiguous.length, 1);
  assert.equal(manifest.buckets.ambiguous[0].bucket, 'AMBIGUOUS');
  assert.equal(manifest.buckets.ready.length, 0);
  assert.equal(manifest.candidates.length, 0);
});

test('TESTE D — ELIGIBILITY: DLC/demo/mod vira REJECTED com motivo ineligible', async () => {
  const rawGame = createRawGame({
    id: 3003,
    name: 'Tactical Horizon: Bonus Mission DLC',
    slug: 'tactical-horizon-bonus-mission-dlc',
    game_type: 1, // DLC
  });

  const service = new CatalogAcquisitionService();
  const manifest = await service.plan({
    rawCandidates: [rawGame],
    existingCatalog: [],
  });

  assert.equal(manifest.totals.discovered, 1);
  assert.equal(manifest.totals.rejected, 1);
  assert.equal(manifest.totals.ready, 0);
  assert.equal(manifest.rejectionReasons.ineligible, 1);
  assert.equal(manifest.buckets.rejected[0].rejectionReason, 'ineligible');
  assert.equal(manifest.buckets.rejected[0].bucket, 'REJECTED');
});

test('TESTE E — PLATFORM: Mobile/browser-only vira REJECTED por unsupportedPlatform', async () => {
  const rawGame = createRawGame({
    id: 4004,
    platforms: [{ name: 'Android' }, { name: 'iOS' }],
  });

  const service = new CatalogAcquisitionService();
  const manifest = await service.plan({
    rawCandidates: [rawGame],
    existingCatalog: [],
  });

  assert.equal(manifest.totals.discovered, 1);
  assert.equal(manifest.totals.rejected, 1);
  assert.equal(manifest.totals.ready, 0);
  assert.equal(manifest.rejectionReasons.unsupportedPlatform, 1);
  assert.equal(manifest.buckets.rejected[0].rejectionReason, 'unsupportedPlatform');
});

test('TESTE F — METADATA: Company metadata inválida vira REJECTED sem crash', async () => {
  const rawGame = createRawGame({
    id: 5005,
    involved_companies: [
      { developer: true, company: { name: '3909', id: 999 } }, // numeric name is invalid
    ],
  });

  const service = new CatalogAcquisitionService();
  const manifest = await service.plan({
    rawCandidates: [rawGame],
    existingCatalog: [],
  });

  assert.equal(manifest.totals.discovered, 1);
  assert.equal(manifest.totals.rejected, 1);
  assert.equal(manifest.totals.ready, 0);
  assert.equal(manifest.rejectionReasons.invalidMetadata, 1);
  assert.equal(manifest.buckets.rejected[0].rejectionReason, 'invalidMetadata');
});

test('TESTE G — TRAILER: Sem trailer válido vira REJECTED por noTrailer', async () => {
  const rawNoVideos = createRawGame({
    id: 6006,
    videos: [],
  });
  const rawDisqualifiedVideo = createRawGame({
    id: 6007,
    videos: [{ name: 'Let\'s Play Episode 1 - Walkthrough', video_id: 'dQw4w9WgXcQ' }],
  });

  const service = new CatalogAcquisitionService();
  const manifest = await service.plan({
    rawCandidates: [rawNoVideos, rawDisqualifiedVideo],
    existingCatalog: [],
  });

  assert.equal(manifest.totals.discovered, 2);
  assert.equal(manifest.totals.rejected, 2);
  assert.equal(manifest.totals.ready, 0);
  assert.equal(manifest.rejectionReasons.noTrailer, 2);
  assert.equal(manifest.buckets.rejected[0].rejectionReason, 'noTrailer');
  assert.equal(manifest.buckets.rejected[1].rejectionReason, 'noTrailer');
  assert.equal(manifest.trailerSummary.noTrailer, 1);
  assert.equal(manifest.trailerSummary.disqualifiedTrailer, 1);
});

test('TESTE H — DISJUNÇÃO: ALREADY_EXISTS ∩ AMBIGUOUS ∩ REJECTED ∩ READY = ∅ e soma exata', async () => {
  const pool = [
    // 1. Ready candidate
    createRawGame({ id: 101, name: 'Game One Alpha' }),
    // 2. Ready candidate
    createRawGame({ id: 102, name: 'Game Two Beta' }),
    // 3. Existing candidate
    createRawGame({ id: 103, name: 'Game Three Gamma' }),
    // 4. Ambiguous candidate
    createRawGame({ id: 104, name: 'Delta Warriors II', slug: 'delta-warriors-ii' }),
    // 5. Ineligible DLC
    createRawGame({ id: 105, name: 'Game Five DLC Pack', game_type: 1 }),
    // 6. Unsupported platform
    createRawGame({ id: 106, name: 'Mobile Quest', platforms: [{ name: 'Android' }] }),
    // 7. Invalid company metadata
    createRawGame({ id: 107, name: 'Mystery Game', involved_companies: [{ developer: true, company: { name: 'unknown' } }] }),
    // 8. No trailer
    createRawGame({ id: 108, name: 'Silent Game', videos: [] }),
    // 9. Insufficient quality (low rating)
    createRawGame({ id: 109, name: 'Poor Game', total_rating: 45, total_rating_count: 50 }),
  ];

  const existing = [
    { id: 'db-103', title: 'Game Three Gamma', slug: 'game-three-gamma', igdbId: 103 },
    { id: 'db-104', title: 'Delta Warriors', slug: 'delta-warriors', igdbId: 9999 },
  ];

  const service = new CatalogAcquisitionService();
  const manifest = await service.plan({
    rawCandidates: pool,
    existingCatalog: existing,
  });

  const idsAlreadyExists = new Set(manifest.buckets.alreadyExists.map((c) => c.igdbId));
  const idsAmbiguous = new Set(manifest.buckets.ambiguous.map((c) => c.igdbId));
  const idsRejected = new Set(manifest.buckets.rejected.map((c) => c.igdbId));
  const idsReady = new Set(manifest.buckets.ready.map((c) => c.igdbId));

  // Verify mutually exclusive pairwise disjointness
  for (const id of idsAlreadyExists) {
    assert(!idsAmbiguous.has(id), `ID ${id} in both alreadyExists and ambiguous`);
    assert(!idsRejected.has(id), `ID ${id} in both alreadyExists and rejected`);
    assert(!idsReady.has(id), `ID ${id} in both alreadyExists and ready`);
  }
  for (const id of idsAmbiguous) {
    assert(!idsRejected.has(id), `ID ${id} in both ambiguous and rejected`);
    assert(!idsReady.has(id), `ID ${id} in both ambiguous and ready`);
  }
  for (const id of idsRejected) {
    assert(!idsReady.has(id), `ID ${id} in both rejected and ready`);
  }

  // Exact conservation of totals
  assert.equal(manifest.totals.discovered, pool.length);
  assert.equal(
    manifest.totals.alreadyExists +
      manifest.totals.ambiguous +
      manifest.totals.rejected +
      manifest.totals.ready,
    manifest.totals.discovered,
  );

  // Exact conservation of rejection reasons
  const rejectionSum = Object.values(manifest.rejectionReasons).reduce((a, b) => a + b, 0);
  assert.equal(rejectionSum, manifest.totals.rejected);
  assert.equal(manifest.totals.ready, 2);
  assert.equal(manifest.totals.alreadyExists, 1);
  assert.equal(manifest.totals.ambiguous, 1);
  assert.equal(manifest.totals.rejected, 5);
});

test('TESTE I — FALHA IGDB: Falha de discovery falha fechado sem manifest parcial', async () => {
  const failingClient = {
    search: async () => {
      throw new Error('Twitch OAuth API 503 Service Unavailable');
    },
  };

  const service = new CatalogAcquisitionService({
    igdbClient: failingClient,
  });

  await assert.rejects(
    async () => {
      await service.plan({
        clusters: ['strategy_tactical'],
        bands: ['emerging'],
        throttleMs: 0,
      });
    },
    (err) => {
      assert(err instanceof Error);
      assert(
        err.message.includes('failed closed'),
        `Error message should indicate fail-closed behavior: ${err.message}`,
      );
      return true;
    },
  );
});

test('TESTE J — DETERMINISMO: Mesmo input produz mesma classificação e mesma ordem de READY', async () => {
  const gameA = createRawGame({ id: 201, name: 'Game A', total_rating: 90, total_rating_count: 500 });
  const gameB = createRawGame({ id: 202, name: 'Game B', total_rating: 88, total_rating_count: 300 });
  const gameC = createRawGame({ id: 203, name: 'Game C', total_rating: 88, total_rating_count: 200 });
  const gameD = createRawGame({ id: 204, name: 'Game D', total_rating: 88, total_rating_count: 200 }); // Tie on rating and votes; breaks on id

  const input1 = [gameA, gameB, gameC, gameD];
  const input2 = [gameD, gameC, gameA, gameB]; // Reversed / shuffled
  const input3 = [gameB, gameD, gameC, gameA]; // Shuffled

  const service = new CatalogAcquisitionService();

  const manifest1 = await service.plan({ rawCandidates: input1, existingCatalog: [] });
  const manifest2 = await service.plan({ rawCandidates: input2, existingCatalog: [] });
  const manifest3 = await service.plan({ rawCandidates: input3, existingCatalog: [] });

  const order1 = manifest1.candidates.map((c) => c.igdbId);
  const order2 = manifest2.candidates.map((c) => c.igdbId);
  const order3 = manifest3.candidates.map((c) => c.igdbId);

  assert.deepEqual(order1, [201, 202, 203, 204]);
  assert.deepEqual(order2, order1);
  assert.deepEqual(order3, order1);

  assert.deepEqual(manifest1.totals, manifest2.totals);
  assert.deepEqual(manifest1.totals, manifest3.totals);
});
