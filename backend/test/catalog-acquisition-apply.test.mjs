import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CatalogAcquisitionService,
} from '../dist/modules/sync/catalog-acquisition.service.js';
import { GameSyncService } from '../dist/modules/sync/game-sync.service.js';

class FakeGameRepository {
  constructor(initial = []) {
    this.games = [...initial];
  }
  async findCandidates(game) {
    return this.games.filter(
      (g) =>
        (game.igdbId !== undefined && g.igdbId === game.igdbId) ||
        (game.steamAppId !== undefined && g.steamAppId === game.steamAppId) ||
        g.slug === game.slug ||
        g.title === game.title,
    );
  }
  async upsertByExternalId(game) {
    const idx = this.games.findIndex((g) => g.igdbId === game.igdbId);
    const stored = { id: `id-${game.igdbId ?? this.games.length + 1}`, ...game };
    if (idx >= 0) {
      this.games[idx] = stored;
    } else {
      this.games.push(stored);
    }
    return stored;
  }
  async linkExternalIds() {}
  async markSynced() {}
}

function createCandidate(overrides = {}) {
  const id = overrides.igdbId ?? 1001;
  const steamId = overrides.steamAppId !== undefined ? overrides.steamAppId : id * 10;
  const name = overrides.name ?? `Game ${id}`;
  const slug = overrides.slug ?? `game-${id}`;
  return {
    igdbId: id,
    name,
    slug,
    releaseYear: 2023,
    releaseDate: new Date('2023-05-10'),
    genres: ['Strategy'],
    themes: ['Sci-fi'],
    platforms: ['PC (Microsoft Windows)'],
    studio: 'Indie Studio A',
    publisher: 'Indie Publisher B',
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
    steamAppId: steamId,
    steamAppIds: steamId ? [steamId] : [],
    dedupeStatus: 'NEW',
    passedQualityGate: true,
    qualityGateFailReasons: [],
    finalEligible: true,
    bucket: 'READY',
    ...overrides,
  };
}

function createManifest(readyCandidates = [], otherBuckets = {}) {
  const ready = readyCandidates;
  const alreadyExists = otherBuckets.alreadyExists ?? [];
  const ambiguous = otherBuckets.ambiguous ?? [];
  const rejected = otherBuckets.rejected ?? [];
  const allEvaluated = [...ready, ...alreadyExists, ...ambiguous, ...rejected];

  return {
    totals: {
      discovered: allEvaluated.length,
      alreadyExists: alreadyExists.length,
      ambiguous: ambiguous.length,
      rejected: rejected.length,
      ready: ready.length,
    },
    rejectionReasons: {
      unsupportedPlatform: 0,
      invalidMetadata: 0,
      ineligible: 0,
      insufficientQuality: 0,
      noTrailer: 0,
    },
    buckets: {
      alreadyExists,
      ambiguous,
      rejected,
      ready,
    },
    candidates: ready,
    byBand: { emerging: [], discovery: ready, mid_tail: [], older_gems: [] },
    byCluster: {
      strategy_tactical: ready,
      simulation: [],
      racing: [],
      horror: [],
      puzzle_point_click: [],
      niche_rpg: [],
      platform_action_indie: [],
    },
    funnelByCluster: {},
    trailerSummary: { playableTrailer: ready.length, disqualifiedTrailer: 0, noTrailer: 0 },
    gateSummary: { passedQualityGate: ready.length, failedQualityGate: 0, unsupportedPlatform: 0, invalidMetadata: 0 },
    evaluated: allEvaluated,
  };
}

test('TESTE A — somente READY: Manifest com todos os buckets só envia READY para o writer', async () => {
  const c1 = createCandidate({ igdbId: 1, name: 'Game 1', bucket: 'ALREADY_EXISTS', dedupeStatus: 'ALREADY_EXISTS', finalEligible: false });
  const c2 = createCandidate({ igdbId: 2, name: 'Game 2', bucket: 'AMBIGUOUS', dedupeStatus: 'AMBIGUOUS', finalEligible: false });
  const c3 = createCandidate({ igdbId: 3, name: 'Game 3', bucket: 'REJECTED', dedupeStatus: 'NEW', finalEligible: false, rejectionReason: 'noTrailer' });
  const c4 = createCandidate({ igdbId: 4, name: 'Game 4', bucket: 'READY', dedupeStatus: 'NEW', finalEligible: true });
  const c5 = createCandidate({ igdbId: 5, name: 'Game 5', bucket: 'READY', dedupeStatus: 'NEW', finalEligible: true });

  const manifest = createManifest([c4, c5], {
    alreadyExists: [c1],
    ambiguous: [c2],
    rejected: [c3],
  });

  const syncedGames = [];
  const fakeSync = {
    sync: async (games) => {
      syncedGames.push(...games);
      return { inserted: games.length, linked: 0, unmatched: 0 };
    },
  };

  const service = new CatalogAcquisitionService();
  const result = await service.apply(manifest, {
    limit: 10,
    gameSyncService: fakeSync,
    existingCatalog: [],
  });

  assert.equal(result.processed, 2);
  assert.equal(result.inserted, 2);
  assert.equal(syncedGames.length, 2);
  assert.deepEqual(
    syncedGames.map((g) => g.igdbId),
    [4, 5],
  );
  assert(!syncedGames.some((g) => [1, 2, 3].includes(g.igdbId)));
});

test('TESTE B — limit obrigatório: Chamada sem limit ou inválido falha fechado', async () => {
  const c1 = createCandidate({ igdbId: 1, name: 'Game 1' });
  const manifest = createManifest([c1]);
  const service = new CatalogAcquisitionService();

  // Sem limit
  await assert.rejects(
    async () => {
      await service.apply(manifest, {});
    },
    /explicit positive integer "limit" is required/,
  );

  // Com limit = 0
  await assert.rejects(
    async () => {
      await service.apply(manifest, { limit: 0 });
    },
    /explicit positive integer "limit" is required/,
  );

  // Com limit negativo
  await assert.rejects(
    async () => {
      await service.apply(manifest, { limit: -5 });
    },
    /explicit positive integer "limit" is required/,
  );
});

test('TESTE C — limit respeitado: READY contém 20, limit = 5 processa exatamente 5', async () => {
  const readyPool = Array.from({ length: 20 }, (_, i) =>
    createCandidate({ igdbId: 100 + i, name: `Game ${100 + i}`, slug: `game-${100 + i}` }),
  );
  const manifest = createManifest(readyPool);

  const syncedGames = [];
  const fakeSync = {
    sync: async (games) => {
      syncedGames.push(...games);
      return { inserted: games.length, linked: 0, unmatched: 0 };
    },
  };

  const service = new CatalogAcquisitionService();
  const result = await service.apply(manifest, {
    limit: 5,
    gameSyncService: fakeSync,
    existingCatalog: [],
  });

  assert.equal(result.requested, 5);
  assert.equal(result.processed, 5);
  assert.equal(result.inserted, 5);
  assert.equal(result.results.length, 5);
  assert.equal(syncedGames.length, 5);
});

test('TESTE D — revalidação: Candidato era READY no plan, mas antes do apply passa a existir', async () => {
  const c1 = createCandidate({ igdbId: 101, name: 'Game Alpha', slug: 'game-alpha' });
  const manifest = createManifest([c1]);

  let syncCalled = false;
  const fakeSync = {
    sync: async () => {
      syncCalled = true;
      return { inserted: 1, linked: 0, unmatched: 0 };
    },
  };

  const service = new CatalogAcquisitionService();
  // Passa existingCatalog contendo o jogo (simulando inserção entre plan e apply)
  const result = await service.apply(manifest, {
    limit: 1,
    gameSyncService: fakeSync,
    existingCatalog: [{ igdbId: 101, title: 'Game Alpha', slug: 'game-alpha' }],
  });

  assert.equal(syncCalled, false, 'GameSyncService não deve ser chamado para jogo já existente');
  assert.equal(result.inserted, 0);
  assert.equal(result.skippedAlreadyExists, 1);
  assert.equal(result.results[0].status, 'SKIPPED_ALREADY_EXISTS');
});

test('TESTE E — ambiguidade tardia: Candidato READY passa a conflitar antes da escrita', async () => {
  const c1 = createCandidate({ igdbId: 101, name: 'Tactical Horizon Remaster', slug: 'tactical-horizon-remaster' });
  const manifest = createManifest([c1]);

  let syncCalled = false;
  const fakeSync = {
    sync: async () => {
      syncCalled = true;
      return { inserted: 1, linked: 0, unmatched: 0 };
    },
  };

  const service = new CatalogAcquisitionService();
  // Título similar existente com delta 8 gera AMBIGUOUS
  const result = await service.apply(manifest, {
    limit: 1,
    gameSyncService: fakeSync,
    existingCatalog: [{ igdbId: 9999, title: 'Tactical Horizon', slug: 'tactical-horizon' }],
  });

  assert.equal(syncCalled, false, 'GameSyncService não deve ser chamado para candidato ambíguo');
  assert.equal(result.inserted, 0);
  assert.equal(result.skippedAmbiguous, 1);
  assert.equal(result.results[0].status, 'SKIPPED_AMBIGUOUS');
});

test('TESTE F — idempotência: Duas execuções consecutivas não criam duplicatas', async () => {
  const readyPool = [
    createCandidate({ igdbId: 201, name: 'Idempotent Game 1', slug: 'idempotent-game-1' }),
    createCandidate({ igdbId: 202, name: 'Idempotent Game 2', slug: 'idempotent-game-2' }),
  ];
  const manifest = createManifest(readyPool);

  const repo = new FakeGameRepository();
  const gameSyncService = new GameSyncService(repo, () => {});
  const loadExistingCatalog = async () =>
    repo.games.map((g) => ({ igdbId: g.igdbId, title: g.title, slug: g.slug }));

  const service = new CatalogAcquisitionService({
    loadExistingCatalog,
    gameSyncService,
  });

  // Run 1
  const run1 = await service.apply(manifest, { limit: 2 });
  assert.equal(run1.inserted, 2);
  assert.equal(run1.skippedAlreadyExists, 0);
  assert.equal(repo.games.length, 2);

  // Run 2: Mesmo manifest contra o repositório agora preenchido
  const run2 = await service.apply(manifest, { limit: 2 });
  assert.equal(run2.inserted, 0);
  assert.equal(run2.skippedAlreadyExists, 2);
  assert.equal(repo.games.length, 2, 'Nenhuma duplicata deve ter sido inserida');
});

test('TESTE G — erro isolado: A sucesso, B falha, C sucesso reflete individualmente', async () => {
  const gameA = createCandidate({ igdbId: 301, name: 'Game A', slug: 'game-a' });
  const gameB = createCandidate({ igdbId: 302, name: 'Game B', slug: 'game-b' });
  const gameC = createCandidate({ igdbId: 303, name: 'Game C', slug: 'game-c' });
  const manifest = createManifest([gameA, gameB, gameC]);

  const fakeSync = {
    sync: async (games) => {
      const g = games[0];
      if (g.igdbId === 302) {
        throw new Error('Database write error for Game B');
      }
      return { inserted: 1, linked: 0, unmatched: 0 };
    },
  };

  const service = new CatalogAcquisitionService();
  const result = await service.apply(manifest, {
    limit: 3,
    gameSyncService: fakeSync,
    existingCatalog: [],
  });

  assert.equal(result.processed, 3);
  assert.equal(result.inserted, 2);
  assert.equal(result.failed, 1);

  assert.equal(result.results[0].status, 'INSERTED');
  assert.equal(result.results[1].status, 'FAILED');
  assert.equal(result.results[1].error, 'Database write error for Game B');
  assert.equal(result.results[2].status, 'INSERTED');
});

test('TESTE H — ordem: Candidatos processados respeitam estritamente a ordem de READY', async () => {
  const games = ['Game Alpha', 'Game Beta', 'Game Gamma', 'Game Delta', 'Game Epsilon'].map((name, i) =>
    createCandidate({ igdbId: 401 + i, name, slug: `game-${i}` }),
  );
  const manifest = createManifest(games);

  const fakeSync = {
    sync: async () => ({ inserted: 1, linked: 0, unmatched: 0 }),
  };

  const service = new CatalogAcquisitionService();
  const result = await service.apply(manifest, {
    limit: 3,
    gameSyncService: fakeSync,
    existingCatalog: [],
  });

  assert.equal(result.processed, 3);
  assert.deepEqual(
    result.results.map((r) => r.name),
    ['Game Alpha', 'Game Beta', 'Game Gamma'],
  );
});

test('TESTE I — nenhum bucket proibido: ALREADY_EXISTS / AMBIGUOUS / REJECTED rejeitados', async () => {
  const rejectedCandidate = createCandidate({
    igdbId: 501,
    name: 'Rejected DLC',
    bucket: 'REJECTED',
    finalEligible: false,
  });

  const manifest = createManifest([], { rejected: [rejectedCandidate] });
  let writerCalled = false;
  const fakeSync = {
    sync: async () => {
      writerCalled = true;
      return { inserted: 1 };
    },
  };

  const service = new CatalogAcquisitionService();

  // Tentativa explícita de passar candidatos não-READY
  await assert.rejects(
    async () => {
      await service.apply(manifest, {
        limit: 1,
        candidates: [rejectedCandidate],
        gameSyncService: fakeSync,
      });
    },
    /Only READY candidates can be ingested/,
  );

  assert.equal(writerCalled, false);
});

test('TESTE J — relatório: Invariante inserted + skipped + failed = processed', async () => {
  const c1 = createCandidate({ igdbId: 601, name: 'Normal Game 1', slug: 'normal-1' }); // Inserido
  const c2 = createCandidate({ igdbId: 602, name: 'Existing Game 2', slug: 'existing-2' }); // Já existente
  const c3 = createCandidate({ igdbId: 603, name: 'Tactical Horizon Remaster', slug: 'tactical-horizon-remaster' }); // Ambíguo
  const c4 = createCandidate({ igdbId: 604, name: 'Failing Game 4', slug: 'failing-4' }); // Falha

  const manifest = createManifest([c1, c2, c3, c4]);

  const existingCatalog = [
    { igdbId: 602, title: 'Existing Game 2', slug: 'existing-2' },
    { igdbId: 9999, title: 'Tactical Horizon', slug: 'tactical-horizon' },
  ];

  const fakeSync = {
    sync: async (games) => {
      if (games[0].igdbId === 604) {
        throw new Error('Connection timeout');
      }
      return { inserted: 1, linked: 0, unmatched: 0 };
    },
  };

  const service = new CatalogAcquisitionService();
  const result = await service.apply(manifest, {
    limit: 4,
    existingCatalog,
    gameSyncService: fakeSync,
  });

  assert.equal(result.processed, 4);
  assert.equal(result.inserted, 1);
  assert.equal(result.skippedAlreadyExists, 1);
  assert.equal(result.skippedAmbiguous, 1);
  assert.equal(result.failed, 1);

  // Invariante
  assert.equal(
    result.inserted + result.skippedAlreadyExists + result.skippedAmbiguous + result.failed,
    result.processed,
  );
});
