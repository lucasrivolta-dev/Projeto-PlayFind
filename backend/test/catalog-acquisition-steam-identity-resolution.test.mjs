import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CatalogAcquisitionService,
  STEAM_QUALITY_GATE_CONFIG,
} from '../dist/modules/sync/catalog-acquisition.service.js';
import { matchSteamCandidate } from '../dist/modules/sync/steam-matcher.service.js';

function createRawCandidate(overrides = {}) {
  const id = overrides.id ?? 2001;
  const isSteam = overrides.hasSteam !== undefined ? overrides.hasSteam : false;
  const external_games = isSteam
    ? [{ external_game_source: { name: 'Steam' }, uid: String(overrides.steamAppId ?? 300000 + id) }]
    : [];

  return {
    id,
    name: overrides.name ?? `Test Game ${id}`,
    slug: overrides.slug ?? `test-game-${id}`,
    game_type: 0,
    total_rating: 88,
    total_rating_count: 200,
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

test('TESTE A — verdadeiro NON_STEAM: nenhuma Steam identity antes/depois da resolução continua NON_STEAM', async () => {
  let resolverCalled = 0;
  const service = new CatalogAcquisitionService({
    loadExistingCatalog: async () => [],
    steamAppResolver: async () => {
      resolverCalled++;
      return undefined; // no steam app found
    },
  });

  const raw = createRawCandidate({ id: 2101, hasSteam: false, name: 'Genuine Console Game' });
  const manifest = await service.plan({
    rawCandidates: [raw],
    clusters: ['strategy_tactical'],
  });

  assert.equal(resolverCalled, 1);
  assert.equal(manifest.totals.ready, 1);
  const candidate = manifest.candidates[0];
  assert.equal(candidate.steamEvidenceStatus, 'NON_STEAM');
  assert.equal(candidate.steamAppId, undefined);
  assert.equal(candidate.steamReviewCount, undefined);
  assert.equal(candidate.bucket, 'READY');
});

test('TESTE B — Steam descoberta por fallback: candidato inicialmente sem Steam ID tem Quality Gate executado ANTES da escrita', async () => {
  let gateEvaluated = false;
  const service = new CatalogAcquisitionService({
    loadExistingCatalog: async () => [],
    steamAppResolver: async (c) => {
      const name = typeof c === 'string' ? c : c.name;
      if (name === 'Discovered Steam Game') return 444001;
      return undefined;
    },
    steamReviewProvider: async (appId) => {
      if (appId === 444001) {
        gateEvaluated = true;
        return {
          totalReviews: 500,
          totalPositive: 450,
          totalNegative: 50,
          positivePercentage: 90.0,
          reviewScoreDesc: 'Very Positive',
        };
      }
      return undefined;
    },
  });

  const raw = createRawCandidate({ id: 2102, hasSteam: false, name: 'Discovered Steam Game' });
  const manifest = await service.plan({
    rawCandidates: [raw],
    clusters: ['strategy_tactical'],
  });

  assert.equal(gateEvaluated, true, 'Review provider must be called to execute quality gate');
  const candidate = manifest.candidates[0];
  assert.equal(candidate.steamAppId, 444001);
  assert.equal(candidate.steamEvidenceStatus, 'STEAM_VERIFIED');
  assert.equal(candidate.steamQualityGatePassed, true);
  assert.equal(candidate.bucket, 'READY');
});

test('TESTE C — Steam descoberta e gate PASS: pode seguir READY', async () => {
  const service = new CatalogAcquisitionService({
    loadExistingCatalog: async () => [],
    steamAppResolver: async () => 555001,
    steamReviewProvider: async () => ({
      totalReviews: 1200,
      totalPositive: 1100,
      totalNegative: 100,
      positivePercentage: 91.6,
      reviewScoreDesc: 'Very Positive',
    }),
  });

  const raw = createRawCandidate({ id: 2103, hasSteam: false, name: 'Passing Steam Game' });
  const manifest = await service.plan({
    rawCandidates: [raw],
    clusters: ['strategy_tactical'],
  });

  assert.equal(manifest.totals.ready, 1);
  const candidate = manifest.candidates[0];
  assert.equal(candidate.bucket, 'READY');
  assert.equal(candidate.steamEvidenceStatus, 'STEAM_VERIFIED');
  assert.equal(candidate.steamQualityGatePassed, true);
  assert.equal(candidate.steamReviewCount, 1200);
});

test('TESTE D — Steam descoberta e reviews < 100: REJECTED / STOP antes do writer', async () => {
  const service = new CatalogAcquisitionService({
    loadExistingCatalog: async () => [],
    steamAppResolver: async () => 666001,
    steamReviewProvider: async () => ({
      totalReviews: 45,
      totalPositive: 45,
      totalNegative: 0,
      positivePercentage: 100.0,
      reviewScoreDesc: 'Positive',
    }),
  });

  const raw = createRawCandidate({ id: 2104, hasSteam: false, name: 'Low Review Game' });
  const manifest = await service.plan({
    rawCandidates: [raw],
    clusters: ['strategy_tactical'],
  });

  assert.equal(manifest.totals.ready, 0);
  assert.equal(manifest.totals.rejected, 1);
  const rejected = manifest.evaluated[0];
  assert.equal(rejected.bucket, 'REJECTED');
  assert.equal(rejected.rejectionReason, 'insufficientSteamReviews');
  assert.equal(rejected.steamQualityGatePassed, false);
});

test('TESTE E — Steam descoberta e positivas < 80%: REJECTED / STOP', async () => {
  const service = new CatalogAcquisitionService({
    loadExistingCatalog: async () => [],
    steamAppResolver: async () => 777001,
    steamReviewProvider: async () => ({
      totalReviews: 100000,
      totalPositive: 30000,
      totalNegative: 70000,
      positivePercentage: 30.0,
      reviewScoreDesc: 'Mostly Negative',
    }),
  });

  const raw = createRawCandidate({ id: 2105, hasSteam: false, name: 'Negative Review Game' });
  const manifest = await service.plan({
    rawCandidates: [raw],
    clusters: ['strategy_tactical'],
  });

  assert.equal(manifest.totals.ready, 0);
  assert.equal(manifest.totals.rejected, 1);
  const rejected = manifest.evaluated[0];
  assert.equal(rejected.bucket, 'REJECTED');
  assert.equal(rejected.rejectionReason, 'poorSteamRating');
  assert.equal(rejected.steamQualityGatePassed, false);
});

test('TESTE F — Steam descoberta mas evidence indisponível: STEAM_EVIDENCE_UNAVAILABLE fail closed', async () => {
  const service = new CatalogAcquisitionService({
    loadExistingCatalog: async () => [],
    steamAppResolver: async () => 888001,
    steamReviewProvider: async () => {
      throw new Error('Steam review endpoint 503');
    },
  });

  const raw = createRawCandidate({ id: 2106, hasSteam: false, name: 'Unavailable Reviews Game' });
  const manifest = await service.plan({
    rawCandidates: [raw],
    clusters: ['strategy_tactical'],
  });

  assert.equal(manifest.totals.ready, 0);
  assert.equal(manifest.totals.rejected, 1);
  const rejected = manifest.evaluated[0];
  assert.equal(rejected.bucket, 'REJECTED');
  assert.equal(rejected.rejectionReason, 'steamEvidenceUnavailable');
  assert.equal(rejected.steamEvidenceStatus, 'STEAM_EVIDENCE_UNAVAILABLE');
  assert.equal(rejected.steamQualityGatePassed, false);
});

test('TESTE G — identidade aparece entre plan e apply: apply detecta e exige gate antes do write', async () => {
  // Plan was done offline with no steamAppResolver (so candidate is in READY as NON_STEAM)
  const service = new CatalogAcquisitionService({
    loadExistingCatalog: async () => [],
  });

  const raw = createRawCandidate({ id: 2107, hasSteam: false, name: 'Sneaky Late Steam Game' });
  const manifest = await service.plan({
    rawCandidates: [raw],
    clusters: ['strategy_tactical'],
  });

  assert.equal(manifest.totals.ready, 1);
  const candidate = manifest.candidates[0];
  assert.equal(candidate.steamEvidenceStatus, 'NON_STEAM');

  // Now during apply, resolver discovers a Steam ID with poor reviews (<80%)
  let syncCalled = false;
  const mockSyncService = {
    sync: async () => {
      syncCalled = true;
      return { inserted: 1, rejected: 0 };
    },
  };

  const applyService = new CatalogAcquisitionService({
    loadExistingCatalog: async () => [],
    gameSyncService: mockSyncService,
    steamAppResolver: async () => 999001,
    steamReviewProvider: async () => ({
      totalReviews: 500,
      totalPositive: 200,
      totalNegative: 300,
      positivePercentage: 40.0,
      reviewScoreDesc: 'Mostly Negative',
    }),
  });

  const applyResult = await applyService.apply(manifest, { limit: 1 });
  assert.equal(applyResult.failed, 1);
  assert.equal(applyResult.inserted, 0);
  assert.equal(syncCalled, false, 'Sync must NOT be called when late-discovered Steam ID fails gate');
  assert.match(applyResult.results[0].error, /discovered Steam identity but failed Steam quality gate/);
});

test('TESTE H — nenhum bypass NON_STEAM: candidate marked NON_STEAM + Steam identity later discovered != automatic write', async () => {
  let writtenGame = null;
  const mockSyncService = {
    sync: async (games, enricher) => {
      writtenGame = games[0];
      if (enricher) {
        writtenGame = await enricher(writtenGame);
      }
      return { inserted: 1, rejected: 0 };
    },
  };

  const service = new CatalogAcquisitionService({
    loadExistingCatalog: async () => [],
    gameSyncService: mockSyncService,
    // Steam enricher tries to attach an unverified Steam ID via name lookup during sync
    steamEnricher: async (game) => {
      return {
        ...game,
        steamAppId: 1234567, // rogue attachment
      };
    },
  });

  const raw = createRawCandidate({ id: 2108, hasSteam: false, name: 'True Console Exclusive' });
  const manifest = await service.plan({
    rawCandidates: [raw],
    clusters: ['strategy_tactical'],
  });

  const candidate = manifest.candidates[0];
  assert.equal(candidate.steamEvidenceStatus, 'NON_STEAM');

  await service.apply(manifest, { limit: 1 });

  // Safe wrapper must prevent rogue steamEnricher from attaching Steam ID to genuine NON_STEAM game
  assert.equal(writtenGame.steamAppId, undefined, 'NON_STEAM game must not be enriched with rogue Steam ID');
});

test('TESTE I — determinismo: mesmos dados produzem mesma classificação', async () => {
  const resolver = async (name) => {
    if (name.includes('Resolved')) return 999111;
    return undefined;
  };
  const reviewProvider = async (appId) => {
    if (appId === 999111) {
      return {
        totalReviews: 600,
        totalPositive: 540,
        totalNegative: 60,
        positivePercentage: 90.0,
      };
    }
    return undefined;
  };

  const createService = () =>
    new CatalogAcquisitionService({
      loadExistingCatalog: async () => [],
      steamAppResolver: resolver,
      steamReviewProvider: reviewProvider,
    });

  const raw1 = createRawCandidate({ id: 2109, hasSteam: false, name: 'Resolved Steam 1' });
  const raw2 = createRawCandidate({ id: 2110, hasSteam: false, name: 'Pure Non Steam 2' });

  const m1 = await createService().plan({ rawCandidates: [raw1, raw2], clusters: ['strategy_tactical'] });
  const m2 = await createService().plan({ rawCandidates: [raw1, raw2], clusters: ['strategy_tactical'] });

  assert.deepEqual(
    m1.candidates.map((c) => ({ id: c.igdbId, band: c.steamExposureBand, status: c.steamEvidenceStatus, appId: c.steamAppId })),
    m2.candidates.map((c) => ({ id: c.igdbId, band: c.steamExposureBand, status: c.steamEvidenceStatus, appId: c.steamAppId })),
  );
});

test('TESTE J — sem chamadas Steam desnecessárias: jogos com Steam em external_games não chamam resolver', async () => {
  let resolverCalls = 0;
  const service = new CatalogAcquisitionService({
    loadExistingCatalog: async () => [],
    steamAppResolver: async () => {
      resolverCalls++;
      return undefined;
    },
    steamReviewProvider: async () => ({
      totalReviews: 500,
      totalPositive: 450,
      totalNegative: 50,
      positivePercentage: 90.0,
    }),
  });

  // Game with Steam already in external_games
  const raw = createRawCandidate({ id: 2111, hasSteam: true, steamAppId: 100200, name: 'Already Steam Game' });
  await service.plan({
    rawCandidates: [raw],
    clusters: ['strategy_tactical'],
  });

  assert.equal(resolverCalls, 0, 'Candidates with existing Steam external_games must NOT call resolver');
});

test('TESTE OBRIGATÓRIO A — Overwatch fixture: IGDB Overwatch (2016) vs Steam Overwatch 2 (2023) => NO_MATCH / não associa', () => {
  const igdbCandidate = {
    name: 'Overwatch',
    releaseYear: 2016,
    releaseDate: new Date('2016-05-24'),
    developer: 'Blizzard Entertainment',
    publisher: 'Blizzard Entertainment',
    platforms: ['PC (Microsoft Windows)', 'PlayStation 4', 'Xbox One'],
  };

  const steamApp = {
    appId: 2357570,
    name: 'Overwatch®',
    type: 'game',
    releaseDateRaw: '10 Aug, 2023',
    releaseDate: new Date('2023-08-10'),
    developers: ['Blizzard Entertainment, Inc.'],
    publishers: ['Blizzard Entertainment, Inc.'],
  };

  const result = matchSteamCandidate(igdbCandidate, steamApp);
  assert.equal(result.status, 'NO_MATCH');
  assert.ok(result.reasons.some((r) => r.includes('Lançamentos muito distantes no tempo')));
});

test('TESTE OBRIGATÓRIO B — exact same game: título e metadados coerentes => CONFIDENT_MATCH', () => {
  const candidate = {
    name: 'Hollow Knight',
    releaseYear: 2017,
    releaseDate: new Date('2017-02-24'),
    developer: 'Team Cherry',
    publisher: 'Team Cherry',
  };

  const steamApp = {
    appId: 367520,
    name: 'Hollow Knight',
    type: 'game',
    releaseDateRaw: '24 Feb, 2017',
    developers: ['Team Cherry'],
    publishers: ['Team Cherry'],
  };

  const result = matchSteamCandidate(candidate, steamApp);
  assert.equal(result.status, 'CONFIDENT_MATCH');
  assert.equal(result.appId, 367520);
  assert.ok((result.confidence ?? 0) >= 75);
});

test('TESTE OBRIGATÓRIO C — sequel: Game vs Game 2 => NO_MATCH / não associar', () => {
  const candidate = {
    name: 'Hades',
    releaseYear: 2020,
    developer: 'Supergiant Games',
  };

  const steamApp = {
    appId: 1145350,
    name: 'Hades II',
    type: 'game',
    releaseDateRaw: '6 May, 2024',
    developers: ['Supergiant Games'],
  };

  const result = matchSteamCandidate(candidate, steamApp);
  assert.equal(result.status, 'NO_MATCH');
  assert.ok(result.reasons.some((r) => r.includes('Divergência de sequência')));
});

test('TESTE OBRIGATÓRIO D — remake/remaster ambíguo: sem evidência suficiente => AMBIGUOUS ou NO_MATCH', () => {
  const candidate = {
    name: 'Silent Hill 2',
    releaseYear: 2001,
    developer: 'Konami Team Silent',
  };

  const steamApp = {
    appId: 2124490,
    name: 'SILENT HILL 2',
    type: 'game',
    releaseDateRaw: '8 Oct, 2024', // 23 years later, different developer Bloober Team
    developers: ['Bloober Team'],
    publishers: ['KONAMI'],
  };

  const result = matchSteamCandidate(candidate, steamApp);
  assert.notEqual(result.status, 'CONFIDENT_MATCH');
  assert.ok(result.status === 'NO_MATCH' || result.status === 'AMBIGUOUS');
});

test('TESTE OBRIGATÓRIO E — edição legítima com evidência forte: aceita se sinais forem suficientes', () => {
  const candidate = {
    name: 'The Witcher 3: Wild Hunt',
    releaseYear: 2015,
    developer: 'CD PROJEKT RED',
    publisher: 'CD PROJEKT RED',
  };

  const steamApp = {
    appId: 292030,
    name: 'The Witcher 3: Wild Hunt - Game of the Year Edition',
    type: 'game',
    releaseDateRaw: '30 Aug, 2016', // 1 year diff for GOTY port/bundle
    developers: ['CD PROJEKT RED'],
    publishers: ['CD PROJEKT RED'],
  };

  const result = matchSteamCandidate(candidate, steamApp);
  assert.equal(result.status, 'CONFIDENT_MATCH');
  assert.equal(result.appId, 292030);
});

test('TESTE OBRIGATÓRIO F — soundtrack/DLC/demo: nunca usar como identidade principal do jogo', () => {
  const candidate = {
    name: 'Celeste',
    releaseYear: 2018,
    developer: 'Extremely OK Games',
  };

  const ostSteam = {
    appId: 800001,
    name: 'Celeste Soundtrack',
    type: 'game',
    releaseDateRaw: '25 Jan, 2018',
    developers: ['Lena Raine'],
  };
  assert.equal(matchSteamCandidate(candidate, ostSteam).status, 'NO_MATCH');

  const dlcSteam = {
    appId: 800002,
    name: 'Celeste - Farewell DLC',
    type: 'game',
    releaseDateRaw: '9 Sep, 2019',
    developers: ['Extremely OK Games'],
  };
  assert.equal(matchSteamCandidate(candidate, dlcSteam).status, 'NO_MATCH');

  const demoSteam = {
    appId: 800003,
    name: 'Celeste Demo',
    type: 'demo',
    releaseDateRaw: '25 Jan, 2018',
    developers: ['Extremely OK Games'],
  };
  assert.equal(matchSteamCandidate(candidate, demoSteam).status, 'NO_MATCH');
});

test('TESTE OBRIGATÓRIO G — título homônimo: mesmo nome mas developer/data incompatíveis => não associar', () => {
  const candidate = {
    name: 'Prey',
    releaseYear: 2006,
    developer: 'Human Head Studios',
    publisher: '2K Games',
  };

  const steamApp = {
    appId: 480490,
    name: 'Prey',
    type: 'game',
    releaseDateRaw: '5 May, 2017',
    developers: ['Arkane Studios'],
    publishers: ['Bethesda Softworks'],
  };

  const result = matchSteamCandidate(candidate, steamApp);
  assert.equal(result.status, 'NO_MATCH');
  assert.ok(result.reasons.some((r) => r.includes('muito distantes') || r.includes('incompatível')));
});

test('TESTE OBRIGATÓRIO H — determinismo: mesmo input gera mesma decisão e score', () => {
  const candidate = {
    name: 'Dead Cells',
    releaseYear: 2018,
    developer: 'Motion Twin',
    publisher: 'Motion Twin',
  };

  const steamApp = {
    appId: 588650,
    name: 'Dead Cells',
    type: 'game',
    releaseDateRaw: '6 Aug, 2018',
    developers: ['Motion Twin'],
    publishers: ['Motion Twin'],
  };

  const r1 = matchSteamCandidate(candidate, steamApp);
  const r2 = matchSteamCandidate(candidate, steamApp);
  assert.deepEqual(r1, r2);
});

test('TESTE OBRIGATÓRIO I — quality gate após confident match: Steam encontrada e confirmada executa gate obrigatório', async () => {
  let reviewsCalled = false;
  const service = new CatalogAcquisitionService({
    loadExistingCatalog: async () => [],
    steamAppResolver: async () => ({
      status: 'CONFIDENT_MATCH',
      appId: 999333,
      confidence: 85,
      reasons: ['Confirmed'],
    }),
    steamReviewProvider: async (appId) => {
      if (appId === 999333) {
        reviewsCalled = true;
        return {
          totalReviews: 250,
          totalPositive: 225,
          totalNegative: 25,
          positivePercentage: 90.0,
          reviewScoreDesc: 'Very Positive',
        };
      }
      return undefined;
    },
  });

  const raw = createRawCandidate({ id: 2120, hasSteam: false, name: 'Confident Steam Winner' });
  const manifest = await service.plan({
    rawCandidates: [raw],
    clusters: ['strategy_tactical'],
  });

  assert.equal(reviewsCalled, true);
  assert.equal(manifest.totals.ready, 1);
  const c = manifest.candidates[0];
  assert.equal(c.steamAppId, 999333);
  assert.equal(c.steamQualityGatePassed, true);
  assert.equal(c.steamEvidenceStatus, 'STEAM_VERIFIED');
});

test('TESTE OBRIGATÓRIO J — ambiguous não recebe reviews erradas: não consulta/aplica evidence como se appId fosse confirmado', async () => {
  let reviewsCalled = false;
  const service = new CatalogAcquisitionService({
    loadExistingCatalog: async () => [],
    steamAppResolver: async () => ({
      status: 'AMBIGUOUS',
      appId: 999444,
      confidence: 60,
      reasons: ['Ambiguous name variation'],
    }),
    steamReviewProvider: async () => {
      reviewsCalled = true;
      return {
        totalReviews: 10,
        totalPositive: 1,
        totalNegative: 9,
        positivePercentage: 10.0,
      };
    },
  });

  const raw = createRawCandidate({ id: 2121, hasSteam: false, name: 'Ambiguous Steam Candidate' });
  const manifest = await service.plan({
    rawCandidates: [raw],
    clusters: ['strategy_tactical'],
  });

  assert.equal(reviewsCalled, false, 'Reviews MUST NOT be called when resolver returns AMBIGUOUS');
  const c = manifest.evaluated[0];
  assert.equal(c.steamAppId, undefined);
  assert.equal(c.steamEvidenceStatus, 'NON_STEAM');
});

test('TESTE OBRIGATÓRIO K — late resolution: entre plan e apply, mesma política conservadora', async () => {
  const service = new CatalogAcquisitionService({
    loadExistingCatalog: async () => [],
  });

  const raw = createRawCandidate({ id: 2122, hasSteam: false, name: 'Overwatch' });
  const manifest = await service.plan({
    rawCandidates: [raw],
    clusters: ['strategy_tactical'],
  });

  assert.equal(manifest.totals.ready, 1);
  assert.equal(manifest.candidates[0].steamEvidenceStatus, 'NON_STEAM');

  let writtenGame = null;
  const applyService = new CatalogAcquisitionService({
    loadExistingCatalog: async () => [],
    gameSyncService: {
      sync: async (games) => {
        writtenGame = games[0];
        return { inserted: 1, rejected: 0 };
      },
    },
    // Late resolver returns NO_MATCH for candidate Overwatch vs Overwatch 2
    steamAppResolver: async () => ({
      status: 'NO_MATCH',
      reasons: ['Lançamentos muito distantes no tempo (2016 vs 2023)'],
    }),
  });

  const res = await applyService.apply(manifest, { limit: 1 });
  assert.equal(res.inserted, 1);
  assert.equal(writtenGame.steamAppId, undefined, 'NON_STEAM game must not receive rogue Steam ID from late resolver');
});

test('TESTE OBRIGATÓRIO L — verdadeiro NON_STEAM continua funcionando normalmente', async () => {
  const service = new CatalogAcquisitionService({
    loadExistingCatalog: async () => [],
    steamAppResolver: async () => ({
      status: 'NO_MATCH',
      reasons: ['Nenhum app Steam encontrado'],
    }),
  });

  const raw = createRawCandidate({
    id: 2123,
    hasSteam: false,
    name: 'Genuine Console Masterpiece',
    platforms: [{ name: 'PlayStation 5' }],
  });

  const manifest = await service.plan({
    rawCandidates: [raw],
    clusters: ['strategy_tactical'],
  });

  assert.equal(manifest.totals.ready, 1);
  const c = manifest.candidates[0];
  assert.equal(c.steamEvidenceStatus, 'NON_STEAM');
  assert.equal(c.steamAppId, undefined);
  assert.equal(c.bucket, 'READY');
});

