/**
 * Seed de desenvolvimento — NextPlay
 *
 * Popula o banco com ~10 jogos representativos para testar
 * o feed, a biblioteca e os filtros da API.
 *
 * Idempotência: usa PrismaGameRepository.upsertByExternalId,
 * que faz upsert por slug/igdbId/steamAppId. Executar múltiplas
 * vezes não cria duplicatas.
 *
 * Execução: pnpm run seed  (tsx prisma/seed.ts)
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaGameRepository } from '../src/modules/games/prisma-game.repository.js';
import type { NormalizedGame } from '../src/modules/games/normalized-game.js';

const GAMES: NormalizedGame[] = [
  {
    title: 'Hollow Knight',
    slug: 'hollow-knight',
    description:
      'Um épico de ação e aventura através de um reino de insetos subterrâneo. Explore cavernas sinuosas, cidades antigas e esconderijos mortais enquanto luta contra criaturas corrompidas e descobre segredos esquecidos.',
    coverUrl: 'https://cdn.cloudflare.steamstatic.com/steam/apps/367520/capsule_616x353.jpg',
    heroUrl: 'https://cdn.cloudflare.steamstatic.com/steam/apps/367520/ss_af0e5fdcc38c34c99daa6dad2cd68e67b3ce5e5d.jpg',
    screenshots: [
      'https://cdn.cloudflare.steamstatic.com/steam/apps/367520/ss_af0e5fdcc38c34c99daa6dad2cd68e67b3ce5e5d.jpg',
      'https://cdn.cloudflare.steamstatic.com/steam/apps/367520/ss_8eb017d8e5ba8df25ab1a72b60d79c02e5a16fc0.jpg',
    ],
    trailers: ['https://www.youtube.com/watch?v=UAO2urG23S4'],
    genres: ['Metroidvania', 'Ação', 'Aventura', 'Indie'],
    platforms: ['PC', 'Switch'],
    releaseDate: new Date('2017-02-24'),
    developer: 'Team Cherry',
    publisher: 'Team Cherry',
    rating: 9.1,
    steamAppId: 367520,
    steam: {
      storeUrl: 'https://store.steampowered.com/app/367520/Hollow_Knight/',
      priceCents: 1499,
      currency: 'BRL',
      isAvailable: true,
    },
  },
  {
    title: 'Hades',
    slug: 'hades',
    description:
      'Desafie o deus dos mortos enquanto luta para escapar do submundo grego neste rogue-like de ação desenvolvido pelos criadores de Bastion e Transistor.',
    coverUrl: 'https://cdn.cloudflare.steamstatic.com/steam/apps/1145360/capsule_616x353.jpg',
    heroUrl: 'https://cdn.cloudflare.steamstatic.com/steam/apps/1145360/ss_0e30d9af5ce9ef8e90a068a9df05e0e73d1d0a39.jpg',
    screenshots: [
      'https://cdn.cloudflare.steamstatic.com/steam/apps/1145360/ss_0e30d9af5ce9ef8e90a068a9df05e0e73d1d0a39.jpg',
      'https://cdn.cloudflare.steamstatic.com/steam/apps/1145360/ss_89e50c3d40ee75df1a82cef6432da51b65b8e7a4.jpg',
    ],
    trailers: ['https://www.youtube.com/watch?v=91t0GybU1Cc'],
    genres: ['Roguelite', 'Ação', 'RPG', 'Indie'],
    platforms: ['PC', 'Switch', 'PlayStation', 'Xbox'],
    releaseDate: new Date('2020-09-17'),
    developer: 'Supergiant Games',
    publisher: 'Supergiant Games',
    rating: 9.3,
    steamAppId: 1145360,
    steam: {
      storeUrl: 'https://store.steampowered.com/app/1145360/Hades/',
      priceCents: 3699,
      currency: 'BRL',
      isAvailable: true,
    },
  },
  {
    title: 'Celeste',
    slug: 'celeste',
    description:
      'Ajude Madeline a sobreviver em sua jornada interior para escalar o Monte Celeste neste plataformer preciso e emocionalmente rico.',
    coverUrl: 'https://cdn.cloudflare.steamstatic.com/steam/apps/504230/capsule_616x353.jpg',
    heroUrl: 'https://cdn.cloudflare.steamstatic.com/steam/apps/504230/ss_0f4adbb6d4b0f62bf09ad31578279f9e11e2e25d.jpg',
    screenshots: [
      'https://cdn.cloudflare.steamstatic.com/steam/apps/504230/ss_0f4adbb6d4b0f62bf09ad31578279f9e11e2e25d.jpg',
    ],
    trailers: ['https://www.youtube.com/watch?v=70d9irlxiB4'],
    genres: ['Plataforma', 'Indie', 'Aventura'],
    platforms: ['PC', 'Switch', 'PlayStation', 'Xbox'],
    releaseDate: new Date('2018-01-25'),
    developer: 'Maddy Makes Games',
    publisher: 'Matt Makes Games',
    rating: 9.4,
    steamAppId: 504230,
    steam: {
      storeUrl: 'https://store.steampowered.com/app/504230/Celeste/',
      priceCents: 1999,
      currency: 'BRL',
      isAvailable: true,
    },
  },
  {
    title: 'Stardew Valley',
    slug: 'stardew-valley',
    description:
      'Você herdou a velha fazenda do seu avô. Com algumas ferramentas antigas e algum dinheiro, você começa sua nova vida. Pode você aprender a viver fora da terra e transformar esses campos abandonados em um lar próspero?',
    coverUrl: 'https://cdn.cloudflare.steamstatic.com/steam/apps/413150/capsule_616x353.jpg',
    heroUrl: 'https://cdn.cloudflare.steamstatic.com/steam/apps/413150/ss_6bf47e34c98b14a68e77cacc17f36b01ed14a297.jpg',
    screenshots: [
      'https://cdn.cloudflare.steamstatic.com/steam/apps/413150/ss_6bf47e34c98b14a68e77cacc17f36b01ed14a297.jpg',
    ],
    trailers: ['https://www.youtube.com/watch?v=ot7uXNQskdU'],
    genres: ['Simulação', 'RPG', 'Indie'],
    platforms: ['PC', 'Switch', 'PlayStation', 'Xbox', 'Mobile'],
    releaseDate: new Date('2016-02-26'),
    developer: 'ConcernedApe',
    publisher: 'ConcernedApe',
    rating: 9.5,
    steamAppId: 413150,
    steam: {
      storeUrl: 'https://store.steampowered.com/app/413150/Stardew_Valley/',
      priceCents: 2799,
      currency: 'BRL',
      isAvailable: true,
    },
  },
  {
    title: 'Deep Rock Galactic',
    slug: 'deep-rock-galactic',
    description:
      'Cooperativo para 1–4 jogadores. Space Dwarves versus bugs alienígenas. Explore cavernas procedurais totalmente destrutíveis, colete recursos e complete missões.',
    coverUrl: 'https://cdn.cloudflare.steamstatic.com/steam/apps/548430/capsule_616x353.jpg',
    heroUrl: 'https://cdn.cloudflare.steamstatic.com/steam/apps/548430/ss_8a0ba2ece4e7eea9a37fc5d2a0a9d7a8c3ef94a3.jpg',
    screenshots: [
      'https://cdn.cloudflare.steamstatic.com/steam/apps/548430/ss_8a0ba2ece4e7eea9a37fc5d2a0a9d7a8c3ef94a3.jpg',
    ],
    trailers: ['https://www.youtube.com/watch?v=kYv_8wZtEwE'],
    genres: ['Cooperativo', 'Ação', 'Shooter', 'Indie'],
    platforms: ['PC', 'Xbox'],
    releaseDate: new Date('2020-05-13'),
    developer: 'Ghost Ship Games',
    publisher: 'Coffee Stain Publishing',
    rating: 9.2,
    steamAppId: 548430,
    steam: {
      storeUrl: 'https://store.steampowered.com/app/548430/Deep_Rock_Galactic/',
      priceCents: 4499,
      currency: 'BRL',
      isAvailable: true,
    },
  },
  {
    title: 'Disco Elysium',
    slug: 'disco-elysium',
    description:
      'Um RPG de investigação revolucionário. Você é um detetive com um mundo inteiro na sua cabeça. Converse com tudo e todos, resolva o crime de muitas maneiras — ou torne-se um fracasso épico.',
    coverUrl: 'https://cdn.cloudflare.steamstatic.com/steam/apps/632470/capsule_616x353.jpg',
    heroUrl: 'https://cdn.cloudflare.steamstatic.com/steam/apps/632470/ss_ea5e39c79e5cf8a4e49c6c2d0cbf494c2aca62c1.jpg',
    screenshots: [
      'https://cdn.cloudflare.steamstatic.com/steam/apps/632470/ss_ea5e39c79e5cf8a4e49c6c2d0cbf494c2aca62c1.jpg',
    ],
    trailers: ['https://www.youtube.com/watch?v=T_s3tJ7Zl-E'],
    genres: ['RPG', 'Aventura', 'Indie'],
    platforms: ['PC', 'PlayStation'],
    releaseDate: new Date('2019-10-15'),
    developer: 'ZA/UM',
    publisher: 'ZA/UM',
    rating: 9.1,
    steamAppId: 632470,
    steam: {
      storeUrl: 'https://store.steampowered.com/app/632470/Disco_Elysium__The_Final_Cut/',
      priceCents: 5999,
      currency: 'BRL',
      isAvailable: true,
    },
  },
  {
    title: 'Pacific Drive',
    slug: 'pacific-drive',
    description:
      'Uma corrida de sobrevivência single-player através do Noroeste Pacífico sobrenatural. Seu carro é seu único companheiro enquanto você navega por uma zona de exclusão repleta de anomalias eletrizantes.',
    coverUrl: 'https://cdn.cloudflare.steamstatic.com/steam/apps/1458140/capsule_616x353.jpg',
    heroUrl: 'https://cdn.cloudflare.steamstatic.com/steam/apps/1458140/ss_4fdc8a4c9b1e1ef3ddb74d3e7c0f2f9d5c5b6a7b.jpg',
    screenshots: [
      'https://cdn.cloudflare.steamstatic.com/steam/apps/1458140/ss_4fdc8a4c9b1e1ef3ddb74d3e7c0f2f9d5c5b6a7b.jpg',
    ],
    trailers: ['https://www.youtube.com/watch?v=k_l2jXz94eM'],
    genres: ['Sobrevivência', 'Ação', 'Aventura'],
    platforms: ['PC', 'PlayStation'],
    releaseDate: new Date('2024-02-22'),
    developer: 'Ironwood Studios',
    publisher: 'Kepler Interactive',
    rating: 7.8,
    steamAppId: 1458140,
    steam: {
      storeUrl: 'https://store.steampowered.com/app/1458140/Pacific_Drive/',
      priceCents: 14999,
      currency: 'BRL',
      isAvailable: true,
    },
  },
  {
    title: 'Subnautica',
    slug: 'subnautica',
    description:
      'Mergulhe em um oceano alienígena em um mundo aquático coberto de água. Construa bases subaquáticas, pilote submarinos e sobreviva em profundezas cada vez mais perigosas.',
    coverUrl: 'https://cdn.cloudflare.steamstatic.com/steam/apps/264710/capsule_616x353.jpg',
    heroUrl: 'https://cdn.cloudflare.steamstatic.com/steam/apps/264710/ss_e10e13e5e40a524c6c26e57da5e395f5d0bec0fb.jpg',
    screenshots: [
      'https://cdn.cloudflare.steamstatic.com/steam/apps/264710/ss_e10e13e5e40a524c6c26e57da5e395f5d0bec0fb.jpg',
    ],
    trailers: ['https://www.youtube.com/watch?v=Rz2SNm8VguE'],
    genres: ['Sobrevivência', 'Aventura', 'Mundo Aberto'],
    platforms: ['PC', 'PlayStation', 'Xbox'],
    releaseDate: new Date('2018-01-23'),
    developer: 'Unknown Worlds Entertainment',
    publisher: 'Unknown Worlds Entertainment',
    rating: 8.9,
    steamAppId: 264710,
    steam: {
      storeUrl: 'https://store.steampowered.com/app/264710/Subnautica/',
      priceCents: 6999,
      currency: 'BRL',
      isAvailable: true,
    },
  },
  {
    title: 'Balatro',
    slug: 'balatro',
    description:
      'Um roguelite de poker hipnótico. Jogue mãos ilegais, descubra combinações de jokers impossíveis e desafie as regras do poker enquanto cresce em um ciclo viciante de apostas e recompensas.',
    coverUrl: 'https://cdn.cloudflare.steamstatic.com/steam/apps/2379780/capsule_616x353.jpg',
    heroUrl: 'https://cdn.cloudflare.steamstatic.com/steam/apps/2379780/ss_d8a1e9a24cd0eee9e4c09e2e9b6a66d1b8a6c9a1.jpg',
    screenshots: [
      'https://cdn.cloudflare.steamstatic.com/steam/apps/2379780/ss_d8a1e9a24cd0eee9e4c09e2e9b6a66d1b8a6c9a1.jpg',
    ],
    trailers: ['https://www.youtube.com/watch?v=f7BqGkXzQc8'],
    genres: ['Roguelite', 'Card Game', 'Estratégia', 'Indie'],
    platforms: ['PC', 'Switch', 'PlayStation', 'Xbox', 'Mobile'],
    releaseDate: new Date('2024-02-20'),
    developer: 'LocalThunk',
    publisher: 'Playstack',
    rating: 9.5,
    steamAppId: 2379780,
    steam: {
      storeUrl: 'https://store.steampowered.com/app/2379780/Balatro/',
      priceCents: 8999,
      currency: 'BRL',
      isAvailable: true,
    },
  },
  {
    title: 'Vampire Survivors',
    slug: 'vampire-survivors',
    description:
      'Um jogo de ação e sobrevivência com elementos roguelite góticos. Evite ser engolido pelas hordas e colha suficiente ouro para fortalecer a próxima corrida.',
    coverUrl: 'https://cdn.cloudflare.steamstatic.com/steam/apps/1794680/capsule_616x353.jpg',
    heroUrl: 'https://cdn.cloudflare.steamstatic.com/steam/apps/1794680/ss_e0c2ccf48fba2fdb78e2d7af7c7fe1a27e0edf82.jpg',
    screenshots: [
      'https://cdn.cloudflare.steamstatic.com/steam/apps/1794680/ss_e0c2ccf48fba2fdb78e2d7af7c7fe1a27e0edf82.jpg',
    ],
    trailers: ['https://www.youtube.com/watch?v=mY9Z8mY_QcE'],
    genres: ['Roguelite', 'Ação', 'Indie'],
    platforms: ['PC', 'Switch', 'Xbox', 'Mobile'],
    releaseDate: new Date('2022-10-20'),
    developer: 'poncle',
    publisher: 'poncle',
    rating: 8.6,
    steamAppId: 1794680,
    isFree: false,
    steam: {
      storeUrl: 'https://store.steampowered.com/app/1794680/Vampire_Survivors/',
      priceCents: 1499,
      currency: 'BRL',
      isAvailable: true,
    },
  },
];

async function main() {
  const prisma = new PrismaClient();
  const repo = new PrismaGameRepository(prisma);

  console.log(`Iniciando seed com ${GAMES.length} jogos…`);

  let inserted = 0;
  let updated = 0;

  for (const game of GAMES) {
    const slug = game.slug ?? game.title.toLowerCase().replace(/\s+/g, '-');

    // Verifica se já existe para exibir mensagem adequada
    const existing = await prisma.game.findUnique({ where: { slug } });

    await repo.upsertByExternalId(game);

    if (existing) {
      updated++;
      console.log(`  ↻ Atualizado: ${game.title}`);
    } else {
      inserted++;
      console.log(`  + Inserido:   ${game.title}`);
    }
  }

  const total = await prisma.game.count();
  console.log(`\nSeed concluído. Inseridos: ${inserted} | Atualizados: ${updated} | Total no banco: ${total}`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Seed falhou:', err);
  process.exit(1);
});
