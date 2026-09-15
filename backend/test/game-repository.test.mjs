import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaGameRepository } from '../dist/modules/games/prisma-game.repository.js';
import { createTestPrismaClient, safeTestFailure } from './test-database.mjs';

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

  await verify('PrismaGameRepository persiste metadados de trailer direto e respeita constraints de autorização', async (tx) => {
    const repo = new PrismaGameRepository(tx);
    const token = randomUUID().slice(0, 8);
    const directGame = {
      title: `Direct Trailer Game ${token}`,
      slug: `direct-game-${token}`,
      description: 'Game with direct authorized trailer',
      genres: ['Action'],
      platforms: ['PC'],
      screenshots: [],
      incomingTrailerDetails: [
        {
          provider: 'DIRECT',
          url: 'https://cdn.example.com/trailers/launch.mp4',
          mimeType: 'video/mp4',
          origin: 'publisher-presskit',
          authorizationRef: 'license-agmt-2026-001',
        },
      ],
    };

    // 1 & 2. DIRECT com authorizationRef persiste provider, mimeType, origin, authorizationRef
    await repo.upsertByExternalId(directGame);

    const candidates = await repo.findCandidates(directGame);
    assert.equal(candidates.length, 1);
    const candidate = candidates[0];
    assert.equal(candidate.trailerDetails?.length, 1);
    const candidateTrailer = candidate.trailerDetails[0];
    assert.equal(candidateTrailer.provider, 'DIRECT');
    assert.equal(candidateTrailer.url, 'https://cdn.example.com/trailers/launch.mp4');
    assert.equal(candidateTrailer.mimeType, 'video/mp4');
    assert.equal(candidateTrailer.origin, 'publisher-presskit');
    // authorizationRef NÃO deve vazar em candidate.trailerDetails
    assert.equal('authorizationRef' in candidateTrailer, false);

    // Verificação física no banco de dados
    const rawMedia = await tx.gameMedia.findFirst({
      where: { gameId: candidate.id, url: 'https://cdn.example.com/trailers/launch.mp4' },
    });
    assert.ok(rawMedia, 'GameMedia row deve existir');
    assert.equal(rawMedia.provider, 'DIRECT');
    assert.equal(rawMedia.mimeType, 'video/mp4');
    assert.equal(rawMedia.origin, 'publisher-presskit');
    assert.equal(rawMedia.authorizationRef, 'license-agmt-2026-001');

    // 4. DIRECT sem authorizationRef é rejeitado pelo código
    await assert.rejects(
      async () => {
        await repo.upsertByExternalId({
          title: `Direct Invalid ${token}`,
          slug: `direct-invalid-${token}`,
          genres: [],
          platforms: [],
          screenshots: [],
          incomingTrailerDetails: [
            {
              provider: 'DIRECT',
              url: 'https://cdn.example.com/trailers/unauthorized.mp4',
              // sem authorizationRef
            },
          ],
        });
      },
      /DIRECT trailer requires a non-empty authorizationRef/,
      'Deve rejeitar DIRECT sem authorizationRef no código',
    );

    // 13 & 14. Persistir duas vezes a mesma URL não duplica e atualiza metadados sem rebaixar DIRECT
    const updateGame = {
      ...directGame,
      incomingTrailerDetails: [
        {
          provider: 'DIRECT',
          url: 'https://cdn.example.com/trailers/launch.mp4',
          mimeType: 'video/mp4',
          origin: 'publisher-presskit-v2',
          authorizationRef: 'license-agmt-2026-001-renewed',
        },
      ],
    };
    await repo.upsertByExternalId(updateGame);
    const mediaCount = await tx.gameMedia.count({
      where: { gameId: candidate.id, url: 'https://cdn.example.com/trailers/launch.mp4' },
    });
    assert.equal(mediaCount, 1, 'Mídia repetida não deve duplicar');

    const updatedRawMedia = await tx.gameMedia.findFirst({
      where: { gameId: candidate.id, url: 'https://cdn.example.com/trailers/launch.mp4' },
    });
    assert.equal(updatedRawMedia?.origin, 'publisher-presskit-v2');
    assert.equal(updatedRawMedia?.authorizationRef, 'license-agmt-2026-001-renewed');
  });

  await verify('Constraint do banco bloqueia DIRECT com authorizationRef nulo', async (tx) => {
    const repo = new PrismaGameRepository(tx);
    const token = randomUUID().slice(0, 8);
    const baseGame = await repo.upsertByExternalId({
      title: `Constraint Test ${token}`,
      slug: `constraint-test-${token}`,
      genres: [],
      platforms: [],
      screenshots: [],
    });
    const candidates = await repo.findCandidates(baseGame);
    const gameId = candidates[0].id;

    // 5. DIRECT sem authorizationRef é rejeitado pela constraint do banco
    await assert.rejects(
      async () => {
        await tx.gameMedia.create({
          data: {
            gameId,
            type: 'TRAILER',
            url: 'https://cdn.example.com/trailers/bypass-code.mp4',
            provider: 'DIRECT',
            authorizationRef: null,
          },
        });
      },
      /GameMedia_direct_requires_auth|constraint|check/i,
      'PostgreSQL CHECK constraint deve bloquear DIRECT com authorizationRef nulo',
    );
  });

  console.log('Todos os testes do PrismaGameRepository passaram com sucesso.');
} catch (error) {
  console.error(safeTestFailure(error, 'Falha nos testes do repositório. Detalhes privados omitidos.'));
  process.exitCode = 1;
} finally {
  if (db) await db.$disconnect();
}
