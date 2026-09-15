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
      {
        timeout: 20_000,
      },
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

  await verify('Fluxos completos de biblioteca do usuário persistem corretamente', async (tx) => {
    const token = randomUUID().slice(0, 8);
    const fakeToken = `fake-test-token-${token}`;
    const secondToken = `fake-second-token-${token}`;
    const testUid = `test_player_${token}`;
    const secondUid = `test_other_player_${token}`;
    const app = await buildApp({
      prisma: tx,
      tokenVerifier: {
        async verify(value) {
          if (value === fakeToken) return { uid: testUid };
          if (value === secondToken) return { uid: secondUid };
          throw new Error('INVALID_TEST_TOKEN');
        },
      },
    });
    const repo = new PrismaGameRepository(tx);

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
    const storedGame = await tx.game.findUniqueOrThrow({ where: { slug: game.slug } });

    const headers = { authorization: `Bearer ${fakeToken}` };
    const secondHeaders = { authorization: `Bearer ${secondToken}` };

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
    assert.equal(listWantBody.data[0].game.id, storedGame.id);
    assert.equal(listWantBody.data[0].gameId, storedGame.id);
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

    // 8. Curtir e descurtir no registro único usuário-jogo.
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

    // Uma interação sem status continua visível apenas quando há favorito/like.
    const likeWithoutLibrary = await app.inject({
      method: 'POST',
      url: `/api/v1/library/${game.slug}/like`,
      headers,
    });
    assert.equal(JSON.parse(likeWithoutLibrary.payload).liked, true);
    const likesOnlyRes = await app.inject({ method: 'GET', url: '/api/v1/library', headers });
    const likesOnly = JSON.parse(likesOnlyRes.payload);
    assert.equal(likesOnly.data.length, 1);
    assert.equal(likesOnly.data[0].status, null);
    assert.equal(likesOnly.data[0].liked, true);
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

    const isolated = await tx.game.create({
      data: { title: `Interaction ${token}`, slug: `interaction-${token}` },
    });
    const url = `/api/v1/library/${isolated.id}/interaction`;
    const patch = (payload, requestHeaders = headers) =>
      app.inject({
        method: 'PATCH',
        url,
        headers: requestHeaders,
        payload,
      });
    const getInteraction = (requestHeaders = headers) =>
      app.inject({
        method: 'GET',
        url,
        headers: requestHeaders,
      });
    const first = await patch({ liked: true });
    assert.equal(first.statusCode, 200);
    assert.equal(JSON.parse(first.payload).gameId, isolated.id);
    assert.equal(JSON.parse(first.payload).liked, true);
    assert.equal(JSON.parse(first.payload).status, null);
    assert.equal(await tx.userGameLibrary.count({ where: { gameId: isolated.id } }), 1);
    assert.equal((await app.inject({ method: 'GET', url: `/api/v1/library/${isolated.slug}/interaction`, headers })).statusCode, 404);
    assert.equal(JSON.parse((await getInteraction()).payload).gameId, isolated.id);

    const second = await patch({ isFavorite: true, status: 'WANT_TO_PLAY' });
    assert.equal(second.statusCode, 200);
    assert.equal(JSON.parse(second.payload).liked, true);
    assert.equal(JSON.parse(second.payload).isFavorite, true);
    await patch({ isFavorite: true, status: 'WANT_TO_PLAY' });
    assert.equal(await tx.userGameLibrary.count({ where: { gameId: isolated.id } }), 1);

    const played = await patch({ status: 'PLAYED', rating: 4, reviewText: 'Bom' });
    assert.equal(JSON.parse(played.payload).status, 'PLAYED');
    assert.equal(JSON.parse(played.payload).rating, 4);
    const rerated = await patch({ rating: 5 });
    assert.equal(JSON.parse(rerated.payload).rating, 5);
    assert.equal(JSON.parse(rerated.payload).reviewText, 'Bom');
    const listed = await app.inject({ method: 'GET', url: '/api/v1/library?liked=true', headers });
    assert.equal(
      JSON.parse(listed.payload).data.find((item) => item.gameId === isolated.id).rating,
      5,
    );

    const other = await patch({ liked: true }, secondHeaders);
    assert.equal(other.statusCode, 200);
    assert.equal(JSON.parse(other.payload).status, null);
    assert.equal(await tx.userGameLibrary.count({ where: { gameId: isolated.id } }), 2);
    assert.equal(JSON.parse((await getInteraction(secondHeaders)).payload).isFavorite, false);

    await patch({ status: null, rating: null, reviewText: null, isFavorite: false, liked: false });
    const empty = await getInteraction();
    assert.equal(JSON.parse(empty.payload).liked, false);
    assert.equal(await tx.userGameLibrary.count({ where: { gameId: isolated.id } }), 1);
    const noEmpty = await app.inject({ method: 'GET', url: '/api/v1/library', headers });
    assert.equal(
      JSON.parse(noEmpty.payload).data.some((item) => item.gameId === isolated.id),
      false,
    );
    await patch({ liked: false }, secondHeaders);
    assert.equal(await tx.userGameLibrary.count({ where: { gameId: isolated.id } }), 0);

    const legacyLike = await app.inject({
      method: 'POST',
      url: `/api/v1/library/${isolated.slug}/like`,
      headers,
    });
    assert.equal(JSON.parse(legacyLike.payload).liked, true);
    const legacyUnlike = await app.inject({
      method: 'POST',
      url: `/api/v1/library/${isolated.slug}/like`,
      headers,
    });
    assert.equal(JSON.parse(legacyUnlike.payload).liked, false);
    assert.equal(await tx.userGameLibrary.count({ where: { gameId: isolated.id } }), 0);
    await patch({ isFavorite: true });
    const favorites = await app.inject({
      method: 'GET',
      url: '/api/v1/library?favorite=true',
      headers,
    });
    assert.equal(
      JSON.parse(favorites.payload).data.some((item) => item.gameId === isolated.id),
      true,
    );
    await patch({ isFavorite: false });
    assert.equal(await tx.userGameLibrary.count({ where: { gameId: isolated.id } }), 0);

    for (const payload of [
      { liked: 'true' },
      { rating: 4.5 },
      { status: 'OTHER' },
      { extra: true },
    ]) {
      assert.equal((await patch(payload)).statusCode, 400);
    }
    assert.equal((await patch({ status: 'WANT_TO_PLAY', rating: 5 })).statusCode, 400);
    assert.equal((await patch({ reviewText: 'Sem nota' })).statusCode, 400);

    await app.close();
  });

  console.log('Todos os testes da biblioteca passaram com sucesso.');
} catch (error) {
  console.error(safeTestFailure(error, 'Falha nos testes da biblioteca. Detalhes privados omitidos.'));
  process.exitCode = 1;
} finally {
  if (db) await db.$disconnect();
}
