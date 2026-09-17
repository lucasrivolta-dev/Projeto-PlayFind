import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyHygieneGame,
  determineGameProvenance,
  hasUserRelations,
  executeHygieneApplyTransaction,
  computeCandidateFingerprint,
  validateApplyPreconditions,
  exportCatalogHygieneSnapshot,
  EXPECTED_BAD_RECENT_COUNT,
  TCG_SIMULATOR_IGDB_ID,
} from '../dist/modules/games/catalog-hygiene.js';

test('determineGameProvenance: identifica corretamente os lotes históricos', () => {
  const seedDate = new Date('2026-09-14T12:38:50.000Z');
  const popularDate = new Date('2026-09-17T02:44:00.000Z');
  const recentDate = new Date('2026-09-17T02:48:30.000Z');
  const discoverDate = new Date('2026-09-17T02:52:00.000Z');
  const unknownDate = new Date('2026-09-20T10:00:00.000Z');

  assert.equal(determineGameProvenance(seedDate), 'SEED_OR_CURATED');
  assert.equal(determineGameProvenance(popularDate), 'POPULAR_BATCH');
  assert.equal(determineGameProvenance(recentDate), 'RECENT_OLD_BATCH');
  assert.equal(determineGameProvenance(discoverDate), 'DISCOVER_BATCH');
  assert.equal(determineGameProvenance(unknownDate), 'UNKNOWN');
});

test('hasUserRelations: detecta qualquer interação de usuário', () => {
  assert.equal(
    hasUserRelations({ libraryCount: 0, commentsCount: 0, topicsCount: 0, eventsCount: 0 }),
    false,
  );
  assert.equal(
    hasUserRelations({ libraryCount: 1, commentsCount: 0, topicsCount: 0, eventsCount: 0 }),
    true,
  );
  assert.equal(
    hasUserRelations({ libraryCount: 0, commentsCount: 1, topicsCount: 0, eventsCount: 0 }),
    true,
  );
  assert.equal(
    hasUserRelations({ libraryCount: 0, commentsCount: 0, topicsCount: 1, eventsCount: 0 }),
    true,
  );
  assert.equal(
    hasUserRelations({ libraryCount: 0, commentsCount: 0, topicsCount: 0, eventsCount: 1 }),
    true,
  );
});

test('Proteção de Game com UserGameLibrary', () => {
  const game = {
    id: '11111111-1111-1111-1111-111111111111',
    title: 'Suspicious Game With Saved',
    slug: 'suspicious-game',
    createdAt: new Date('2026-09-17T02:48:00.000Z'),
    userRelations: { libraryCount: 1, commentsCount: 0, topicsCount: 0, eventsCount: 0 },
    provenance: 'RECENT_OLD_BATCH',
  };

  const result = classifyHygieneGame(game);
  assert.equal(result.category, 'PROTECTED');
  assert.equal(result.canSafelyDelete, false);
  assert.match(result.reason, /1 library entries/);
});

test('Proteção de Game com Comment', () => {
  const game = {
    id: '22222222-2222-2222-2222-222222222222',
    title: 'Game With Comment',
    slug: 'game-with-comment',
    createdAt: new Date('2026-09-17T02:48:00.000Z'),
    userRelations: { libraryCount: 0, commentsCount: 3, topicsCount: 0, eventsCount: 0 },
    provenance: 'RECENT_OLD_BATCH',
  };

  const result = classifyHygieneGame(game);
  assert.equal(result.category, 'PROTECTED');
  assert.equal(result.canSafelyDelete, false);
  assert.match(result.reason, /3 comments/);
});

test('Proteção de Game com ForumTopic', () => {
  const game = {
    id: '33333333-3333-3333-3333-333333333333',
    title: 'Game With Forum Topic',
    slug: 'game-with-topic',
    createdAt: new Date('2026-09-17T02:48:00.000Z'),
    userRelations: { libraryCount: 0, commentsCount: 0, topicsCount: 2, eventsCount: 0 },
    provenance: 'RECENT_OLD_BATCH',
  };

  const result = classifyHygieneGame(game);
  assert.equal(result.category, 'PROTECTED');
  assert.equal(result.canSafelyDelete, false);
  assert.match(result.reason, /2 forum topics/);
});

test('Proteção de Game com RecommendationEvent', () => {
  const game = {
    id: '44444444-4444-4444-4444-444444444444',
    title: 'Game With Analytics Event',
    slug: 'game-with-event',
    createdAt: new Date('2026-09-17T02:48:00.000Z'),
    userRelations: { libraryCount: 0, commentsCount: 0, topicsCount: 0, eventsCount: 5 },
    provenance: 'RECENT_OLD_BATCH',
  };

  const result = classifyHygieneGame(game);
  assert.equal(result.category, 'PROTECTED');
  assert.equal(result.canSafelyDelete, false);
  assert.match(result.reason, /5 recommendation events/);
});

test('Classificação: CLEAR_JUNK para mods, DLCs, expansões, demos e playtests', () => {
  const modGame = {
    id: 'mod-1',
    title: 'Skyrim Total Overhaul Mod',
    slug: 'skyrim-mod',
    createdAt: new Date('2026-09-17T02:48:00.000Z'),
    userRelations: { libraryCount: 0, commentsCount: 0, topicsCount: 0, eventsCount: 0 },
  };
  const dlcGame = {
    id: 'dlc-1',
    title: 'Witcher 3 Blood and Wine DLC',
    slug: 'witcher-dlc',
    createdAt: new Date('2026-09-17T02:48:00.000Z'),
    userRelations: { libraryCount: 0, commentsCount: 0, topicsCount: 0, eventsCount: 0 },
  };
  const demoGame = {
    id: 'demo-1',
    title: 'Lies of P Prologue Demo',
    slug: 'lies-demo',
    createdAt: new Date('2026-09-17T02:48:00.000Z'),
    userRelations: { libraryCount: 0, commentsCount: 0, topicsCount: 0, eventsCount: 0 },
  };

  assert.equal(classifyHygieneGame(modGame).category, 'CLEAR_JUNK');
  assert.equal(classifyHygieneGame(dlcGame).category, 'CLEAR_JUNK');
  assert.equal(classifyHygieneGame(demoGame).category, 'CLEAR_JUNK');
});

test('Classificação: PROBABLE_BAD_RECENT_IMPORT para jogos do lote recent antigo que falham regra editorial', () => {
  const lowCountRecentGame = {
    id: 'recent-bad-1',
    title: 'Dimraeth',
    slug: 'dimraeth',
    createdAt: new Date('2026-09-17T02:48:00.000Z'),
    provenance: 'RECENT_OLD_BATCH',
    totalRating: null,
    totalRatingCount: 0,
    userRelations: { libraryCount: 0, commentsCount: 0, topicsCount: 0, eventsCount: 0 },
  };

  const lowRatingRecentGame = {
    id: 'recent-bad-2',
    title: 'RuneScape: Dragonwilds',
    slug: 'runescape-dragonwilds',
    createdAt: new Date('2026-09-17T02:48:00.000Z'),
    provenance: 'RECENT_OLD_BATCH',
    totalRating: 8.0, // 80/100
    totalRatingCount: 8, // < 10 avaliações
    userRelations: { libraryCount: 0, commentsCount: 0, topicsCount: 0, eventsCount: 0 },
  };

  const res1 = classifyHygieneGame(lowCountRecentGame);
  assert.equal(res1.category, 'PROBABLE_BAD_RECENT_IMPORT');
  assert.equal(res1.canSafelyDelete, true);

  const res2 = classifyHygieneGame(lowRatingRecentGame);
  assert.equal(res2.category, 'PROBABLE_BAD_RECENT_IMPORT');
  assert.equal(res2.canSafelyDelete, true);
});

test('Classificação: LEGITIMATE_KEEP para jogo do lote recent que cumpre a nova regra editorial', () => {
  const tcgSimulator = {
    id: '392a2899-61e3-4dba-88cf-adb2b264864b',
    title: 'TCG Card Shop Simulator',
    slug: 'tcg-card-shop-simulator',
    createdAt: new Date('2026-09-17T02:48:00.000Z'),
    provenance: 'RECENT_OLD_BATCH',
    totalRating: 7.83, // 78.3/100 na escala NextPlay
    totalRatingCount: 24, // >= 10 avaliações
    userRelations: { libraryCount: 0, commentsCount: 0, topicsCount: 0, eventsCount: 0 },
  };

  const result = classifyHygieneGame(tcgSimulator);
  assert.equal(result.category, 'LEGITIMATE_KEEP');
  assert.equal(result.canSafelyDelete, false);
  assert.match(result.reason, /Meets editorial quality threshold/);
});

test('Baixa ratingCount sozinha NÃO implica delete para jogos do catálogo curado / popular / discover', () => {
  // Indie com 2 avaliações no seed ou discover
  const indieSeedGame = {
    id: 'seed-indie-1',
    title: 'Obscure Curated Indie Gem',
    slug: 'obscure-curated-indie',
    createdAt: new Date('2026-09-14T12:38:50.000Z'),
    provenance: 'SEED_OR_CURATED',
    rating: 8.5,
    ratingCount: 2,
    totalRating: 8.5,
    totalRatingCount: 2,
    userRelations: { libraryCount: 0, commentsCount: 0, topicsCount: 0, eventsCount: 0 },
  };

  const indieDiscoverGame = {
    id: 'discover-indie-1',
    title: 'Fresh Discover Title',
    slug: 'fresh-discover-title',
    createdAt: new Date('2026-09-17T02:52:00.000Z'),
    provenance: 'DISCOVER_BATCH',
    rating: null,
    ratingCount: null,
    totalRating: null,
    totalRatingCount: null,
    userRelations: { libraryCount: 0, commentsCount: 0, topicsCount: 0, eventsCount: 0 },
  };

  const resSeed = classifyHygieneGame(indieSeedGame);
  assert.equal(resSeed.category, 'LEGITIMATE_KEEP');
  assert.equal(resSeed.canSafelyDelete, false);

  const resDiscover = classifyHygieneGame(indieDiscoverGame);
  assert.equal(resDiscover.category, 'LEGITIMATE_KEEP');
  assert.equal(resDiscover.canSafelyDelete, false);
});

test('Candidatos incertos (UNCERTAIN) permanecem intactos', () => {
  const unknownGame = {
    id: 'unknown-1',
    title: 'Some Future Unknown Game',
    slug: 'unknown-game',
    createdAt: new Date('2026-10-01T00:00:00.000Z'),
    provenance: 'UNKNOWN',
    userRelations: { libraryCount: 0, commentsCount: 0, topicsCount: 0, eventsCount: 0 },
  };

  const result = classifyHygieneGame(unknownGame);
  assert.equal(result.category, 'UNCERTAIN');
  assert.equal(result.canSafelyDelete, false);
});

test('Dry-run não realiza nenhuma chamada de deleção ou mutação', async () => {
  let deleteCalled = false;
  const mockTx = {
    userGameLibrary: { count: async () => 0 },
    comment: { count: async () => 0 },
    forumTopic: { count: async () => 0 },
    recommendationEvent: { count: async () => 0 },
    gameMedia: { deleteMany: async () => ({ count: 0 }) },
    gameGenre: { deleteMany: async () => ({ count: 0 }) },
    gamePlatform: { deleteMany: async () => ({ count: 0 }) },
    steamOffer: { deleteMany: async () => ({ count: 0 }) },
    game: {
      deleteMany: async () => {
        deleteCalled = true;
        return { count: 0 };
      },
    },
  };

  // Em modo audit com candidates vazios ou apenas dry-run, executeHygieneApplyTransaction não é chamado
  assert.equal(deleteCalled, false);
});

test('executeHygieneApplyTransaction: nunca remove registros PROTECTED, LEGITIMATE_KEEP ou UNCERTAIN', async () => {
  let deletedIds = [];
  const mockTx = {
    userGameLibrary: { count: async () => 0 },
    comment: { count: async () => 0 },
    forumTopic: { count: async () => 0 },
    recommendationEvent: { count: async () => 0 },
    gameMedia: { deleteMany: async () => ({ count: 0 }) },
    gameGenre: { deleteMany: async () => ({ count: 0 }) },
    gamePlatform: { deleteMany: async () => ({ count: 0 }) },
    steamOffer: { deleteMany: async () => ({ count: 0 }) },
    game: {
      deleteMany: async ({ where }) => {
        deletedIds = where.id.in;
        return { count: where.id.in.length };
      },
    },
  };

  const candidates = [
    { id: 'p1', title: 'Protected Game', category: 'PROTECTED', canSafelyDelete: false },
    { id: 'k1', title: 'Keep Game', category: 'LEGITIMATE_KEEP', canSafelyDelete: false },
    { id: 'u1', title: 'Uncertain Game', category: 'UNCERTAIN', canSafelyDelete: false },
    {
      id: 'bad1',
      title: 'Bad Recent',
      category: 'PROBABLE_BAD_RECENT_IMPORT',
      canSafelyDelete: true,
    },
    { id: 'junk1', title: 'Junk Game', category: 'CLEAR_JUNK', canSafelyDelete: true },
  ];

  const { deletedCount } = await executeHygieneApplyTransaction(mockTx, candidates, {
    expectedCount: 2,
  });

  assert.equal(deletedCount, 2);
  assert.deepEqual(deletedIds, ['bad1', 'junk1']);
  assert.ok(!deletedIds.includes('p1'));
  assert.ok(!deletedIds.includes('k1'));
  assert.ok(!deletedIds.includes('u1'));
});

test('executeHygieneApplyTransaction: aborta imediatamente e lança erro se candidato adquiriu relação de usuário', async () => {
  let anyDeleteCalled = false;
  const mockTx = {
    userGameLibrary: {
      count: async ({ where }) => {
        if (where.gameId.in.includes('bad2')) {
          return 1;
        }
        return 0;
      },
    },
    comment: { count: async () => 0 },
    forumTopic: { count: async () => 0 },
    recommendationEvent: { count: async () => 0 },
    gameMedia: {
      deleteMany: async () => {
        anyDeleteCalled = true;
        return { count: 0 };
      },
    },
    gameGenre: {
      deleteMany: async () => {
        anyDeleteCalled = true;
        return { count: 0 };
      },
    },
    gamePlatform: {
      deleteMany: async () => {
        anyDeleteCalled = true;
        return { count: 0 };
      },
    },
    steamOffer: {
      deleteMany: async () => {
        anyDeleteCalled = true;
        return { count: 0 };
      },
    },
    game: {
      deleteMany: async () => {
        anyDeleteCalled = true;
        return { count: 0 };
      },
    },
  };

  const candidates = [
    {
      id: 'bad1',
      title: 'Bad Recent 1',
      category: 'PROBABLE_BAD_RECENT_IMPORT',
      canSafelyDelete: true,
    },
    {
      id: 'bad2',
      title: 'Bad Recent 2',
      category: 'PROBABLE_BAD_RECENT_IMPORT',
      canSafelyDelete: true,
    },
  ];

  await assert.rejects(
    async () => {
      await executeHygieneApplyTransaction(mockTx, candidates, { expectedCount: 2 });
    },
    {
      message:
        /ABORT: Tentativa de remoção bloqueada! Candidatos possuem relações ativas de usuário \(1 library entries\)\. Nenhuma deleção foi executada\./,
    },
  );

  // Nenhuma operação de deleção deve ter sido chamada
  assert.equal(anyDeleteCalled, false);
});

test('executeHygieneApplyTransaction: aborta com relações ativas de comentários, fórum ou analytics', async () => {
  const createMockTx = (relType) => ({
    userGameLibrary: { count: async () => (relType === 'library' ? 1 : 0) },
    comment: { count: async () => (relType === 'comment' ? 2 : 0) },
    forumTopic: { count: async () => (relType === 'topic' ? 1 : 0) },
    recommendationEvent: { count: async () => (relType === 'event' ? 4 : 0) },
    gameMedia: { deleteMany: async () => ({ count: 0 }) },
    gameGenre: { deleteMany: async () => ({ count: 0 }) },
    gamePlatform: { deleteMany: async () => ({ count: 0 }) },
    steamOffer: { deleteMany: async () => ({ count: 0 }) },
    game: { deleteMany: async () => ({ count: 0 }) },
  });

  const candidates = [
    { id: 'b1', title: 'B1', category: 'PROBABLE_BAD_RECENT_IMPORT', canSafelyDelete: true },
  ];

  await assert.rejects(
    async () => executeHygieneApplyTransaction(createMockTx('comment'), candidates, { expectedCount: 1 }),
    /2 comments/,
  );
  await assert.rejects(
    async () => executeHygieneApplyTransaction(createMockTx('topic'), candidates, { expectedCount: 1 }),
    /1 forum topics/,
  );
  await assert.rejects(
    async () => executeHygieneApplyTransaction(createMockTx('event'), candidates, { expectedCount: 1 }),
    /4 recommendation events/,
  );
});

test('executeHygieneApplyTransaction: lança erro se contagem de deleção diferir de expectedCount', async () => {
  const mockTx = {
    userGameLibrary: { count: async () => 0 },
    comment: { count: async () => 0 },
    forumTopic: { count: async () => 0 },
    recommendationEvent: { count: async () => 0 },
    gameMedia: { deleteMany: async () => ({ count: 2 }) },
    gameGenre: { deleteMany: async () => ({ count: 2 }) },
    gamePlatform: { deleteMany: async () => ({ count: 2 }) },
    steamOffer: { deleteMany: async () => ({ count: 2 }) },
    game: {
      deleteMany: async () => ({ count: 1 }), // Retorna 1 ao invés de 2
    },
  };

  const candidates = [
    { id: 'c1', title: 'C1', category: 'PROBABLE_BAD_RECENT_IMPORT', canSafelyDelete: true },
    { id: 'c2', title: 'C2', category: 'PROBABLE_BAD_RECENT_IMPORT', canSafelyDelete: true },
  ];

  await assert.rejects(
    async () => {
      await executeHygieneApplyTransaction(mockTx, candidates, { expectedCount: 2 });
    },
    {
      message: /ABORT: Quantidade de registros deletados \(1\) diferente do esperado \(2\)\. Transação cancelada\./,
    },
  );
});

test('computeCandidateFingerprint: determinístico e independente da ordem dos IDs', () => {
  const ids1 = ['b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001'];
  const ids2 = ['a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002'];

  const hash1 = computeCandidateFingerprint(ids1);
  const hash2 = computeCandidateFingerprint(ids2);

  assert.equal(hash1, hash2);
  assert.match(hash1, /^[0-9a-f]{64}$/);
});

test('validateApplyPreconditions: rejeita candidate count diferente de 99', () => {
  // 98 candidatos (1 a menos)
  const candidates98 = Array.from({ length: 98 }, (_, i) => ({
    id: `id-${i}`,
    title: `Game ${i}`,
    category: 'PROBABLE_BAD_RECENT_IMPORT',
    canSafelyDelete: true,
  }));

  assert.throws(
    () => validateApplyPreconditions(candidates98),
    /ABORT: A contagem de candidatos \(98\) difere do esperado \(99\)/,
  );

  // 100 candidatos (1 a mais)
  const candidates100 = Array.from({ length: 100 }, (_, i) => ({
    id: `id-${i}`,
    title: `Game ${i}`,
    category: 'PROBABLE_BAD_RECENT_IMPORT',
    canSafelyDelete: true,
  }));

  assert.throws(
    () => validateApplyPreconditions(candidates100),
    /ABORT: A contagem de candidatos \(100\) difere do esperado \(99\)/,
  );
});

test('validateApplyPreconditions: bloqueia categoricamente TCG Card Shop Simulator na lista de remoção', () => {
  const candidatesWithTcg = Array.from({ length: 98 }, (_, i) => ({
    id: `id-${i}`,
    title: `Game ${i}`,
    category: 'PROBABLE_BAD_RECENT_IMPORT',
    canSafelyDelete: true,
  }));

  candidatesWithTcg.push({
    id: 'tcg-id',
    title: 'TCG Card Shop Simulator',
    slug: 'tcg-card-shop-simulator',
    igdbId: TCG_SIMULATOR_IGDB_ID,
    category: 'PROBABLE_BAD_RECENT_IMPORT',
    canSafelyDelete: true,
  });

  assert.throws(
    () => validateApplyPreconditions(candidatesWithTcg),
    /ABORT: "TCG Card Shop Simulator" \(tcg-id\) foi detectado na lista de remoção! Ele deve ser estritamente preservado/,
  );
});

test('validateApplyPreconditions: rejeita fingerprint divergente e aceita fingerprint correto', () => {
  const candidates = Array.from({ length: 99 }, (_, i) => ({
    id: `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`,
    title: `Game ${i}`,
    category: 'PROBABLE_BAD_RECENT_IMPORT',
    canSafelyDelete: true,
  }));

  const validFingerprint = computeCandidateFingerprint(candidates.map((c) => c.id));

  // Validação correta
  const result = validateApplyPreconditions(candidates, { expectedFingerprint: validFingerprint });
  assert.equal(result.fingerprint, validFingerprint);

  // Divergência
  assert.throws(
    () =>
      validateApplyPreconditions(candidates, { expectedFingerprint: 'invalid-fingerprint-hash' }),
    /ABORT: O fingerprint dos candidatos/,
  );
});

test('exportCatalogHygieneSnapshot: exporta snapshot completo com todas as relações', async () => {
  const candidateIds = ['id-1', 'id-2'];
  const mockPrisma = {
    game: {
      findMany: async () => [
        {
          id: 'id-1',
          title: 'Game 1',
          slug: 'game-1',
          igdbId: 101,
          steamAppId: 201,
          createdAt: new Date('2026-09-17T02:48:00.000Z'),
          updatedAt: new Date('2026-09-17T02:48:00.000Z'),
          media: [
            {
              id: 'm1',
              type: 'TRAILER',
              url: 'https://youtube.com/watch?v=abc',
              createdAt: new Date('2026-09-17T02:48:00.000Z'),
            },
          ],
          genres: [{ genreId: 'g1', genre: { id: 'g1', name: 'Ação', slug: 'acao' } }],
          platforms: [{ platformId: 'p1', platform: { id: 'p1', name: 'PC', slug: 'pc' } }],
          steamOffers: [
            {
              id: 's1',
              currency: 'BRL',
              priceCents: 1999,
              storeUrl: 'https://store.steampowered.com/app/201',
              isAvailable: true,
              capturedAt: new Date('2026-09-17T02:48:00.000Z'),
            },
          ],
        },
      ],
    },
  };

  const testSnapshotPath = '.tools/backups/test-snapshot.json';
  const { candidateCount, fingerprint } = await exportCatalogHygieneSnapshot(
    mockPrisma,
    candidateIds,
    testSnapshotPath,
  );

  assert.equal(candidateCount, 1);
  assert.equal(fingerprint, computeCandidateFingerprint(candidateIds));
});
