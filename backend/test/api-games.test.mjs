import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { buildApp } from '../dist/app.js';
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

  await verify('Endpoints HTTP REST de catálogo e feed respondem corretamente', async (tx) => {
    const app = await buildApp({ prisma: tx });
    const repo = new PrismaGameRepository(tx);
    const token = randomUUID().slice(0, 8);

    await repo.upsertByExternalId({
      title: `API Test Game ${token}`,
      slug: `api-test-game-${token}`,
      description: 'Test game description for API endpoint verification',
      developer: 'API Dev Studio',
      publisher: 'API Publisher',
      rating: 9.1,
      releaseDate: new Date('2024-05-10'),
      genres: ['RPG', 'Adventure'],
      platforms: ['PC', 'PlayStation'],
      screenshots: ['https://example.com/api-shot.jpg'],
      steamAppId: 999123,
      steam: {
        storeUrl: 'https://store.steampowered.com/app/999123/',
        priceCents: 4999,
        discountPercent: 10,
        currency: 'BRL',
        isAvailable: true,
      },
    });

    // 1. Health check
    const healthRes = await app.inject({ method: 'GET', url: '/health' });
    assert.equal(healthRes.statusCode, 200);
    const healthBody = JSON.parse(healthRes.payload);
    assert.equal(healthBody.status, 'ok');
    assert.equal(healthBody.service, 'nextplay-backend');

    // 2. Listagem paginada
    const listRes = await app.inject({ method: 'GET', url: '/api/v1/games?limit=10' });
    assert.equal(listRes.statusCode, 200);
    const listBody = JSON.parse(listRes.payload);
    assert.ok(Array.isArray(listBody.data));
    assert.ok(listBody.meta.total >= 1);
    assert.equal(listBody.meta.limit, 10);

    // 3. Busca por termo
    const searchRes = await app.inject({
      method: 'GET',
      url: `/api/v1/games?search=${encodeURIComponent(token)}`,
    });
    assert.equal(searchRes.statusCode, 200);
    const searchBody = JSON.parse(searchRes.payload);
    assert.equal(searchBody.data.length, 1);
    assert.equal(searchBody.data[0].slug, `api-test-game-${token}`);
    assert.deepEqual(searchBody.data[0].genres.sort(), ['Adventure', 'RPG']);
    assert.deepEqual(searchBody.data[0].platforms.sort(), ['PC', 'PlayStation']);

    // 4. Detalhes de jogo por slug
    const detailRes = await app.inject({
      method: 'GET',
      url: `/api/v1/games/api-test-game-${token}`,
    });
    assert.equal(detailRes.statusCode, 200);
    const detailBody = JSON.parse(detailRes.payload);
    assert.equal(detailBody.title, `API Test Game ${token}`);
    assert.equal(detailBody.screenshots.length, 1);
    assert.equal(detailBody.steam?.priceCents, 4999);

    // 5. Detalhes de jogo por Steam AppId
    const steamDetailRes = await app.inject({
      method: 'GET',
      url: '/api/v1/games/999123',
    });
    assert.equal(steamDetailRes.statusCode, 200);
    const steamDetailBody = JSON.parse(steamDetailRes.payload);
    assert.equal(steamDetailBody.slug, `api-test-game-${token}`);

    // 6. 404 para jogo inexistente
    const notFoundRes = await app.inject({
      method: 'GET',
      url: '/api/v1/games/non-existent-slug-xyz-404',
    });
    assert.equal(notFoundRes.statusCode, 404);
    const notFoundBody = JSON.parse(notFoundRes.payload);
    assert.equal(notFoundBody.statusCode, 404);

    // 7. Feed de descoberta
    const feedRes = await app.inject({ method: 'GET', url: '/api/v1/feed' });
    assert.equal(feedRes.statusCode, 200);
    const feedBody = JSON.parse(feedRes.payload);
    assert.ok(Array.isArray(feedBody.data));
    assert.ok(feedBody.total >= 1);
    const feedGame = feedBody.data.find((g) => g.slug === `api-test-game-${token}`);
    assert.ok(feedGame, 'Jogo criado deve estar disponível no feed');
    assert.equal(feedGame.matchScore, 95);

    await app.close();
  });

  console.log('Todos os testes de API passaram com sucesso.');
} catch (error) {
  console.error('Falha nos testes de API:', error);
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
