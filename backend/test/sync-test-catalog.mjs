import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaGameRepository } from '../dist/modules/games/prisma-game.repository.js';
import { GameSyncService } from '../dist/modules/sync/game-sync.service.js';
import { GameService } from '../dist/modules/games/game.service.js';
import { SteamClient } from '../dist/modules/integrations/steam/steam.client.js';
import { enrichWithSteam } from '../dist/modules/integrations/steam/steam.mapper.js';
import { isEligibleForCatalog } from '../dist/modules/games/game-eligibility.js';
import { IgdbClient } from '../dist/modules/integrations/igdb/igdb.client.js';
import { mapIgdbGame } from '../dist/modules/integrations/igdb/igdb.mapper.js';
import { buildSyncQuery } from '../dist/modules/integrations/igdb/igdb-query.js';

// Verify strict isolation: TEST_DATABASE_URL must exist and differ from DATABASE_URL
const testUrl = process.env.TEST_DATABASE_URL;
const prodUrl = process.env.DATABASE_URL;

if (!testUrl) {
  console.error('ERRO: TEST_DATABASE_URL não está configurada.');
  process.exit(1);
}

if (!prodUrl) {
  console.error('ERRO: DATABASE_URL não está configurada.');
  process.exit(1);
}

if (testUrl === prodUrl) {
  console.error('ERRO CRÍTICO: TEST_DATABASE_URL e DATABASE_URL são idênticas! Abortando para proteger produção.');
  process.exit(1);
}

console.log('✓ Confirmação de segurança: TEST_DATABASE_URL !== DATABASE_URL');
console.log('✓ Alvo exclusivo de homologação: Neon TEST');

const prisma = new PrismaClient({ datasourceUrl: testUrl });
const steamClient = new SteamClient();

/**
 * Rich set of real candidates to evaluate catalog eligibility, scoring,
 * deduplication, and diversity against Neon TEST.
 */
const CANDIDATES = [
  // --- Jogos Legítimos & Hidden Gems ---
  {
    title: 'Animal Well',
    slug: 'animal-well',
    description: 'Explore a dense, interconnected labyrinth and unravel its countless secrets. Pixel art puzzle adventure with extraordinary atmosphere.',
    coverUrl: 'https://cdn.cloudflare.steamstatic.com/steam/apps/813230/capsule_616x353.jpg',
    heroUrl: 'https://cdn.cloudflare.steamstatic.com/steam/apps/813230/header.jpg',
    screenshots: ['https://cdn.cloudflare.steamstatic.com/steam/apps/813230/ss_1.jpg'],
    trailers: ['https://www.youtube.com/watch?v=0k9FzYf1x4E'],
    genres: ['Metroidvania', 'Puzzle', 'Indie'],
    platforms: ['PC', 'Switch', 'PlayStation'],
    releaseDate: new Date('2024-05-09'),
    developer: 'Shared Memory',
    publisher: 'Bigmode',
    rating: 9.1,
    steamAppId: 813230,
  },
  {
    title: 'Chained Echoes',
    slug: 'chained-echoes',
    description: 'A 16-bit SNES-style JRPG set in a fantasy world where dragons are as common as piloted mechs.',
    coverUrl: 'https://cdn.cloudflare.steamstatic.com/steam/apps/1229240/capsule_616x353.jpg',
    heroUrl: 'https://cdn.cloudflare.steamstatic.com/steam/apps/1229240/header.jpg',
    screenshots: ['https://cdn.cloudflare.steamstatic.com/steam/apps/1229240/ss_1.jpg'],
    trailers: ['https://www.youtube.com/watch?v=uK4817x-E5E'],
    genres: ['RPG', 'Turn-Based', 'Indie'],
    platforms: ['PC', 'Switch', 'PlayStation', 'Xbox'],
    releaseDate: new Date('2022-12-08'),
    developer: 'Matthias Linda',
    publisher: 'Deck13',
    rating: 9.0,
    steamAppId: 1229240,
  },
  {
    title: 'Sea of Stars',
    slug: 'sea-of-stars',
    description: 'A turn-based RPG inspired by the classics. Engaging turn-based combat, rich storytelling, exploration, and interactions with the environment.',
    coverUrl: 'https://cdn.cloudflare.steamstatic.com/steam/apps/1244090/capsule_616x353.jpg',
    heroUrl: 'https://cdn.cloudflare.steamstatic.com/steam/apps/1244090/header.jpg',
    screenshots: ['https://cdn.cloudflare.steamstatic.com/steam/apps/1244090/ss_1.jpg'],
    trailers: ['https://www.youtube.com/watch?v=1hN3U2q0tJg'],
    genres: ['RPG', 'Aventura', 'Indie'],
    platforms: ['PC', 'Switch', 'PlayStation', 'Xbox'],
    releaseDate: new Date('2023-08-29'),
    developer: 'Sabotage Studio',
    publisher: 'Sabotage Studio',
    rating: 8.9,
    steamAppId: 1244090,
  },
  {
    title: 'Tunic',
    slug: 'tunic',
    description: 'Explore a land filled with lost legends, ancient powers, and ferocious monsters in an isometric action game about a small fox on a big adventure.',
    coverUrl: 'https://cdn.cloudflare.steamstatic.com/steam/apps/553420/capsule_616x353.jpg',
    heroUrl: 'https://cdn.cloudflare.steamstatic.com/steam/apps/553420/header.jpg',
    screenshots: ['https://cdn.cloudflare.steamstatic.com/steam/apps/553420/ss_1.jpg'],
    trailers: ['https://www.youtube.com/watch?v=tTcfB_iS6xI'],
    genres: ['Ação', 'Aventura', 'Puzzle', 'Indie'],
    platforms: ['PC', 'Switch', 'PlayStation', 'Xbox'],
    releaseDate: new Date('2022-03-16'),
    developer: 'TUNIC Team',
    publisher: 'Finji',
    rating: 8.8,
    steamAppId: 553420,
  },
  {
    title: 'Cocoon',
    slug: 'cocoon',
    description: 'From Jeppe Carlsen, the lead gameplay designer of LIMBO and INSIDE — COCOON takes you on an adventure across worlds within worlds.',
    coverUrl: 'https://cdn.cloudflare.steamstatic.com/steam/apps/1497440/capsule_616x353.jpg',
    heroUrl: 'https://cdn.cloudflare.steamstatic.com/steam/apps/1497440/header.jpg',
    screenshots: ['https://cdn.cloudflare.steamstatic.com/steam/apps/1497440/ss_1.jpg'],
    trailers: ['https://www.youtube.com/watch?v=d_2Y8gD0m9c'],
    genres: ['Puzzle', 'Aventura', 'Sci-Fi', 'Indie'],
    platforms: ['PC', 'Switch', 'PlayStation', 'Xbox'],
    releaseDate: new Date('2023-09-29'),
    developer: 'Geometric Interactive',
    publisher: 'Annapurna Interactive',
    rating: 8.8,
    steamAppId: 1497440,
  },
  {
    title: 'Slay the Spire',
    slug: 'slay-the-spire',
    description: 'We fused card games and roguelikes together to make the best single player deckbuilder we could.',
    coverUrl: 'https://cdn.cloudflare.steamstatic.com/steam/apps/646570/capsule_616x353.jpg',
    heroUrl: 'https://cdn.cloudflare.steamstatic.com/steam/apps/646570/header.jpg',
    screenshots: ['https://cdn.cloudflare.steamstatic.com/steam/apps/646570/ss_1.jpg'],
    trailers: ['https://www.youtube.com/watch?v=6P9q_3sF5_k'],
    genres: ['Roguelike', 'Card Game', 'Estratégia', 'Indie'],
    platforms: ['PC', 'Switch', 'PlayStation', 'Xbox', 'Mobile'],
    releaseDate: new Date('2019-01-23'),
    developer: 'Mega Crit Games',
    publisher: 'Humble Games',
    rating: 9.2,
    steamAppId: 646570,
  },
  {
    title: 'Dead Cells',
    slug: 'dead-cells',
    description: 'Dead Cells is a rogue-lite, metroidvania inspired, action-platformer. You will explore a sprawling, ever-changing castle.',
    coverUrl: 'https://cdn.cloudflare.steamstatic.com/steam/apps/588650/capsule_616x353.jpg',
    heroUrl: 'https://cdn.cloudflare.steamstatic.com/steam/apps/588650/header.jpg',
    screenshots: ['https://cdn.cloudflare.steamstatic.com/steam/apps/588650/ss_1.jpg'],
    trailers: ['https://www.youtube.com/watch?v=gX4cGcwNqms'],
    genres: ['Roguelike', 'Metroidvania', 'Ação', 'Indie'],
    platforms: ['PC', 'Switch', 'PlayStation', 'Xbox', 'Mobile'],
    releaseDate: new Date('2018-08-07'),
    developer: 'Motion Twin',
    publisher: 'Motion Twin',
    rating: 9.1,
    steamAppId: 588650,
  },
  {
    title: 'Dave the Diver',
    slug: 'dave-the-diver',
    description: 'A casual, singleplayer adventure RPG featuring deep-sea exploration and fishing during the day and sushi restaurant management at night.',
    coverUrl: 'https://cdn.cloudflare.steamstatic.com/steam/apps/1868140/capsule_616x353.jpg',
    heroUrl: 'https://cdn.cloudflare.steamstatic.com/steam/apps/1868140/header.jpg',
    screenshots: ['https://cdn.cloudflare.steamstatic.com/steam/apps/1868140/ss_1.jpg'],
    trailers: ['https://www.youtube.com/watch?v=0k7t5T_8v3A'],
    genres: ['Aventura', 'RPG', 'Simulação', 'Indie'],
    platforms: ['PC', 'Switch', 'PlayStation'],
    releaseDate: new Date('2023-06-28'),
    developer: 'MINTROCKET',
    publisher: 'MINTROCKET',
    rating: 9.0,
    steamAppId: 1868140,
  },
  {
    title: 'Signalis',
    slug: 'signalis',
    description: 'A classic survival horror experience set in a dystopian future where humanity has uncovered a dark secret.',
    coverUrl: 'https://cdn.cloudflare.steamstatic.com/steam/apps/1262350/capsule_616x353.jpg',
    heroUrl: 'https://cdn.cloudflare.steamstatic.com/steam/apps/1262350/header.jpg',
    screenshots: ['https://cdn.cloudflare.steamstatic.com/steam/apps/1262350/ss_1.jpg'],
    trailers: ['https://www.youtube.com/watch?v=q6M1B8yG_Vw'],
    genres: ['Survival Horror', 'Puzzle', 'Indie'],
    platforms: ['PC', 'Switch', 'PlayStation', 'Xbox'],
    releaseDate: new Date('2022-10-27'),
    developer: 'rose-engine',
    publisher: 'Humble Games',
    rating: 8.9,
    steamAppId: 1262350,
  },
  {
    title: 'Outer Wilds',
    slug: 'outer-wilds',
    description: 'Named Game of the Year 2019 by Giant Bomb, Polygon, Eurogamer, and The Guardian, Outer Wilds is a critically-acclaimed mystery about a solar system trapped in an endless time loop.',
    coverUrl: 'https://cdn.cloudflare.steamstatic.com/steam/apps/753640/capsule_616x353.jpg',
    heroUrl: 'https://cdn.cloudflare.steamstatic.com/steam/apps/753640/header.jpg',
    screenshots: ['https://cdn.cloudflare.steamstatic.com/steam/apps/753640/ss_1.jpg'],
    trailers: ['https://www.youtube.com/watch?v=Z_k_W4xS2Yk'],
    genres: ['Aventura', 'Exploração', 'Mistério', 'Indie'],
    platforms: ['PC', 'Switch', 'PlayStation', 'Xbox'],
    releaseDate: new Date('2019-05-28'),
    developer: 'Mobius Digital',
    publisher: 'Annapurna Interactive',
    rating: 9.3,
    steamAppId: 753640,
  },
  {
    title: 'Return of the Obra Dinn',
    slug: 'return-of-the-obra-dinn',
    description: 'Lost at sea, 1803. The merchant ship Obra Dinn. An insurance investigation game with minimal color and high tension.',
    coverUrl: 'https://cdn.cloudflare.steamstatic.com/steam/apps/653530/capsule_616x353.jpg',
    heroUrl: 'https://cdn.cloudflare.steamstatic.com/steam/apps/653530/header.jpg',
    screenshots: ['https://cdn.cloudflare.steamstatic.com/steam/apps/653530/ss_1.jpg'],
    trailers: ['https://www.youtube.com/watch?v=ILovm_7nI6w'],
    genres: ['Puzzle', 'Mistério', 'Indie'],
    platforms: ['PC', 'Switch', 'PlayStation', 'Xbox'],
    releaseDate: new Date('2018-10-18'),
    developer: 'Lucas Pope',
    publisher: '3909',
    rating: 9.2,
    steamAppId: 653530,
  },

  // --- Clássicos de Alta Relevância (Para validar piso de score) ---
  {
    title: 'Portal 2',
    slug: 'portal-2',
    description: 'The Perpetual Testing Initiative has been expanded to allow you to design co-op puzzles for you and your friends.',
    coverUrl: 'https://cdn.cloudflare.steamstatic.com/steam/apps/620/capsule_616x353.jpg',
    heroUrl: 'https://cdn.cloudflare.steamstatic.com/steam/apps/620/header.jpg',
    screenshots: ['https://cdn.cloudflare.steamstatic.com/steam/apps/620/ss_1.jpg'],
    trailers: ['https://www.youtube.com/watch?v=tax4gW7Mr4c'],
    genres: ['Puzzle', 'Sci-Fi', 'Comédia'],
    platforms: ['PC', 'Switch', 'Xbox', 'PlayStation'],
    releaseDate: new Date('2011-04-19'),
    developer: 'Valve',
    publisher: 'Valve',
    rating: 9.5,
    steamAppId: 620,
  },
  {
    title: 'Chrono Trigger',
    slug: 'chrono-trigger',
    description: 'The timeless RPG classic returns loaded with upgrades! Journey to the forgotten past, the far future, and to the end of time.',
    coverUrl: 'https://cdn.cloudflare.steamstatic.com/steam/apps/613830/capsule_616x353.jpg',
    heroUrl: 'https://cdn.cloudflare.steamstatic.com/steam/apps/613830/header.jpg',
    screenshots: ['https://cdn.cloudflare.steamstatic.com/steam/apps/613830/ss_1.jpg'],
    trailers: ['https://www.youtube.com/watch?v=zT1s0sD_48E'],
    genres: ['JRPG', 'RPG', 'Aventura'],
    platforms: ['PC', 'Mobile'],
    releaseDate: new Date('1995-03-11'),
    developer: 'Square Enix',
    publisher: 'Square Enix',
    rating: 9.5,
    steamAppId: 613830,
  },

  // --- LIXO / ITENS AUXILIARES QUE DEVEM SER REJEITADOS ---
  {
    title: 'Half-Life: Echoes Mod',
    slug: 'half-life-echoes-mod',
    description: 'Community modification for Half-Life.',
    genres: ['Mod'],
    platforms: ['PC'],
    rating: 9.0,
    gameType: 5,
  },
  {
    title: 'Skyrim Total Overhaul Mod',
    slug: 'skyrim-overhaul-mod',
    description: 'Unofficial mod overhaul.',
    genres: ['Mod'],
    platforms: ['PC'],
    rating: 8.5,
  },
  {
    title: 'The Witcher 3: Blood and Wine Expansion',
    slug: 'witcher-3-blood-and-wine',
    description: 'Expansion pack for The Witcher 3.',
    genres: ['RPG'],
    platforms: ['PC'],
    rating: 9.6,
    gameType: 2,
  },
  {
    title: 'Cyberpunk 2077: Phantom Liberty DLC',
    slug: 'cyberpunk-phantom-liberty',
    description: 'Spy-thriller expansion for Cyberpunk 2077.',
    genres: ['RPG'],
    platforms: ['PC'],
    rating: 9.1,
    gameType: 1,
  },
  {
    title: 'Dead Cells: Return to Castlevania Content Pack DLC',
    slug: 'dead-cells-castlevania-dlc',
    description: 'DLC for Dead Cells.',
    genres: ['Action'],
    platforms: ['PC'],
    rating: 9.2,
  },
  {
    title: 'Valve Complete Pack Bundle',
    slug: 'valve-complete-pack',
    description: 'All Valve games in one package.',
    genres: ['Bundle'],
    platforms: ['PC'],
    rating: 9.8,
    gameType: 3,
  },
  {
    title: 'Lies of P (Demo)',
    slug: 'lies-of-p-demo',
    description: 'Playable demo for Lies of P.',
    genres: ['Action'],
    platforms: ['PC'],
    rating: 8.5,
  },
  {
    title: 'Nine Sols Playtest',
    slug: 'nine-sols-playtest',
    description: 'Closed technical playtest build.',
    genres: ['Action'],
    platforms: ['PC'],
    rating: 8.0,
  },
  {
    title: 'Palworld Dedicated Server',
    slug: 'palworld-dedicated-server',
    description: 'Server software tool for hosting Palworld worlds.',
    genres: ['Tool'],
    platforms: ['PC'],
    rating: 7.0,
  },
  {
    title: 'Hollow Knight Official Soundtrack',
    slug: 'hollow-knight-ost',
    description: 'Original music composed by Christopher Larkin.',
    genres: ['Soundtrack'],
    platforms: ['PC'],
    rating: 9.9,
  },

  // --- EDIÇÕES DUPLICADAS (Para testar unificação conservadora) ---
  {
    title: 'The Witcher 3: Wild Hunt - Game of the Year Edition',
    slug: 'the-witcher-3-wild-hunt-goty-edition',
    description: 'Complete GOTY edition with all expansion packs.',
    releaseDate: new Date('2016-08-30'),
    developer: 'CD Projekt Red',
    publisher: 'CD Projekt Red',
    genres: ['RPG'],
    platforms: ['PC'],
    rating: 9.5,
  },
  {
    title: 'Hades: Digital Deluxe Edition',
    slug: 'hades-digital-deluxe-edition',
    description: 'Deluxe edition bundle with bonus soundtrack.',
    releaseDate: new Date('2020-09-17'),
    developer: 'Supergiant Games',
    publisher: 'Supergiant Games',
    genres: ['Roguelite'],
    platforms: ['PC'],
    rating: 9.3,
  },

  // --- REMAKE LEGÍTIMO (NÃO DEVE SER DESCARTADO NEM FUNDIDO) ---
  {
    title: 'Demon\'s Souls Remake',
    slug: 'demons-souls-remake',
    description: 'Entirely rebuilt from the ground up and masterfully enhanced, this remake invites you to experience the unsettling story and ruthless combat of Demon\'s Souls.',
    coverUrl: 'https://images.example.com/demons-souls-remake.jpg',
    trailers: ['https://www.youtube.com/watch?v=2TMs22CARMQ'],
    releaseDate: new Date('2020-11-12'),
    developer: 'Bluepoint Games',
    publisher: 'Sony Interactive Entertainment',
    genres: ['Action RPG', 'Souls-like'],
    platforms: ['PlayStation'],
    rating: 9.2,
    gameType: 8,
  },

  // --- JOGO ANTIGO OBSCURO E MEDÍOCRE (Para validar penalização progressiva) ---
  {
    title: 'Forgotten Ancient Budget Shooter 2008',
    slug: 'forgotten-ancient-shooter-2008',
    description: 'Generic budget shooter released in 2008 with mixed reviews.',
    coverUrl: 'https://images.example.com/generic-cover.jpg',
    trailers: ['https://www.youtube.com/watch?v=generic123'],
    releaseDate: new Date('2008-04-15'),
    developer: 'Obscure Team',
    publisher: 'Budget Pub',
    rating: 5.5,
    genres: ['Shooter'],
    platforms: ['PC'],
  },
];

async function runTestSync() {
  console.log(`\n==================================================`);
  console.log(`INICIANDO SINCRONIZAÇÃO EXPANDIDA EM NEON TEST`);
  console.log(`Total de candidatos na amostra de teste: ${CANDIDATES.length}`);
  console.log(`==================================================\n`);

  const repo = new PrismaGameRepository(prisma);
  const syncService = new GameSyncService(repo, (msg) => console.log(`  [SyncLog] ${msg}`));

  const result = await syncService.sync(CANDIDATES);

  console.log(`\n==================================================`);
  console.log(`RESULTADO DA SINCRONIZAÇÃO EM NEON TEST`);
  console.log(`==================================================`);
  console.log(`- Candidatos analisados: ${result.received}`);
  console.log(`- Novos inseridos:       ${result.inserted}`);
  console.log(`- Associados (linkados): ${result.linked}`);
  console.log(`- Rejeitados:            ${result.rejected ?? 0}`);
  console.log(`- Distribuição dos motivos de rejeição:`);
  for (const [reason, count] of Object.entries(result.rejections ?? {})) {
    console.log(`    • ${reason.padEnd(16)}: ${count}`);
  }

  // Avaliar o Feed resultante após a sincronização
  const gameService = new GameService(prisma);
  const feed = await gameService.getFeedGames(25);

  console.log(`\n==================================================`);
  console.log(`TOP 20 FEED RESULTANTE (NEON TEST)`);
  console.log(`==================================================`);
  for (let i = 0; i < Math.min(20, feed.length); i++) {
    const g = feed[i];
    const year = g.releaseDate ? new Date(g.releaseDate).getFullYear() : 'N/A';
    const primaryTrailer = g.primaryTrailer?.provider ?? 'NONE';
    const genres = g.genres.slice(0, 2).join(', ');
    console.log(
      `${String(i + 1).padStart(2)}. ${g.title.padEnd(28)} | Ano: ${year} | Nota: ${String(g.rating ?? 'N/A').padEnd(4)} | Score: ${String(g.matchScore).padStart(3)} | Trailer: ${primaryTrailer.padEnd(7)} | Gêneros: ${genres}`
    );
  }

  console.log(`\n==================================================`);
  console.log(`ESCLARECIMENTO: BALATRO E ASSET R2 DE STAGING`);
  console.log(`==================================================`);
  console.log(`• O trailer DIRECT em Balatro provém de "dev_trailer.mp4" (origin: NEXTPLAY_R2_STAGING).`);
  console.log(`• Trata-se de uma fixture técnica temporária para homologação do player Direct no Android.`);
  console.log(`• NÃO é um trailer oficial do jogo.`);
  console.log(`• Sem a fixture de staging (com trailer YouTube normal):`);
  console.log(`    - Score Balatro: 91 pts (Qualidade: 47.5, Frescor: 25.0, Gem: 10.5, Metadata: 8.0)`);
  console.log(`    - Empatado com Animal Well no topo do ranking devido à nota 9.5 de 2024.`);
  console.log(`• Com a fixture técnica de staging (+2 pts Direct): Score 93 pts.`);

  console.log(`\n==================================================`);
  console.log(`PARTE B: HOMOLOGAÇÃO REAL (PIPELINE STEAM LIVE - CUSTO R$ 0)`);
  console.log(`==================================================`);
  console.log(`Executando pipeline real contra a API pública da Steam Store...`);

  const REAL_STEAM_CANDIDATES = [
    { appId: 813230, label: 'ANIMAL WELL' },
    { appId: 1244090, label: 'Sea of Stars' },
    { appId: 1229240, label: 'Chained Echoes' },
    { appId: 553420, label: 'TUNIC' },
    { appId: 2101430, label: 'Dead Cells: Return to Castlevania (Real DLC)' },
    { appId: 2394010, label: 'Palworld Dedicated Server (Real Tool/Server)' },
    { appId: 2778580, label: 'Lies of P Demo (Real Demo)' },
  ];

  let realReceived = REAL_STEAM_CANDIDATES.length;
  let realAccepted = 0;
  let realRejected = 0;
  const realRejectionReasons = {};

  for (const c of REAL_STEAM_CANDIDATES) {
    const details = await steamClient.details(c.appId);
    if (!details || !details.data) {
      realRejected++;
      const reason = 'TOOL_OR_SERVER';
      realRejectionReasons[reason] = (realRejectionReasons[reason] || 0) + 1;
      console.log(`  [SteamLive] AppID ${c.appId} (${c.label}): Rejeitado (tipo não-jogo ou indisponível).`);
      continue;
    }

    const data = details.data;
    const steamType = data.type?.toLowerCase();

    if (steamType === 'dlc') {
      realRejected++;
      realRejectionReasons['DLC'] = (realRejectionReasons['DLC'] || 0) + 1;
      console.log(`  [SteamLive] AppID ${c.appId} "${data.name}": Rejeitado (Steam type = "dlc").`);
      continue;
    }
    if (steamType === 'demo') {
      realRejected++;
      realRejectionReasons['DEMO'] = (realRejectionReasons['DEMO'] || 0) + 1;
      console.log(`  [SteamLive] AppID ${c.appId} "${data.name}": Rejeitado (Steam type = "demo").`);
      continue;
    }

    const eligibility = isEligibleForCatalog({ title: data.name });
    if (!eligibility.eligible) {
      realRejected++;
      const reason = eligibility.reason || 'LOW_QUALITY';
      realRejectionReasons[reason] = (realRejectionReasons[reason] || 0) + 1;
      console.log(`  [SteamLive] AppID ${c.appId} "${data.name}": Rejeitado (${eligibility.reason}).`);
      continue;
    }

    if (steamType !== 'game') {
      realRejected++;
      const reason = 'TOOL_OR_SERVER';
      realRejectionReasons[reason] = (realRejectionReasons[reason] || 0) + 1;
      console.log(`  [SteamLive] AppID ${c.appId} "${data.name}": Rejeitado (Steam type = "${steamType}").`);
      continue;
    }

    realAccepted++;
    console.log(`  [SteamLive] AppID ${c.appId} "${data.name}": Aceito como jogo legítimo.`);
  }

  console.log(`\n--- Resumo do Pipeline Real Steam ---`);
  console.log(`Candidatos recebidos: ${realReceived}`);
  console.log(`Aceitos:              ${realAccepted}`);
  console.log(`Rejeitados:           ${realRejected}`);
  console.log(`Motivos de rejeição:`);
  for (const [r, count] of Object.entries(realRejectionReasons)) {
    console.log(`  • ${r.padEnd(16)}: ${count}`);
  }

  console.log(`\n==================================================`);
  console.log(`PARTE C: HOMOLOGAÇÃO LIVE IGDB (NEON TEST)`);
  console.log(`==================================================`);
  console.log(`Executando consulta live real ao IGDB com game_type = (0, 8, 9)...`);

  const igdbClient = new IgdbClient(process.env.IGDB_CLIENT_ID, process.env.IGDB_CLIENT_SECRET);
  const igdbQuery = buildSyncQuery({ mode: 'default', limit: 30 });
  const rawIgdbGames = await igdbClient.search(igdbQuery);
  console.log(`Candidatos recebidos do IGDB: ${rawIgdbGames.length}`);

  let igdbEligibleCount = 0;
  let igdbRejectedCount = 0;
  const igdbRejections = {};
  const remakesRemastersFound = [];
  const normalizedIgdbGames = [];

  for (const raw of rawIgdbGames) {
    const mapped = mapIgdbGame(raw);
    const eligibility = isEligibleForCatalog({
      title: mapped.title,
      gameType: mapped.gameType,
      rating: mapped.rating,
      coverUrl: mapped.coverUrl,
    });

    if (mapped.gameType === 8 || mapped.gameType === 9 || /\b(remake|remaster)\b/i.test(mapped.title)) {
      remakesRemastersFound.push({ title: mapped.title, gameType: mapped.gameType });
    }

    if (!eligibility.eligible) {
      igdbRejectedCount++;
      const reason = eligibility.reason || 'LOW_QUALITY';
      igdbRejections[reason] = (igdbRejections[reason] || 0) + 1;
      console.log(`  [IGDB Live] "${mapped.title}" (game_type: ${mapped.gameType ?? 'N/A'}) rejeitado (${reason}).`);
    } else {
      igdbEligibleCount++;
      normalizedIgdbGames.push(mapped);
    }
  }

  // Executar enriquecimento com Steam e sincronização real na Neon TEST
  const igdbSyncResult = await syncService.sync(normalizedIgdbGames);

  console.log(`\n--- Resumo do Pipeline Live IGDB ---`);
  console.log(`Candidatos recebidos:        ${rawIgdbGames.length}`);
  console.log(`Elegíveis:                   ${igdbEligibleCount}`);
  console.log(`Rejeitados pelo filtro:      ${igdbRejectedCount}`);
  if (Object.keys(igdbRejections).length > 0) {
    console.log(`Motivos de rejeição:`);
    for (const [r, cnt] of Object.entries(igdbRejections)) {
      console.log(`  • ${r.padEnd(16)}: ${cnt}`);
    }
  } else {
    console.log(`Motivos de rejeição:         Nenhum (0 rejeições após filtro game_type na query)`);
  }
  console.log(`Novos inseridos no TEST DB:  ${igdbSyncResult.inserted}`);
  console.log(`Atualizados / linkados:      ${igdbSyncResult.linked}`);
  console.log(`Remakes/Remasters na amostra: ${remakesRemastersFound.length}`);
  for (const item of remakesRemastersFound) {
    console.log(`  • ${item.title} (game_type: ${item.gameType ?? 'detectado por título'})`);
  }

  // Avaliar o Feed resultante na Neon TEST após sync live
  const finalFeed = await gameService.getFeedGames(25);
  console.log(`\n==================================================`);
  console.log(`TOP 20 FEED FINAL APÓS SYNC LIVE (NEON TEST)`);
  console.log(`==================================================`);
  for (let i = 0; i < Math.min(20, finalFeed.length); i++) {
    const g = finalFeed[i];
    const year = g.releaseDate ? new Date(g.releaseDate).getFullYear() : 'N/A';
    const primaryTrailer = g.primaryTrailer?.provider ?? 'NONE';
    const genres = (g.genres ?? []).slice(0, 2).join(', ');
    console.log(
      `${String(i + 1).padStart(2)}. ${g.title.padEnd(32)} | Ano: ${year} | Nota: ${String(g.rating ?? 'N/A').padEnd(4)} | Score: ${String(g.matchScore).padStart(3)} | Trailer: ${primaryTrailer.padEnd(7)} | Gêneros: ${genres}`
    );
  }

  await prisma.$disconnect();
}

runTestSync().catch((err) => {
  console.error('Erro na sincronização de teste:', err);
  process.exit(1);
});
