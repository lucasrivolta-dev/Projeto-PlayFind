import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PriceSyncService } from '../dist/modules/integrations/pricing/price-sync.service.js';
import { PriceProviderError } from '../dist/modules/integrations/pricing/v2-client.js';
import { createTestPrismaClient, safeTestFailure } from './test-database.mjs';

const observedAt = new Date('2026-09-19T03:00:00Z');
const offer = {
  store: 'PLAYSTATION',
  provider: 'PLATPRICES',
  externalProductId: 'TEST_PRODUCT',
  storeUrl: 'https://store.playstation.com/pt-br/product/TEST_PRODUCT',
  region: 'BR',
  currency: 'BRL',
  originalPriceCents: 29990,
  finalPriceCents: 29990,
  discountPercent: 0,
  isAvailable: true,
  observedAt,
};
const record = (platform) => ({
  id: randomUUID(),
  title: 'Fixture Adventure',
  slug: 'fixture-adventure',
  platforms: [{ platform: { name: platform } }],
  storeOffers: [],
});
const provider = {
  providerName: 'PLATPRICES',
  storeName: 'PLAYSTATION',
  isConfigured: () => true,
  fetchOffers: async () => [offer],
};

test('sync skips missing keys before database or HTTP access', async () => {
  const service = new PriceSyncService({});
  const result = await service.run({ ...provider, isConfigured: () => false }, { limit: 20 });
  assert.equal(result.status, 'MISSING_API_KEY');
  assert.equal(result.created, 0);
});

test('sync calls only relevant provider and dry-run never writes', async () => {
  let calls = 0;
  const db = { game: { findMany: async () => [record('PC'), record('PlayStation')] } };
  const result = await new PriceSyncService(db).run(
    {
      ...provider,
      fetchOffers: async () => {
        calls++;
        return [offer];
      },
    },
    { limit: 20, dryRun: true },
  );
  assert.equal(calls, 1);
  assert.equal(result.matched, 1);
  assert.equal(result.created, 0);
});

test('sync stops provider on 429, preserves Retry-After and never persists errors', async () => {
  let calls = 0;
  const db = { game: { findMany: async () => [record('PlayStation'), record('PlayStation')] } };
  const result = await new PriceSyncService(db).run(
    {
      ...provider,
      fetchOffers: async () => {
        calls++;
        throw new PriceProviderError('RATE_LIMITED', 429, '60');
      },
    },
    { limit: 20 },
  );
  assert.equal(calls, 1);
  assert.equal(result.status, 'RATE_LIMITED');
  assert.equal(result.retryAfter, '60');
  assert.equal(result.created, 0);
});

test('sync reuses previously verified store identity', async () => {
  const game = record('PlayStation');
  game.storeOffers = [{ externalProductId: offer.externalProductId }];
  const db = { game: { findMany: async () => [game] } };
  await new PriceSyncService(db).run(
    {
      ...provider,
      fetchOffers: async (input) => {
        assert.equal(input.productIds.PLAYSTATION, offer.externalProductId);
        return [];
      },
    },
    { limit: 20 },
  );
});

test('PostgreSQL snapshots refresh unchanged data, preserve price changes and price reversion', async () => {
  const db = createTestPrismaClient();
  const rollback = new Error('rollback');
  try {
    await db.$transaction(
      async (tx) => {
        const game = await tx.game.create({
          data: {
            title: 'Price sync fixture',
            slug: `price-sync-${randomUUID()}`,
          },
        });
        const service = new PriceSyncService({ $transaction: (callback) => callback(tx) });
        assert.equal(await service.persist(game.id, offer), 'created');
        assert.equal(
          await service.persist(game.id, { ...offer, observedAt: new Date(+observedAt + 1000) }),
          'refreshed',
        );
        assert.equal(await tx.storeOffer.count({ where: { gameId: game.id } }), 1);
        assert.equal(
          await service.persist(game.id, {
            ...offer,
            finalPriceCents: 14995,
            discountPercent: 50,
            observedAt: new Date(+observedAt + 2000),
          }),
          'created',
        );
        assert.equal(
          await service.persist(game.id, { ...offer, observedAt: new Date(+observedAt + 3000) }),
          'created',
        );
        assert.equal(
          await service.persist(game.id, { ...offer, finalPriceCents: 9990 }),
          'skipped',
        );
        const snapshots = await tx.storeOffer.findMany({
          where: { gameId: game.id },
          orderBy: { observedAt: 'asc' },
        });
        assert.deepEqual(
          snapshots.map((item) => item.finalPriceCents),
          [29990, 14995, 29990],
        );
        assert.equal(+snapshots[0].observedAt, +observedAt + 1000);
        throw rollback;
      },
      { timeout: 30000 },
    );
  } catch (error) {
    if (error !== rollback)
      throw new Error(safeTestFailure(error, 'Price persistence test failed'));
  } finally {
    await db.$disconnect();
  }
});
