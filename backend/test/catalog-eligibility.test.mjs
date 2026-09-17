import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isEligibleForCatalog,
  isDisqualifiedTrailer,
  canonicalGameTitle,
  areDuplicateEditions,
  calculateDiscoveryScore,
  calculateBayesianRating,
  applyFeedDiversity,
  DISCOVERY_SCORING_CONFIG,
  ELIGIBLE_IGDB_GAME_TYPES,
} from '../dist/modules/games/game-eligibility.js';
import { mapIgdbGame } from '../dist/modules/integrations/igdb/igdb.mapper.js';
import { enrichWithSteam } from '../dist/modules/integrations/steam/steam.mapper.js';
import { GameSyncService } from '../dist/modules/sync/game-sync.service.js';

test('Rejeição explícita de mods por game_type e por título', () => {
  assert.deepEqual(isEligibleForCatalog({ title: 'Half-Life: Echoes Mod', gameType: 5 }), {
    eligible: false,
    reason: 'MOD',
    details: 'IGDB game_type is Mod (5).',
  });
  assert.equal(isEligibleForCatalog({ title: 'Skyrim Community Overhaul Mod' }).eligible, false);
  assert.equal(isEligibleForCatalog({ title: 'Fallout 4 Weapon Modification Pack' }).eligible, false);
});

test('Rejeição explícita de DLCs e expansões', () => {
  assert.deepEqual(isEligibleForCatalog({ title: 'The Witcher 3: Blood and Wine', gameType: 1 }), {
    eligible: false,
    reason: 'DLC',
    details: 'IGDB game_type is DLC (1).',
  });
  assert.deepEqual(isEligibleForCatalog({ title: 'Cyberpunk 2077: Phantom Liberty', gameType: 2 }), {
    eligible: false,
    reason: 'EXPANSION',
    details: 'IGDB game_type is Expansion (2).',
  });
  assert.equal(isEligibleForCatalog({ title: 'Destiny 2: Final Shape Expansion Pack' }).eligible, false);
  assert.equal(isEligibleForCatalog({ title: 'Elden Ring: Shadow of the Erdtree Season Pass' }).eligible, false);
  assert.equal(isEligibleForCatalog({ title: 'Dead Cells: Return to Castlevania DLC' }).eligible, false);
});

test('Rejeição explícita de bundles e packs', () => {
  assert.deepEqual(isEligibleForCatalog({ title: 'Valve Complete Pack', gameType: 3 }), {
    eligible: false,
    reason: 'BUNDLE',
    details: 'IGDB game_type is Bundle/Pack (3).',
  });
  assert.equal(isEligibleForCatalog({ title: 'BioShock: The Collection Bundle' }).eligible, false);
  assert.equal(isEligibleForCatalog({ title: 'Batman Arkham Trilogy Pack' }).eligible, false);
});

test('Rejeição explícita de demos e playtests', () => {
  assert.deepEqual(isEligibleForCatalog({ title: 'Lies of P (Demo)' }), {
    eligible: false,
    reason: 'DEMO',
    details: 'Title indicates demo or prologue.',
  });
  assert.equal(isEligibleForCatalog({ title: 'Nine Sols Playtest' }).eligible, false);
  assert.equal(isEligibleForCatalog({ title: 'Deadlock Closed Beta' }).eligible, false);
  assert.equal(isEligibleForCatalog({ title: 'Spectre Divide Technical Test' }).eligible, false);
});

test('Rejeição explícita de ferramentas, servidores dedicados e trilhas sonoras', () => {
  assert.deepEqual(isEligibleForCatalog({ title: 'Palworld Dedicated Server' }), {
    eligible: false,
    reason: 'TOOL_OR_SERVER',
    details: 'Title indicates tool, server, or SDK.',
  });
  assert.deepEqual(isEligibleForCatalog({ title: 'Hollow Knight Official Soundtrack' }), {
    eligible: false,
    reason: 'SOUNDTRACK',
    details: 'Title indicates soundtrack/OST.',
  });
  assert.equal(isEligibleForCatalog({ title: 'Celeste OST' }).eligible, false);
  assert.equal(isEligibleForCatalog({ title: 'Unreal Engine 5 Benchmark' }).eligible, false);
  assert.equal(isEligibleForCatalog({ title: 'Source 2 SDK Toolkit' }).eligible, false);
});

test('Aceitação de jogos legítimos: normais, remakes, remasters e indies', () => {
  assert.equal(isEligibleForCatalog({ title: 'Balatro', rating: 9.5 }).eligible, true);
  assert.equal(isEligibleForCatalog({ title: 'Hades', rating: 9.3 }).eligible, true);
  assert.equal(isEligibleForCatalog({ title: 'Dead Space Remake', gameType: 8 }).eligible, true);
  assert.equal(isEligibleForCatalog({ title: 'Metroid Prime Remastered', gameType: 9 }).eligible, true);
  assert.equal(isEligibleForCatalog({ title: 'Pacific Drive', rating: 7.8 }).eligible, true);
});

test('Remake e remaster NÃO são fundidos com o jogo original por nome', () => {
  const original = {
    title: 'Resident Evil 4',
    releaseDate: new Date('2005-01-11'),
    developer: 'Capcom Production Studio 4',
  };
  const remake = {
    title: 'Resident Evil 4 Remake',
    releaseDate: new Date('2023-03-24'),
    developer: 'Capcom',
  };
  assert.equal(
    areDuplicateEditions(original, remake),
    false,
    'Remake legítimo deve permanecer separado do original',
  );

  const originalDemon = {
    title: "Demon's Souls",
    releaseDate: new Date('2009-02-05'),
    developer: 'FromSoftware',
  };
  const remakeDemon = {
    title: "Demon's Souls Remake",
    releaseDate: new Date('2020-11-12'),
    developer: 'Bluepoint Games',
  };
  assert.equal(
    areDuplicateEditions(originalDemon, remakeDemon),
    false,
    'Remake com estúdio e ano diferente deve permanecer separado',
  );
});

test('Deduplicação conservadora: unifica edições redundantes mas preserva jogos distintos', () => {
  const base = {
    title: 'The Witcher 3: Wild Hunt',
    releaseDate: new Date('2015-05-19'),
    developer: 'CD Projekt Red',
  };
  const goty = {
    title: 'The Witcher 3: Wild Hunt - Game of the Year Edition',
    releaseDate: new Date('2016-08-30'),
    developer: 'CD Projekt Red',
  };
  assert.equal(
    areDuplicateEditions(base, goty),
    true,
    'Edição GOTY do mesmo estúdio no mesmo biênio deve ser considerada duplicata',
  );

  const deluxe = {
    title: 'Persona 5 Royal: Digital Deluxe Edition',
    releaseDate: new Date('2020-03-31'),
    developer: 'Atlus',
  };
  const standard = {
    title: 'Persona 5 Royal',
    releaseDate: new Date('2020-03-31'),
    developer: 'Atlus',
  };
  assert.equal(areDuplicateEditions(standard, deluxe), true);

  // Casos em que a deduplicação NÃO deve fundir:
  // 1. Mesmo radical mas lançamentos distantes (> 2 anos)
  const retro = {
    title: 'Doom',
    releaseDate: new Date('1993-12-10'),
    developer: 'id Software',
  };
  const modernDoom = {
    title: 'Doom',
    releaseDate: new Date('2016-05-13'),
    developer: 'id Software',
  };
  assert.equal(
    areDuplicateEditions(retro, modernDoom),
    false,
    'Doom 1993 e Doom 2016 têm lançamentos distantes e devem permanecer separados',
  );

  // 2. Títulos com subtítulos distintos que não sejam meras edições cosméticas
  const godOfWar1 = {
    title: 'God of War',
    releaseDate: new Date('2005-03-22'),
    developer: 'Santa Monica Studio',
  };
  const godOfWar2018 = {
    title: 'God of War',
    releaseDate: new Date('2018-04-20'),
    developer: 'Santa Monica Studio',
  };
  assert.equal(
    areDuplicateEditions(godOfWar1, godOfWar2018),
    false,
    'God of War (2005) e God of War (2018) devem permanecer separados',
  );

  // 3. Estúdios diferentes
  const gameDevA = {
    title: 'Prey',
    releaseDate: new Date('2006-07-11'),
    developer: 'Human Head Studios',
  };
  const gameDevB = {
    title: 'Prey',
    releaseDate: new Date('2017-05-05'),
    developer: 'Arkane Studios',
  };
  assert.equal(
    areDuplicateEditions(gameDevA, gameDevB),
    false,
    'Jogos homônimos de estúdios diferentes devem permanecer separados',
  );
});

test('Clássico antigo de alta qualidade mantém piso de pontuação e compete no ranking', () => {
  const now = new Date('2026-09-14T00:00:00Z');
  // Clássico excelente de 2011 (Skyrim ou Dark Souls) com nota 94 e 5.000 avaliações
  const classic = {
    id: 'classic-1',
    title: 'Dark Souls',
    rating: 9.4,
    ratingCount: 5000,
    releaseDate: new Date('2011-09-22'),
    coverUrl: 'https://example.com/cover.jpg',
    description: 'A challenging action RPG praised worldwide by critics and players alike.',
    trailerDetails: [{ provider: 'YOUTUBE', url: 'https://youtube.com/watch?v=abc', videoId: 'abc' }],
  };
  const classicScore = calculateDiscoveryScore(classic, now);

  // Jogo antigo de 2011 medíocre e obscuro com nota 65 e 20 avaliações
  const ancientObscure = {
    id: 'obscure-1',
    title: 'Forgotten Bargain Bin 2011',
    rating: 6.5,
    ratingCount: 20,
    releaseDate: new Date('2011-04-10'),
    coverUrl: 'https://example.com/cover.jpg',
    description: 'Generic budget game released long ago with mixed reception.',
    trailerDetails: [{ provider: 'YOUTUBE', url: 'https://youtube.com/watch?v=xyz', videoId: 'xyz' }],
  };
  const obscureScore = calculateDiscoveryScore(ancientObscure, now);

  assert.ok(
    classicScore.score > obscureScore.score + 15,
    `Clássico consagrado (${classicScore.score}) deve superar amplamente título antigo obscuro (${obscureScore.score})`,
  );
  assert.ok(classicScore.score >= 65, 'Clássico excelente deve reter pontuação respeitável');
});

test('Jogo recente bom recebe vantagem moderada sobre jogo antigo equivalente', () => {
  const now = new Date('2026-09-14T00:00:00Z');
  const recentGood = {
    id: 'recent-1',
    title: 'Modern Hit 2025',
    rating: 8.8,
    ratingCount: 800,
    releaseDate: new Date('2025-06-01'),
    coverUrl: 'https://example.com/cover.jpg',
    description: 'Fresh acclaimed game released last year.',
    trailerDetails: [{ provider: 'YOUTUBE', url: 'https://youtube.com/watch?v=abc', videoId: 'abc' }],
  };
  const olderEquivalent = {
    id: 'older-1',
    title: 'Older Good Game 2015',
    rating: 8.8,
    ratingCount: 800,
    releaseDate: new Date('2015-06-01'),
    coverUrl: 'https://example.com/cover.jpg',
    description: 'Solid game from 11 years ago.',
    trailerDetails: [{ provider: 'YOUTUBE', url: 'https://youtube.com/watch?v=abc', videoId: 'abc' }],
  };

  const recentScore = calculateDiscoveryScore(recentGood, now);
  const olderScore = calculateDiscoveryScore(olderEquivalent, now);

  assert.ok(
    recentScore.score > olderScore.score,
    `Jogo recente (${recentScore.score}) deve ter vantagem sobre equivalente antigo (${olderScore.score})`,
  );
  assert.ok(
    recentScore.score - olderScore.score <= 20,
    'A vantagem de frescor deve ser moderada, não um abismo desproporcional',
  );
});

test('Hidden gem com nota excelente e público moderado não é ofuscada por AAA hiper-popular', () => {
  const now = new Date('2026-09-14T00:00:00Z');
  // Hidden gem (Balatro / Animal Well / Chained Echoes): nota 9.4, 300 avaliações
  const hiddenGem = {
    id: 'gem-1',
    title: 'Hypnotic Indie Gem',
    rating: 9.4,
    ratingCount: 350,
    releaseDate: new Date('2024-03-01'),
    coverUrl: 'https://example.com/cover.jpg',
    description: 'Innovative masterpiece from solo developer with glowing praise.',
    trailerDetails: [{ provider: 'DIRECT', url: 'https://cdn.example.com/trailer.mp4' }],
  };

  // AAA massivo com nota ligeiramente menor (8.6) mas 20.000 avaliações
  const mainstreamAAA = {
    id: 'aaa-1',
    title: 'Mega Blockbuster 7',
    rating: 8.6,
    ratingCount: 20000,
    releaseDate: new Date('2024-03-01'),
    coverUrl: 'https://example.com/cover.jpg',
    description: 'Mass-market big budget title with huge marketing.',
    trailerDetails: [{ provider: 'YOUTUBE', url: 'https://youtube.com/watch?v=aaa', videoId: 'aaa' }],
  };

  const gemScore = calculateDiscoveryScore(hiddenGem, now);
  const aaaScore = calculateDiscoveryScore(mainstreamAAA, now);

  assert.ok(
    gemScore.score >= aaaScore.score,
    `Hidden gem de nota altíssima (${gemScore.score}) deve competir ou vencer AAA de nota inferior (${aaaScore.score})`,
  );
});

test('Ausência de trailer gera penalidade forte mas não exclusão do cálculo', () => {
  const withTrailer = {
    id: '1',
    title: 'Game With Trailer',
    rating: 8.5,
    trailerDetails: [{ provider: 'YOUTUBE', url: 'https://youtube.com/watch?v=1', videoId: '1' }],
  };
  const withoutTrailer = {
    id: '2',
    title: 'Game Without Trailer',
    rating: 8.5,
    trailerDetails: [],
  };

  const scoreA = calculateDiscoveryScore(withTrailer);
  const scoreB = calculateDiscoveryScore(withoutTrailer);

  assert.ok(scoreA.score > scoreB.score);
  assert.ok(scoreB.score > 0, 'Jogo sem trailer ainda gera score numérico');
});

test('isDisqualifiedTrailer identifica vídeos irrelevantes e aceita trailers genuínos', () => {
  assert.equal(isDisqualifiedTrailer('Complete 100% Walkthrough and Guide Part 1'), true);
  assert.equal(isDisqualifiedTrailer('IGN In-Depth Game Review'), true);
  assert.equal(isDisqualifiedTrailer('Full Gameplay 4K 60FPS'), true);
  assert.equal(isDisqualifiedTrailer('RTX 4090 Benchmark & Comparison'), true);
  assert.equal(isDisqualifiedTrailer('Streamer Reaction to Ending'), true);
  assert.equal(isDisqualifiedTrailer('Developer Diary Episode 3'), true);
  assert.equal(isDisqualifiedTrailer('Original Soundtrack Full Album'), true);

  assert.equal(isDisqualifiedTrailer('Official Gameplay Launch Trailer'), false);
  assert.equal(isDisqualifiedTrailer('Announcement Teaser Trailer'), false);
  assert.equal(isDisqualifiedTrailer('Cinematic Reveal Trailer'), false);
  assert.equal(isDisqualifiedTrailer('Gamescom 2024 Official Trailer'), false);
});

test('applyFeedDiversity intercala gêneros e anos para evitar sequências monótonas', () => {
  const candidates = [
    { id: '1', title: 'Rogue 1', genres: ['Roguelike'], releaseDate: new Date('2024-01-01'), discoveryScore: 95 },
    { id: '2', title: 'Rogue 2', genres: ['Roguelike'], releaseDate: new Date('2024-02-01'), discoveryScore: 94 },
    { id: '3', title: 'Rogue 3', genres: ['Roguelike'], releaseDate: new Date('2024-03-01'), discoveryScore: 93 },
    { id: '4', title: 'Adventure 1', genres: ['Adventure'], releaseDate: new Date('2023-01-01'), discoveryScore: 92 },
    { id: '5', title: 'Strategy 1', genres: ['Strategy'], releaseDate: new Date('2022-01-01'), discoveryScore: 91 },
  ];

  const diverse = applyFeedDiversity(candidates, 5);
  // O terceiro item não deve ser Roguelike se houver alternativa de alta qualidade disponível
  assert.equal(diverse[0].id, '1');
  assert.equal(diverse[1].id, '2');
  assert.notEqual(
    diverse[2].genres?.[0],
    'Roguelike',
    'Terceiro jogo deve quebrar a sequência de Roguelikes se houver opção diversa no topo',
  );
});

test('Sync ignora candidatos inelegíveis de mod/DLC/soundtrack e registra motivos', async () => {
  const records = [];
  const repo = {
    findCandidates: async () => [],
    upsertByExternalId: async (g) => {
      records.push(g);
      return g;
    },
    linkExternalIds: async () => {},
    markSynced: async () => {},
  };
  const sync = new GameSyncService(repo, () => {});

  const games = [
    { title: 'Valid Indie', slug: 'valid-indie', rating: 9.0, screenshots: [], genres: [], platforms: [] },
    { title: 'Hollow Knight Soundtrack', slug: 'hk-ost', rating: 9.9, screenshots: [], genres: [], platforms: [] },
    { title: 'Half-Life 2 Mod Overhaul', slug: 'hl2-mod', rating: 9.0, screenshots: [], genres: [], platforms: [] },
    { title: 'The Witcher 3 Expansion Pack DLC', slug: 'w3-dlc', rating: 9.5, screenshots: [], genres: [], platforms: [] },
  ];

  const result = await sync.sync(games);
  assert.equal(result.received, 4);
  assert.equal(result.inserted, 1);
  assert.equal(result.rejected, 3);
  assert.equal(records.length, 1);
  assert.equal(records[0].title, 'Valid Indie');
  assert.equal(result.rejections?.SOUNDTRACK, 1);
  assert.equal(result.rejections?.MOD, 1);
  assert.equal(result.rejections?.DLC, 1);
});

test('Fórmula Bayesiana exata com m=50: Radj = (v / (v + m)) * R + (m / (v + m)) * C', () => {
  const m = DISCOVERY_SCORING_CONFIG.bayesian.confidenceThreshold; // 50
  const C = DISCOVERY_SCORING_CONFIG.bayesian.baselineRating; // 75
  const R = 95;

  // 1. v = 0: puxa totalmente para o prior C (75.0)
  const scoreV0 = calculateBayesianRating(R, 0, m, C);
  assert.equal(scoreV0, 75, 'Sem votos, a nota ajustada deve ser exatamente o prior C');

  // 2. v muito baixo (v = 5): puxado fortemente para o prior C
  // Radj = (5/55)*95 + (50/55)*75 = 8.63636... + 68.18181... = 76.81818...
  const scoreV5 = calculateBayesianRating(R, 5, m, C);
  assert.ok(Math.abs(scoreV5 - 76.81818) < 0.001);
  assert.ok(scoreV5 < 78, 'Poucos votos devem manter a nota muito próxima ao prior de 75');

  // 3. v = m = 50: média aritmética exata entre o rating R e o prior C
  // Radj = (50/100)*95 + (50/100)*75 = 0.5 * 95 + 0.5 * 75 = 47.5 + 37.5 = 85.0
  const scoreVm = calculateBayesianRating(R, 50, m, C);
  assert.equal(scoreVm, 85, 'Quando v == m, a nota ajustada é exatamente a média entre R e C');

  // 4. v muito alto (v = 1000): guiado esmagadoramente pelo rating R
  // Radj = (1000/1050)*95 + (50/1050)*75 = 90.47619 + 3.57142 = 94.04761...
  const scoreV1000 = calculateBayesianRating(R, 1000, m, C);
  assert.ok(Math.abs(scoreV1000 - 94.04761) < 0.001);
  assert.ok(scoreV1000 > 94, 'Com 1000 votos, a nota ajustada converge para R (95)');

  // 5. v extremamente alto (v = 10000): convergência quase absoluta para R
  // Radj = (10000/10050)*95 + (50/10050)*75 = 94.52736 + 0.37313 = 94.90049...
  const scoreV10000 = calculateBayesianRating(R, 10000, m, C);
  assert.ok(Math.abs(scoreV10000 - 94.90049) < 0.001);
  assert.ok(scoreV10000 > 94.8, 'Com 10000 votos, o prior exerce peso desprezível');
});

test('IGDB game_type: aceita 0 (Main), 8 (Remake), 9 (Remaster); rejeita 10 (Expanded), 1, 5, etc.', () => {
  assert.deepEqual(Array.from(ELIGIBLE_IGDB_GAME_TYPES), [0, 8, 9]);

  // 1. Jogo principal elegível entra (game_type = 0)
  const mainGame = isEligibleForCatalog({ title: 'Animal Well', gameType: 0 });
  assert.equal(mainGame.eligible, true);

  // 2. Remake legítimo entra (game_type = 8)
  const remake = isEligibleForCatalog({ title: "Demon's Souls Remake", gameType: 8 });
  assert.equal(remake.eligible, true);

  // 3. Remaster legítimo entra (game_type = 9)
  const remaster = isEligibleForCatalog({ title: 'Metroid Prime Remastered', gameType: 9 });
  assert.equal(remaster.eligible, true);

  // 4. Expanded Game (game_type = 10) é rejeitado da descoberta para evitar poluição por edições
  const expanded = isEligibleForCatalog({
    title: 'The Legend of Zelda: Tears of the Kingdom - Nintendo Switch 2 Edition',
    gameType: 10,
  });
  assert.equal(expanded.eligible, false);
  assert.equal(expanded.reason, 'EXPANSION');

  // 5. Itens secundários (DLC, Mod, Demo, Playtest, Soundtrack) rejeitados
  assert.equal(isEligibleForCatalog({ title: 'The Witcher 3: Blood and Wine', gameType: 1 }).eligible, false);
  assert.equal(isEligibleForCatalog({ title: 'Fallout London', gameType: 5 }).eligible, false);
  assert.equal(isEligibleForCatalog({ title: 'Lies of P (Demo)', gameType: 0 }).eligible, false);
  assert.equal(isEligibleForCatalog({ title: 'Nine Sols Playtest', gameType: 0 }).eligible, false);
  assert.equal(isEligibleForCatalog({ title: 'Hollow Knight OST', gameType: 0 }).eligible, false);
});

test('Validação dos Três Perfis: Perfil A (Indie Gem) compete e vence Perfil C (AAA); Perfil B (15 votos 9.9) não domina', () => {
  const now = new Date('2026-09-14T00:00:00Z');

  // Perfil A: Indie Gem legítimo (Animal Well / Sea of Stars)
  // Nota excelente (9.1), volume moderado comprovado (300 votos), recente (2024)
  const profileA = {
    id: 'profile-a',
    title: 'Animal Well',
    rating: 9.1,
    ratingCount: 300,
    releaseDate: new Date('2024-05-09'),
    coverUrl: 'https://example.com/cover.jpg',
    description: 'Dense atmospheric puzzle labyrinth indie masterpiece.',
    trailerDetails: [{ provider: 'YOUTUBE', url: 'https://youtube.com/watch?v=a1', videoId: 'a1' }],
  };

  // Perfil B: Outlier de baixa confiança (Epiko Regal / Dig Island)
  // Nota 9.9/10, mas apenas 15 avaliações
  const profileB = {
    id: 'profile-b',
    title: 'Low-Sample Outlier',
    rating: 9.9,
    ratingCount: 15,
    releaseDate: new Date('2024-06-01'),
    coverUrl: 'https://example.com/cover.jpg',
    description: 'Niche game with only 15 reviews from friends.',
    trailerDetails: [{ provider: 'YOUTUBE', url: 'https://youtube.com/watch?v=b1', videoId: 'b1' }],
  };

  // Perfil C: AAA Blockbuster consagrado (Elden Ring / Baldur\'s Gate 3)
  // Nota muito boa (8.6), volume gigantesco (15.000 avaliações)
  const profileC = {
    id: 'profile-c',
    title: 'Mega Blockbuster AAA',
    rating: 8.6,
    ratingCount: 15000,
    releaseDate: new Date('2024-01-15'),
    coverUrl: 'https://example.com/cover.jpg',
    description: 'Mass-market big budget RPG with massive global marketing and acclaim.',
    trailerDetails: [{ provider: 'YOUTUBE', url: 'https://youtube.com/watch?v=c1', videoId: 'c1' }],
  };

  const scoreA = calculateDiscoveryScore(profileA, now);
  const scoreB = calculateDiscoveryScore(profileB, now);
  const scoreC = calculateDiscoveryScore(profileC, now);

  // 1. Perfil A (Indie Gem) compete e vence Perfil C (AAA)
  assert.ok(
    scoreA.score > scoreC.score,
    `Perfil A Indie Gem (${scoreA.score}) deve superar Perfil C AAA (${scoreC.score}) no feed de descoberta`,
  );

  // 2. Perfil B (Outlier de 15 votos) NÃO domina nem A nem C
  assert.ok(
    scoreB.score < scoreA.score,
    `Perfil B com apenas 15 votos (${scoreB.score}) não deve superar Perfil A (${scoreA.score})`,
  );
  assert.ok(
    scoreB.score < scoreC.score,
    `Perfil B com apenas 15 votos (${scoreB.score}) não deve superar Perfil C (${scoreC.score})`,
  );
});

test('Discovery score prefers aggregate IGDB confidence and preserves conservative fallbacks', () => {
  const base = {
    id: 'rating-confidence',
    title: 'Rating Confidence',
    releaseDate: new Date('2024-01-01'),
    coverUrl: 'https://example.com/cover.jpg',
    description: 'Complete metadata for a deterministic score.',
    trailerDetails: [
      { provider: 'YOUTUBE', url: 'https://youtube.com/watch?v=abcdefghijk', videoId: 'abcdefghijk' },
    ],
  };
  const now = new Date('2026-09-15T00:00:00Z');

  const aggregate = calculateDiscoveryScore({
    ...base,
    rating: 2,
    ratingCount: 10000,
    totalRating: 9,
    totalRatingCount: 100,
  }, now);
  const expectedAggregate = calculateBayesianRating(90, 100);
  assert.equal(aggregate.breakdown.adjustedRating, expectedAggregate);

  const userFallback = calculateDiscoveryScore({ ...base, rating: 8.5, ratingCount: 75 }, now);
  assert.equal(userFallback.breakdown.adjustedRating, calculateBayesianRating(85, 75));

  const unknownConfidence = calculateDiscoveryScore({ ...base, rating: 9.9 }, now);
  const missingRating = calculateDiscoveryScore(base, now);
  assert.equal(unknownConfidence.breakdown.adjustedRating, 75);
  assert.equal(
    unknownConfidence.breakdown.adjustedRating,
    missingRating.breakdown.adjustedRating,
    'Nota sem contagem deve ter confiança desconhecida, sem fabricar 20 votos',
  );

  const lowConfidence = calculateDiscoveryScore({ ...base, rating: 9.5, ratingCount: 5 }, now);
  const highConfidence = calculateDiscoveryScore({ ...base, rating: 9.5, ratingCount: 5000 }, now);
  assert.ok(lowConfidence.breakdown.adjustedRating < highConfidence.breakdown.adjustedRating);
});

test('Deduplicação unifica "Nintendo Switch 2 Edition" como edição redundante do jogo base', () => {
  const original = {
    title: 'The Legend of Zelda: Breath of the Wild',
    releaseDate: new Date('2017-03-03'),
    developer: 'Nintendo EPD',
  };
  const switch2Ed = {
    title: 'The Legend of Zelda: Breath of the Wild - Nintendo Switch 2 Edition',
    releaseDate: new Date('2025-03-01'),
    developer: 'Nintendo EPD',
  };

  // canonicalGameTitle deve normalizar ambos para o mesmo radical
  assert.equal(
    canonicalGameTitle(switch2Ed.title),
    canonicalGameTitle(original.title),
    'Switch 2 Edition deve ter o mesmo título canônico que o jogo original',
  );
});

test('Rejeição explícita de termos adicionais de lixo e não-jogos (artbook, strategy guide, bonus content, soundtrack edition)', () => {
  assert.equal(isEligibleForCatalog({ title: 'Elden Ring Digital Artbook & Strategy Guide' }).eligible, false);
  assert.equal(isEligibleForCatalog({ title: 'Persona 5 Soundtrack Edition' }).eligible, false);
  assert.equal(isEligibleForCatalog({ title: 'Baldur\'s Gate 3 Bonus Content Pack' }).eligible, false);
  assert.equal(isEligibleForCatalog({ title: 'Cyberpunk 2077 Weapon Skin Pack' }).eligible, false);
  assert.equal(isEligibleForCatalog({ title: 'Hollow Knight Music Collection' }).eligible, false);
});

test('applyFeedDiversity interrompe sequências de 3 jogos seguidos do mesmo estúdio', () => {
  const candidates = [
    { id: '1', title: 'Studio Game 1', studio: 'FromSoftware', genres: ['RPG'], releaseDate: new Date('2022-01-01'), discoveryScore: 95 },
    { id: '2', title: 'Studio Game 2', studio: 'FromSoftware', genres: ['Action'], releaseDate: new Date('2023-01-01'), discoveryScore: 94 },
    { id: '3', title: 'Studio Game 3', studio: 'FromSoftware', genres: ['Adventure'], releaseDate: new Date('2024-01-01'), discoveryScore: 93 },
    { id: '4', title: 'Other Studio Game', studio: 'Supergiant Games', genres: ['Roguelike'], releaseDate: new Date('2020-01-01'), discoveryScore: 90 },
  ];

  const diverse = applyFeedDiversity(candidates, 4);
  assert.equal(diverse[0].id, '1');
  assert.equal(diverse[1].id, '2');
  // O terceiro jogo deve ser de outro estúdio para quebrar a sequência de FromSoftware
  assert.equal(diverse[2].id, '4', 'O terceiro jogo deve vir de outro estúdio para quebrar o streak');
  assert.equal(diverse[3].id, '3');
});

test('calculateDiscoveryScore não penaliza vídeo do YouTube cujo hash de 11 caracteres contenha palavras como ost ou review', () => {
  const candidate = {
    id: 'yt-hash-test',
    title: 'Great Game',
    releaseDate: new Date('2024-01-01'),
    coverUrl: 'https://example.com/cover.jpg',
    description: 'A wonderful game with high quality video.',
    trailerDetails: [
      { provider: 'YOUTUBE', url: 'https://youtube.com/watch?v=AbCdEfGoSt1', videoId: 'AbCdEfGoSt1' },
    ],
  };
  const res = calculateDiscoveryScore(candidate);
  // Deve receber o bônus de YouTube (8 pontos) e NÃO penalidade de ausência de trailer
  assert.ok(res.breakdown.metadataPoints >= 8, `Metadata points devem ser >= 8, recebido: ${res.breakdown.metadataPoints}`);
});
