import test from 'node:test';
import assert from 'node:assert/strict';
import { repairOverwatchSteamIdentity } from '../dist/scripts/repair-overwatch-steam-identity.js';

function createMockPrisma(gameRecord, totalCount = 379) {
  let currentGame = gameRecord ? JSON.parse(JSON.stringify(gameRecord)) : null;
  let count = totalCount;
  const deletedSteamOffers = [];
  const deletedStoreOffers = [];
  let updatedGameData = null;

  const mock = {
    game: {
      count: async () => count,
      findUnique: async ({ where }) => {
        if (where.igdbId && currentGame && currentGame.igdbId === where.igdbId) {
          return { ...currentGame, steamOffers: [...currentGame.steamOffers], storeOffers: [...currentGame.storeOffers] };
        }
        if (where.id && currentGame && currentGame.id === where.id) {
          return { ...currentGame, steamOffers: [...currentGame.steamOffers], storeOffers: [...currentGame.storeOffers] };
        }
        return null;
      },
      update: async ({ where, data }) => {
        if (where.id === currentGame?.id) {
          updatedGameData = data;
          currentGame = { ...currentGame, ...data };
          return currentGame;
        }
        throw new Error('Game not found');
      },
    },
    steamOffer: {
      deleteMany: async ({ where }) => {
        deletedSteamOffers.push(where);
        if (currentGame) currentGame.steamOffers = [];
        return { count: 1 };
      },
    },
    storeOffer: {
      deleteMany: async ({ where }) => {
        deletedStoreOffers.push(where);
        if (currentGame) currentGame.storeOffers = [];
        return { count: 1 };
      },
    },
    $transaction: async (fn) => {
      return fn(mock);
    },
    _getUpdatedData: () => updatedGameData,
    _getDeletedSteam: () => deletedSteamOffers,
    _getDeletedStore: () => deletedStoreOffers,
  };

  return mock;
}

const mockSteamClient = {
  details: async (appId) => {
    if (appId === 2357570) {
      return {
        success: true,
        data: {
          name: 'Overwatch®',
          type: 'game',
          release_date: { date: '10 Aug, 2023' },
          developers: ['Blizzard Entertainment, Inc.'],
          publishers: ['Blizzard Entertainment, Inc.'],
        },
      };
    }
    return undefined;
  },
};

test('REMEDIAÇÃO 1 — Registro esperado com --apply: limpa steamAppId e ofertas Steam preservando metadados', async () => {
  const mockGame = {
    id: 'f947626b-930f-440d-a004-84870f5d7d59',
    title: 'Overwatch',
    slug: 'overwatch',
    igdbId: 8173,
    steamAppId: 2357570,
    releaseDate: new Date('2016-05-24'),
    studio: 'Blizzard Entertainment',
    publisher: 'Blizzard Entertainment',
    description: 'Hero shooter',
    rating: 88,
    steamOffers: [{ id: 'so-1', gameId: 'f947626b-930f-440d-a004-84870f5d7d59', storeUrl: 'https://store.steampowered.com/app/2357570/' }],
    storeOffers: [{ id: 'sto-1', gameId: 'f947626b-930f-440d-a004-84870f5d7d59', store: 'STEAM', externalProductId: '2357570' }],
  };

  const prisma = createMockPrisma(mockGame);
  const result = await repairOverwatchSteamIdentity(prisma , mockSteamClient , { apply: true });

  assert.equal(result.status, 'SUCCESS');
  assert.equal(result.catalogCountBefore, 379);
  assert.equal(result.catalogCountAfter, 379);
  assert.equal(result.steamAppIdBefore, 2357570);
  assert.equal(result.steamAppIdAfter, null);
  assert.equal(result.steamOffersCountBefore, 1);
  assert.equal(result.steamOffersCountAfter, 0);
  assert.equal(result.gameId, 'f947626b-930f-440d-a004-84870f5d7d59');
  assert.equal(result.igdbId, 8173);
  assert.equal(result.matcherStatus, 'NO_MATCH');
});

test('REMEDIAÇÃO 2 — Jogo com título diferente: aborta sem alterações', async () => {
  const mockGame = {
    id: 'f947626b-930f-440d-a004-84870f5d7d59',
    title: 'Different Game Entirely',
    slug: 'different-game',
    igdbId: 8173,
    steamAppId: 2357570,
    steamOffers: [{ id: 'so-1' }],
    storeOffers: [{ id: 'sto-1' }],
  };

  const prisma = createMockPrisma(mockGame);
  const result = await repairOverwatchSteamIdentity(prisma , mockSteamClient , { apply: true });

  assert.equal(result.status, 'ABORTED');
  assert.match(result.reason, /Title mismatch/);
  assert.equal(prisma._getUpdatedData(), null);
});

test('REMEDIAÇÃO 3 — steamAppId inesperado: aborta sem alterações', async () => {
  const mockGame = {
    id: 'f947626b-930f-440d-a004-84870f5d7d59',
    title: 'Overwatch',
    slug: 'overwatch',
    igdbId: 8173,
    steamAppId: 9999999, // not 2357570
    steamOffers: [],
    storeOffers: [],
  };

  const prisma = createMockPrisma(mockGame);
  const result = await repairOverwatchSteamIdentity(prisma , mockSteamClient , { apply: true });

  assert.equal(result.status, 'ABORTED');
  assert.match(result.reason, /steamAppId mismatch/);
  assert.equal(prisma._getUpdatedData(), null);
});

test('REMEDIAÇÃO 4 — Registro já limpo: idempotente, reporta ALREADY_CLEAN sem alterações', async () => {
  const cleanGame = {
    id: 'f947626b-930f-440d-a004-84870f5d7d59',
    title: 'Overwatch',
    slug: 'overwatch',
    igdbId: 8173,
    steamAppId: null,
    steamOffers: [],
    storeOffers: [],
  };

  const prisma = createMockPrisma(cleanGame);
  const result = await repairOverwatchSteamIdentity(prisma , mockSteamClient , { apply: true });

  assert.equal(result.status, 'ALREADY_CLEAN');
  assert.equal(result.steamAppIdBefore, null);
  assert.equal(result.steamAppIdAfter, null);
  assert.equal(prisma._getUpdatedData(), null);
});

test('REMEDIAÇÃO 5 — Sem flag --apply (dry-run): aborta e não grava nada no banco', async () => {
  const mockGame = {
    id: 'f947626b-930f-440d-a004-84870f5d7d59',
    title: 'Overwatch',
    slug: 'overwatch',
    igdbId: 8173,
    steamAppId: 2357570,
    releaseDate: new Date('2016-05-24'),
    steamOffers: [{ id: 'so-1' }],
    storeOffers: [{ id: 'sto-1' }],
  };

  const prisma = createMockPrisma(mockGame);
  const result = await repairOverwatchSteamIdentity(prisma , mockSteamClient , { apply: false });

  assert.equal(result.status, 'ABORTED');
  assert.match(result.reason, /Dry-run/);
  assert.equal(prisma._getUpdatedData(), null);
});

test('REMEDIAÇÃO 6 — Outras ofertas de outras lojas (ex: PlayStation) são preservadas', async () => {
  const mockGame = {
    id: 'f947626b-930f-440d-a004-84870f5d7d59',
    title: 'Overwatch',
    slug: 'overwatch',
    igdbId: 8173,
    steamAppId: 2357570,
    releaseDate: new Date('2016-05-24'),
    steamOffers: [{ id: 'so-1' }],
    storeOffers: [
      { id: 'sto-steam', store: 'STEAM', externalProductId: '2357570' },
      { id: 'sto-ps', store: 'PLAYSTATION', externalProductId: 'CUSA01842_00' },
    ],
  };

  let storeOffersInDb = [...mockGame.storeOffers];
  const prisma = {
    game: {
      count: async () => 379,
      findUnique: async () => ({
        ...mockGame,
        storeOffers: storeOffersInDb,
      }),
      update: async ({ data }) => {
        mockGame.steamAppId = data.steamAppId;
        return mockGame;
      },
    },
    steamOffer: {
      deleteMany: async () => {
        mockGame.steamOffers = [];
        return { count: 1 };
      },
    },
    storeOffer: {
      deleteMany: async ({ where }) => {
        // filter out STEAM store offers only
        storeOffersInDb = storeOffersInDb.filter((o) => o.store !== 'STEAM');
        return { count: 1 };
      },
    },
    $transaction: async (fn) => fn(prisma),
  };

  const result = await repairOverwatchSteamIdentity(prisma , mockSteamClient , { apply: true });

  assert.equal(result.status, 'SUCCESS');
  assert.equal(storeOffersInDb.length, 1);
  assert.equal(storeOffersInDb[0].store, 'PLAYSTATION');
});
