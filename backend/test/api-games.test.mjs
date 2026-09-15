import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { buildApp } from '../dist/app.js';
import { PrismaGameRepository } from '../dist/modules/games/prisma-game.repository.js';
import { createTestPrismaClient, safeTestFailure } from './test-database.mjs';

process.env.NODE_ENV = 'test';
let db;
const rollback = new Error('ROLLBACK_TEST_FIXTURES');

async function verify(label, action) {
  let outcome;
  try {
    await db.$transaction(
      async (tx) => {
        await action(tx);
        throw rollback;
      },
      { maxWait: 15000, timeout: 30000 },
    );
  } catch (error) {
    outcome = error;
  }
  if (outcome !== rollback) {
    throw new Error(label, { cause: outcome });
  }
  console.log('OK: ' + label);
}

try {
  db = createTestPrismaClient();

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
      trailers: ['https://example.com/api-trailer.mp4'],
      isFree: true,
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
    for (const url of [
      '/api/v1/games?page=abc',
      '/api/v1/games?limit=1.5',
      '/api/v1/feed?limit=abc',
    ]) {
      const invalid = await app.inject({ method: 'GET', url });
      assert.equal(invalid.statusCode, 400);
    }

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
    assert.deepEqual(detailBody.trailers, ['https://example.com/api-trailer.mp4']);
    assert.equal(detailBody.isFree, true);
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
    const feedRes = await app.inject({ method: 'GET', url: '/api/v1/feed?limit=100' });
    assert.equal(feedRes.statusCode, 200);
    const feedBody = JSON.parse(feedRes.payload);
    assert.ok(Array.isArray(feedBody.data));
    assert.ok(feedBody.total >= 1);
    const feedGame = feedBody.data.find((g) => g.slug === `api-test-game-${token}`);
    assert.ok(feedGame, 'Jogo criado deve estar disponível no feed');
    assert.ok(typeof feedGame.matchScore === 'number' && feedGame.matchScore >= 1 && feedGame.matchScore <= 100);
    assert.deepEqual(feedGame.trailers, ['https://example.com/api-trailer.mp4']);
    assert.equal(feedGame.isFree, true);

    await app.close();
  });

  await verify('Endpoints de catálogo e feed priorizam DIRECT e protegem authorizationRef', async (tx) => {
    const app = await buildApp({ prisma: tx });
    const repo = new PrismaGameRepository(tx);
    const token = randomUUID().slice(0, 8);

    // Jogo com DIRECT + YouTube
    await repo.upsertByExternalId({
      title: `Direct Priority Game ${token}`,
      slug: `direct-priority-game-${token}`,
      description: 'Test direct priority',
      rating: 9.9,
      genres: ['Action'],
      platforms: ['PC'],
      screenshots: [],
      incomingTrailerDetails: [
        {
          provider: 'YOUTUBE',
          url: 'https://www.youtube.com/watch?v=fallback123',
        },
        {
          provider: 'DIRECT',
          url: 'https://cdn.example.com/direct/video.mp4',
          mimeType: 'video/mp4',
          origin: 'studio-portal',
          authorizationRef: 'secret-auth-contract-999',
        },
      ],
    });

    // Jogo apenas com Steam (sem fonte reproduzível no native player)
    await repo.upsertByExternalId({
      title: `Steam Only Game ${token}`,
      slug: `steam-only-game-${token}`,
      description: 'Game with only Steam trailer',
      rating: 8.0,
      genres: ['Strategy'],
      platforms: ['PC'],
      screenshots: [],
      incomingTrailerDetails: [
        {
          provider: 'STEAM',
          url: 'https://cdn.akamai.steamstatic.com/steam/apps/123/movie.mp4',
        },
      ],
    });

    // 1. GET /api/v1/games/:id (Direct Priority Game)
    const detailRes = await app.inject({
      method: 'GET',
      url: `/api/v1/games/direct-priority-game-${token}`,
    });
    assert.equal(detailRes.statusCode, 200);
    const detail = JSON.parse(detailRes.payload);

    // Teste 9: DIRECT tem prioridade sobre YouTube no detalhe
    assert.equal(detail.primaryTrailer?.provider, 'DIRECT');
    assert.equal(detail.primaryTrailer?.url, 'https://cdn.example.com/direct/video.mp4');
    assert.equal(detail.trailerDetails[0]?.provider, 'DIRECT');
    assert.equal(detail.trailerDetails[1]?.provider, 'YOUTUBE');

    // Teste 3: authorizationRef NUNCA vaza no JSON público
    const detailPayload = detailRes.payload;
    assert.equal(detailPayload.includes('secret-auth-contract-999'), false);
    assert.equal(detailPayload.includes('authorizationRef'), false);
    assert.equal('authorizationRef' in (detail.primaryTrailer || {}), false);

    // 2. GET /api/v1/feed
    const feedRes = await app.inject({ method: 'GET', url: '/api/v1/feed?limit=100' });
    assert.equal(feedRes.statusCode, 200);
    const feedBody = JSON.parse(feedRes.payload);
    const feedDirectGame = feedBody.data.find((g) => g.slug === `direct-priority-game-${token}`);
    assert.ok(feedDirectGame, 'Jogo com Direct deve estar no feed');

    // Teste 10: DIRECT tem prioridade sobre YouTube no feed
    assert.equal(feedDirectGame.primaryTrailer?.provider, 'DIRECT');
    assert.equal(feedDirectGame.trailerDetails[0]?.provider, 'DIRECT');

    // Teste 3 (feed): authorizationRef não vaza no feed
    assert.equal(feedRes.payload.includes('secret-auth-contract-999'), false);
    assert.equal(feedRes.payload.includes('authorizationRef'), false);

    // 3. Jogo apenas com Steam: Teste 12 (primaryTrailer é null/undefined)
    const steamDetailRes = await app.inject({
      method: 'GET',
      url: `/api/v1/games/steam-only-game-${token}`,
    });
    assert.equal(steamDetailRes.statusCode, 200);
    const steamDetail = JSON.parse(steamDetailRes.payload);
    assert.equal(steamDetail.primaryTrailer, undefined);

    const feedSteamGame = feedBody.data.find((g) => g.slug === `steam-only-game-${token}`);
    if (feedSteamGame) {
      assert.equal(feedSteamGame.primaryTrailer, null);
    }

    // 4. Teste 11: Sem DIRECT, YouTube válido com videoId vira primaryTrailer
    const ytOnlyGame = {
      title: `YouTube Only Game ${token}`,
      slug: `youtube-only-game-${token}`,
      genres: ['Action'],
      platforms: ['PC'],
      screenshots: [],
      incomingTrailerDetails: [
        {
          provider: 'STEAM',
          url: 'https://cdn.akamai.steamstatic.com/steam/apps/456/movie.mp4',
        },
        {
          provider: 'YOUTUBE',
          url: 'https://www.youtube.com/watch?v=onlyYT123',
        },
      ],
    };
    await repo.upsertByExternalId(ytOnlyGame);
    const ytDetailRes = await app.inject({
      method: 'GET',
      url: `/api/v1/games/youtube-only-game-${token}`,
    });
    const ytDetail = JSON.parse(ytDetailRes.payload);
    assert.equal(ytDetail.primaryTrailer?.provider, 'YOUTUBE');
    assert.equal(ytDetail.primaryTrailer?.videoId, 'onlyYT123');

    await app.close();
  });

  console.log('Todos os testes de API passaram com sucesso.');
} catch (error) {
  console.error(safeTestFailure(error, 'Falha nos testes de API. Detalhes privados omitidos.'));
  process.exitCode = 1;
} finally {
  if (db) await db.$disconnect();
}
