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

  await verify('Fluxos completos de biblioteca do usuário persistem corretamente', async (tx) => {
    const app = await buildApp({ prisma: tx, allowTestUsers: true });
    const repo = new PrismaGameRepository(tx);
    const token = randomUUID().slice(0, 8);
    const userAuthId = `test_player_${token}`;

    const game = await repo.upsertByExternalId({
      title: `Library Game Test ${token}`,
      slug: `lib-game-test-${token}`,
      description: 'Game for library testing',
      developer: 'Test Studio',
      rating: 9.0,
      genres: ['Action'],
      platforms: ['PC'],
      screenshots: [],
      steamAppId: 888123,
    });

    const headers = {
      'x-user-id': userAuthId,
    };

    // 1. Recusa sem autenticação
    const unauthRes = await app.inject({
      method: 'GET',
      url: '/api/v1/library',
    });
    assert.equal(unauthRes.statusCode, 401);

    // 2. Consulta inicial vazia
    const emptyRes = await app.inject({
      method: 'GET',
      url: '/api/v1/library',
      headers,
    });
    assert.equal(emptyRes.statusCode, 200);
    const emptyBody = JSON.parse(emptyRes.payload);
    assert.equal(emptyBody.data.length, 0);
    assert.deepEqual(emptyBody.likes, []);

    // 3. Adicionar "Quero jogar" (WANT_TO_PLAY) por slug
    const wantRes = await app.inject({
      method: 'PUT',
      url: `/api/v1/library/${game.slug}`,
      headers,
      payload: { status: 'WANT_TO_PLAY' },
    });
    assert.equal(wantRes.statusCode, 200);
    const wantBody = JSON.parse(wantRes.payload);
    assert.equal(wantBody.status, 'WANT_TO_PLAY');

    // 4. Verificar listagem com filtro
    const listWantRes = await app.inject({
      method: 'GET',
      url: '/api/v1/library?status=WANT_TO_PLAY',
      headers,
    });
    assert.equal(listWantRes.statusCode, 200);
    const listWantBody = JSON.parse(listWantRes.payload);
    assert.equal(listWantBody.data.length, 1);
    assert.equal(listWantBody.data[0].game.slug, game.slug);
    assert.equal(listWantBody.data[0].game.steamAppId, 888123);

    // 5. Favoritar jogo
    const favRes = await app.inject({
      method: 'POST',
      url: `/api/v1/library/${game.slug}/favorite`,
      headers,
    });
    assert.equal(favRes.statusCode, 200);
    const favBody = JSON.parse(favRes.payload);
    assert.equal(favBody.isFavorite, true);

    // 6. Avaliar jogo de 1 a 5 (transiciona para PLAYED respeitando constraint)
    const rateRes = await app.inject({
      method: 'POST',
      url: `/api/v1/library/${game.slug}/rate`,
      headers,
      payload: { rating: 5, reviewText: 'Excelente jogo indie!' },
    });
    assert.equal(rateRes.statusCode, 200);
    const rateBody = JSON.parse(rateRes.payload);
    assert.equal(rateBody.status, 'PLAYED');
    assert.equal(rateBody.rating, 5);
    assert.equal(rateBody.reviewText, 'Excelente jogo indie!');

    // 7. Recusa de avaliação inválida
    const invalidRateRes = await app.inject({
      method: 'POST',
      url: `/api/v1/library/${game.slug}/rate`,
      headers,
      payload: { rating: 7 },
    });
    assert.equal(invalidRateRes.statusCode, 400);
    const fractionalRateRes = await app.inject({
      method: 'POST',
      url: `/api/v1/library/${game.slug}/rate`,
      headers,
      payload: { rating: 4.5 },
    });
    assert.equal(fractionalRateRes.statusCode, 400);

    // 8. Curtir e descurtir jogo (GameLike)
    const like1 = await app.inject({
      method: 'POST',
      url: `/api/v1/library/${game.slug}/like`,
      headers,
    });
    assert.equal(like1.statusCode, 200);
    assert.equal(JSON.parse(like1.payload).liked, true);
    const likedLibrary = await app.inject({ method: 'GET', url: '/api/v1/library', headers });
    assert.deepEqual(
      JSON.parse(likedLibrary.payload).likes.map((entry) => entry.steamAppId),
      [888123],
    );

    const like2 = await app.inject({
      method: 'POST',
      url: `/api/v1/library/${game.slug}/like`,
      headers,
    });
    assert.equal(like2.statusCode, 200);
    assert.equal(JSON.parse(like2.payload).liked, false);
    const unlikedLibrary = await app.inject({ method: 'GET', url: '/api/v1/library', headers });
    assert.deepEqual(JSON.parse(unlikedLibrary.payload).likes, []);

    // 9. Remover avaliação
    const delRateRes = await app.inject({
      method: 'DELETE',
      url: `/api/v1/library/${game.slug}/rate`,
      headers,
    });
    assert.equal(delRateRes.statusCode, 200);
    assert.equal(JSON.parse(delRateRes.payload).rating, null);

    // 10. Remover da biblioteca
    const delRes = await app.inject({
      method: 'DELETE',
      url: `/api/v1/library/${game.slug}`,
      headers,
    });
    assert.equal(delRes.statusCode, 200);

    // Curtidas independem da biblioteca: recarregar ainda deve mostrá-las.
    const likeWithoutLibrary = await app.inject({
      method: 'POST',
      url: `/api/v1/library/${game.slug}/like`,
      headers,
    });
    assert.equal(JSON.parse(likeWithoutLibrary.payload).liked, true);
    const likesOnlyRes = await app.inject({ method: 'GET', url: '/api/v1/library', headers });
    const likesOnly = JSON.parse(likesOnlyRes.payload);
    assert.equal(likesOnly.data.length, 0);
    assert.deepEqual(
      likesOnly.likes.map((entry) => entry.steamAppId),
      [888123],
    );

    const igdbId = Number.parseInt(token.slice(0, 7), 16);
    const igdbOnly = await tx.game.create({
      data: { title: `IGDB Only ${token}`, slug: `igdb-only-${token}`, igdbId },
    });
    const igdbPut = await app.inject({
      method: 'PUT',
      url: `/api/v1/library/${igdbId}`,
      headers,
      payload: { status: 'WANT_TO_PLAY' },
    });
    assert.equal(igdbPut.statusCode, 200);
    const igdbLibrary = await app.inject({ method: 'GET', url: '/api/v1/library', headers });
    const igdbEntry = JSON.parse(igdbLibrary.payload).data.find(
      (entry) => entry.gameId === igdbOnly.id,
    );
    assert.equal(igdbEntry.game.steamAppId, null);
    assert.equal(igdbEntry.game.igdbId, igdbId);

    await app.close();
  });

  console.log('Todos os testes da biblioteca passaram com sucesso.');
} catch (error) {
  console.error('Falha nos testes da biblioteca:', error);
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
