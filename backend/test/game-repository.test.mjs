import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { PrismaGameRepository } from '../dist/modules/games/prisma-game.repository.js';

const db = new PrismaClient({ log: [] });
const rollback = new Error('ROLLBACK_TEST_FIXTURES');

async function verify(label, action) {
  let outcome;
  try {
    await db.$transaction(async (tx) => {
      await action(tx);
      throw rollback;
    });
  } catch (error) {
    outcome = error;
  }
  if (outcome !== rollback) {
    console.error(`Falha em "${label}":`, outcome);
    throw new Error(label);
  }
  console.log('OK: ' + label);
}

try {
  const target = new URL(process.env.DATABASE_URL);
  if (
    !['localhost', '127.0.0.1', '[::1]'].includes(target.hostname) ||
    target.pathname !== '/nextplay'
  ) {
    throw new Error('Este teste exige o banco nextplay local');
  }

  await verify('PrismaGameRepository insere, busca candidatos e atualiza jogo', async (tx) => {
    const repo = new PrismaGameRepository(tx);
    const token = randomUUID().slice(0, 8);
    const mockGame = {
      title: `Hades Test ${token}`,
      slug: `hades-test-${token}`,
      description: 'Roguelike dungeon crawler',
      developer: 'Supergiant Games',
      publisher: 'Supergiant Games',
      rating: 9.3,
      releaseDate: new Date('2020-09-17'),
      genres: ['Action', 'Roguelike', 'Indie'],
      platforms: ['PC', 'Switch'],
      screenshots: ['https://example.com/hades-shot-1.jpg', 'https://example.com/hades-shot-2.jpg'],
      trailers: ['https://example.com/hades-trailer.mp4'],
      isFree: false,
      igdbId: 100000 + Math.floor(Math.random() * 800000),
      steamAppId: 200000 + Math.floor(Math.random() * 800000),
      steam: {
        storeUrl: 'https://store.steampowered.com/app/1145360/',
        priceCents: 7399,
        discountPercent: 0,
        currency: 'BRL',
        isAvailable: true,
      },
    };

    // 1. Upsert novo jogo
    await repo.upsertByExternalId(mockGame);

    // 2. Busca candidatos
    const candidates = await repo.findCandidates(mockGame);
    assert.ok(candidates.length >= 1, 'Deve encontrar pelo menos um candidato');
    const stored = candidates.find((c) => c.slug === mockGame.slug);
    assert.ok(stored, 'O jogo persistido deve estar entre os candidatos');
    assert.equal(stored.title, mockGame.title);
    assert.equal(stored.developer, 'Supergiant Games');
    assert.deepEqual(stored.genres.sort(), ['Action', 'Indie', 'Roguelike']);
    assert.deepEqual(stored.platforms.sort(), ['PC', 'Switch']);
    assert.equal(stored.screenshots.length, 2);
    assert.deepEqual(stored.trailers, ['https://example.com/hades-trailer.mp4']);
    assert.equal(stored.steam?.priceCents, 7399);
    const persisted = await tx.game.findUnique({ where: { id: stored.id } });
    assert.equal(persisted?.source, 'IGDB');
    assert.equal(persisted?.sourceId, String(mockGame.igdbId));
    assert.equal(persisted?.isFree, false);

    // 3. Atualização idempotente
    const updatedGame = {
      ...mockGame,
      rating: 9.5,
      genres: ['Action', 'Roguelike', 'Indie', 'RPG'],
      steam: {
        ...mockGame.steam,
        priceCents: 3699,
        discountPercent: 50,
      },
    };
    await repo.upsertByExternalId(updatedGame);

    const candidatesAfterUpdate = await repo.findCandidates(mockGame);
    const updatedStored = candidatesAfterUpdate.find((c) => c.slug === mockGame.slug);
    assert.ok(updatedStored);
    assert.equal(updatedStored.rating, 9.5);
    assert.ok(updatedStored.genres.includes('RPG'));

    const mediaCount = await tx.gameMedia.count({ where: { gameId: stored.id } });
    assert.equal(mediaCount, 3, 'Mídia repetida deve permanecer idempotente');
    const offerCount = await tx.steamOffer.count({ where: { gameId: stored.id } });
    assert.equal(offerCount, 2, 'Uma nova cotação deve criar apenas um novo snapshot');
    await repo.upsertByExternalId(updatedGame);
    assert.equal(
      await tx.steamOffer.count({ where: { gameId: stored.id } }),
      2,
      'O mesmo snapshot Steam não deve ser duplicado',
    );

    // 4. Vinculação de IDs externos
    const newIgdbId = 999999;
    await repo.linkExternalIds(stored.id, { igdbId: newIgdbId });
    const gameAfterLink = await tx.game.findUnique({ where: { id: stored.id } });
    assert.equal(gameAfterLink?.igdbId, newIgdbId);

    // 5. Marcação de sincronização
    await repo.markSynced(stored.id);
    const gameAfterSync = await tx.game.findUnique({ where: { id: stored.id } });
    assert.ok(gameAfterSync?.lastSyncedAt);
  });

  console.log('Todos os testes do PrismaGameRepository passaram com sucesso.');
} catch (error) {
  console.error('Falha nos testes do repositório:', error);
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
