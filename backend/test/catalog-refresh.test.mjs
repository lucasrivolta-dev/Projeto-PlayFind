import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CatalogRefreshService,
  formatCatalogRefreshPlan,
  formatCatalogRefreshResult,
  validateCatalogRefreshLimit,
} from '../dist/modules/sync/catalog-refresh.service.js';
import { parseCatalogRefreshArgs } from '../dist/scripts/catalog-refresh.js';

function createMockGame(overrides = {}) {
  const id = overrides.id ?? 'game-uuid-1';
  const igdbId = overrides.igdbId !== undefined ? overrides.igdbId : 1001;
  const steamAppId = overrides.steamAppId !== undefined ? overrides.steamAppId : 10010;
  const title = overrides.title ?? 'Test Game';
  const slug = overrides.slug ?? 'test-game';

  return {
    id,
    title,
    slug,
    igdbId,
    steamAppId,
    description: overrides.description !== undefined ? overrides.description : 'Original description',
    studio: overrides.studio !== undefined ? overrides.studio : 'Original Studio',
    publisher: overrides.publisher !== undefined ? overrides.publisher : 'Original Publisher',
    coverUrl: overrides.coverUrl !== undefined ? overrides.coverUrl : 'https://original-cover.jpg',
    heroUrl: overrides.heroUrl !== undefined ? overrides.heroUrl : 'https://original-hero.jpg',
    rating: overrides.rating !== undefined ? overrides.rating : 8.5,
    ratingCount: overrides.ratingCount !== undefined ? overrides.ratingCount : 120,
    totalRating: overrides.totalRating !== undefined ? overrides.totalRating : 8.4,
    totalRatingCount: overrides.totalRatingCount !== undefined ? overrides.totalRatingCount : 250,
    releaseDate: overrides.releaseDate !== undefined ? overrides.releaseDate : new Date('2022-01-01'),
    isFree: overrides.isFree !== undefined ? overrides.isFree : false,
    media: overrides.media !== undefined ? overrides.media : [
      {
        id: 'media-1',
        type: 'TRAILER',
        url: 'https://www.youtube.com/watch?v=goodVideo11',
        sortOrder: 0,
        provider: 'YOUTUBE',
      },
    ],
    steamOffers: overrides.steamOffers !== undefined ? overrides.steamOffers : [
      {
        id: 'offer-1',
        priceCents: 10000,
        originalPriceCents: 10000,
        discountPercent: 0,
        currency: 'BRL',
        isAvailable: true,
        storeUrl: `https://store.steampowered.com/app/${steamAppId}/`,
        capturedAt: new Date('2024-01-01'),
      },
    ],
    storeOffers: overrides.storeOffers !== undefined ? overrides.storeOffers : [
      {
        id: 'store-offer-1',
        store: 'STEAM',
        finalPriceCents: 10000,
        originalPriceCents: 10000,
        discountPercent: 0,
        currency: 'BRL',
        isAvailable: true,
        storeUrl: `https://store.steampowered.com/app/${steamAppId}/`,
        observedAt: new Date('2024-01-01'),
      },
    ],
  };
}

test('Test A: price changed -> correct update', async () => {
  const game = createMockGame({ steamOffers: [{ priceCents: 10000, discountPercent: 0, originalPriceCents: 10000, currency: 'BRL', isAvailable: true }] });
  let appliedPayload = null;

  const service = new CatalogRefreshService({
    loadCatalogGames: async () => [game],
    fetchSteamDetails: async () => ({
      success: true,
      data: {
        steam_appid: game.steamAppId,
        price_overview: {
          final: 5000,
          initial: 10000,
          discount_percent: 50,
          currency: 'BRL',
        },
      },
    }),
    applyUpdate: async (payload) => {
      appliedPayload = payload;
    },
  });

  const manifest = await service.plan({ limit: 10 });
  assert.equal(manifest.eligibleForRefresh, 1);
  assert.equal(manifest.candidates[0].status, 'ELIGIBLE');
  assert.ok(manifest.candidates[0].fieldsChanged.includes('priceCents'));
  assert.ok(manifest.candidates[0].fieldsChanged.includes('discountPercent'));
  assert.equal(manifest.candidates[0].before.priceCents, 10000);
  assert.equal(manifest.candidates[0].after.priceCents, 5000);

  const result = await service.apply(manifest);
  assert.equal(result.updated, 1);
  assert.equal(result.failed, 0);
  assert.ok(appliedPayload !== null);
  assert.equal(appliedPayload.steamOffer.priceCents, 5000);
  assert.equal(appliedPayload.steamOffer.discountPercent, 50);
});

test('Test B: discount changed -> correct update', async () => {
  const game = createMockGame({ steamOffers: [{ priceCents: 10000, originalPriceCents: 10000, discountPercent: 0, currency: 'BRL', isAvailable: true }] });
  let appliedPayload = null;

  const service = new CatalogRefreshService({
    loadCatalogGames: async () => [game],
    fetchSteamDetails: async () => ({
      success: true,
      data: {
        steam_appid: game.steamAppId,
        price_overview: {
          final: 7500,
          initial: 10000,
          discount_percent: 25,
          currency: 'BRL',
        },
      },
    }),
    applyUpdate: async (payload) => {
      appliedPayload = payload;
    },
  });

  const manifest = await service.plan({ limit: 5 });
  assert.equal(manifest.eligibleForRefresh, 1);
  assert.ok(manifest.candidates[0].fieldsChanged.includes('discountPercent'));
  assert.equal(manifest.candidates[0].before.discountPercent, 0);
  assert.equal(manifest.candidates[0].after.discountPercent, 25);

  const result = await service.apply(manifest);
  assert.equal(result.updated, 1);
  assert.equal(appliedPayload.steamOffer.discountPercent, 25);
  assert.equal(appliedPayload.steamOffer.priceCents, 7500);
});

test('Test C: nothing changed -> NO_CHANGE and 0 writes', async () => {
  const game = createMockGame();
  let writeCalled = false;

  const service = new CatalogRefreshService({
    loadCatalogGames: async () => [game],
    fetchSteamDetails: async () => ({
      success: true,
      data: {
        steam_appid: game.steamAppId,
        price_overview: {
          final: 10000,
          initial: 10000,
          discount_percent: 0,
          currency: 'BRL',
        },
      },
    }),
    fetchIgdbGame: async () => ({
      id: game.igdbId,
      rating: 85.0, // 85.0 / 10 = 8.5
      rating_count: 120,
      total_rating: 84.0,
      total_rating_count: 250,
      videos: [{ video_id: 'goodVideo11', name: 'Official Trailer' }],
    }),
    applyUpdate: async () => {
      writeCalled = true;
    },
  });

  const manifest = await service.plan({ limit: 1 });
  assert.equal(manifest.eligibleForRefresh, 0);
  assert.equal(manifest.noChangeCount, 1);
  assert.equal(manifest.candidates[0].status, 'NO_CHANGE');
  assert.deepEqual(manifest.candidates[0].fieldsChanged, []);

  const result = await service.apply(manifest);
  assert.equal(result.updated, 0);
  assert.equal(result.noChange, 1);
  assert.equal(writeCalled, false);
});

test('Test D: provider returns null -> preserves existing value', async () => {
  const game = createMockGame({
    description: 'Existing Valid Description',
    rating: 9.1,
    steamOffers: [{ priceCents: 8000, discountPercent: 10, originalPriceCents: 8888, currency: 'BRL', isAvailable: true }],
  });

  const service = new CatalogRefreshService({
    loadCatalogGames: async () => [game],
    fetchSteamDetails: async () => ({
      success: true,
      data: {
        steam_appid: game.steamAppId,
        price_overview: null, // Steam returns null price
        short_description: null,
      },
    }),
    fetchIgdbGame: async () => ({
      id: game.igdbId,
      rating: null, // IGDB returns null rating
      summary: null,
    }),
  });

  const manifest = await service.plan({ limit: 1 });
  // Nulls from providers should NOT overwrite or create diffs
  assert.equal(manifest.candidates[0].status, 'NO_CHANGE');
  assert.deepEqual(manifest.candidates[0].fieldsChanged, []);
  assert.equal(manifest.candidates[0].before.rating, undefined);
  assert.equal(manifest.candidates[0].after.rating, undefined);
});

test('Test E: steamAppId different -> fail closed', async () => {
  const game = createMockGame({ steamAppId: 10010 });
  let writeCalled = false;

  const service = new CatalogRefreshService({
    loadCatalogGames: async () => [game],
    fetchSteamDetails: async () => ({
      success: true,
      data: {
        steam_appid: 99999, // Conflicting App ID!
      },
    }),
    applyUpdate: async () => {
      writeCalled = true;
    },
  });

  const manifest = await service.plan({ limit: 1 });
  assert.equal(manifest.failedCount, 1);
  assert.equal(manifest.candidates[0].status, 'FAILED_IDENTITY_CONFLICT');
  assert.equal(manifest.candidates[0].refreshEligible, false);
  assert.ok(manifest.candidates[0].error.includes('Steam App ID mismatch'));

  const result = await service.apply(manifest);
  assert.equal(result.failed, 1);
  assert.equal(result.updated, 0);
  assert.equal(writeCalled, false);
});

test('Test F: igdbId different -> fail closed', async () => {
  const game = createMockGame({ igdbId: 1001 });
  let writeCalled = false;

  const service = new CatalogRefreshService({
    loadCatalogGames: async () => [game],
    fetchIgdbGame: async () => ({
      id: 2002, // Conflicting IGDB ID!
    }),
    applyUpdate: async () => {
      writeCalled = true;
    },
  });

  const manifest = await service.plan({ limit: 1 });
  assert.equal(manifest.failedCount, 1);
  assert.equal(manifest.candidates[0].status, 'FAILED_IDENTITY_CONFLICT');
  assert.equal(manifest.candidates[0].refreshEligible, false);
  assert.ok(manifest.candidates[0].error.includes('IGDB ID mismatch'));

  const result = await service.apply(manifest);
  assert.equal(result.failed, 1);
  assert.equal(result.updated, 0);
  assert.equal(writeCalled, false);
});

test('Test G: novo trailer pior -> preserva atual', async () => {
  const game = createMockGame({
    media: [
      {
        id: 'm1',
        type: 'TRAILER',
        url: 'https://www.youtube.com/watch?v=goodVideo11',
        sortOrder: 0,
        provider: 'YOUTUBE',
      },
    ],
  });

  const service = new CatalogRefreshService({
    loadCatalogGames: async () => [game],
    fetchIgdbGame: async () => ({
      id: game.igdbId,
      videos: [
        // Disqualified video title (priority 99)
        { video_id: 'badVideo001', name: 'Walkthrough Gameplay Part 1' },
      ],
    }),
  });

  const manifest = await service.plan({ limit: 1 });
  // Current valid trailer must be preserved, no trailer diff emitted
  assert.ok(!manifest.candidates[0].fieldsChanged.includes('trailer'));
  assert.equal(manifest.candidates[0].status, 'NO_CHANGE');
});

test('Test H: trailer atual inválido -> permite canonical replacement', async () => {
  const game = createMockGame({
    media: [
      {
        id: 'm1',
        type: 'TRAILER',
        url: 'https://www.youtube.com/watch?v=broken_id', // Invalid video ID length
        sortOrder: 0,
        provider: 'YOUTUBE',
      },
    ],
  });
  let appliedPayload = null;

  const service = new CatalogRefreshService({
    loadCatalogGames: async () => [game],
    fetchIgdbGame: async () => ({
      id: game.igdbId,
      videos: [
        { video_id: 'repaired11A', name: 'Official Launch Trailer' },
      ],
    }),
    applyUpdate: async (payload) => {
      appliedPayload = payload;
    },
  });

  const manifest = await service.plan({ limit: 1 });
  assert.equal(manifest.eligibleForRefresh, 1);
  assert.ok(manifest.candidates[0].fieldsChanged.includes('trailer'));
  assert.equal(manifest.candidates[0].after.trailer, 'https://www.youtube.com/watch?v=repaired11A');

  const result = await service.apply(manifest);
  assert.equal(result.updated, 1);
  assert.equal(appliedPayload.newTrailer.url, 'https://www.youtube.com/watch?v=repaired11A');
});

test('Test I: metadata parcial -> não apaga campos bons', async () => {
  const game = createMockGame({
    description: 'Keep this existing detailed synopsis',
    studio: 'Keep this studio',
    coverUrl: 'https://good-cover.png',
  });
  let appliedPayload = null;

  const service = new CatalogRefreshService({
    loadCatalogGames: async () => [game],
    fetchIgdbGame: async () => ({
      id: game.igdbId,
      // summary, studio, cover are omitted or null
      summary: null,
      rating_count: 500, // Only rating_count changed
    }),
    applyUpdate: async (payload) => {
      appliedPayload = payload;
    },
  });

  const manifest = await service.plan({ limit: 1 });
  assert.equal(manifest.eligibleForRefresh, 1);
  assert.ok(manifest.candidates[0].fieldsChanged.includes('ratingCount'));
  assert.ok(!manifest.candidates[0].fieldsChanged.includes('description'));
  assert.ok(!manifest.candidates[0].fieldsChanged.includes('studio'));
  assert.ok(!manifest.candidates[0].fieldsChanged.includes('coverUrl'));

  await service.apply(manifest);
  // Ensure updates do not contain undefined or null overrides for existing fields
  assert.equal(appliedPayload.updates.description, undefined);
  assert.equal(appliedPayload.updates.studio, undefined);
  assert.equal(appliedPayload.updates.coverUrl, undefined);
  assert.equal(appliedPayload.updates.ratingCount, 500);
});

test('Test J: segunda execução idempotente -> zero writes', async () => {
  const game = createMockGame({ steamOffers: [{ priceCents: 10000, discountPercent: 0 }] });
  let writeCount = 0;

  const service = new CatalogRefreshService({
    loadCatalogGames: async () => [game],
    fetchSteamDetails: async () => ({
      success: true,
      data: {
        steam_appid: game.steamAppId,
        price_overview: {
          final: 4500,
          initial: 9000,
          discount_percent: 50,
          currency: 'BRL',
        },
      },
    }),
    applyUpdate: async (payload) => {
      writeCount++;
      // Simulate state updated in DB
      game.steamOffers = [
        {
          priceCents: payload.steamOffer.priceCents,
          originalPriceCents: payload.steamOffer.originalPriceCents,
          discountPercent: payload.steamOffer.discountPercent,
          currency: payload.steamOffer.currency,
          isAvailable: payload.steamOffer.isAvailable,
        },
      ];
    },
  });

  // Run 1: Applies update
  const manifest1 = await service.plan({ limit: 1 });
  assert.equal(manifest1.eligibleForRefresh, 1);
  const result1 = await service.apply(manifest1);
  assert.equal(result1.updated, 1);
  assert.equal(writeCount, 1);

  // Run 2: Re-run plan on updated state
  const manifest2 = await service.plan({ limit: 1 });
  assert.equal(manifest2.eligibleForRefresh, 0);
  assert.equal(manifest2.noChangeCount, 1);
  assert.equal(manifest2.candidates[0].status, 'NO_CHANGE');

  const result2 = await service.apply(manifest2);
  assert.equal(result2.updated, 0);
  assert.equal(result2.noChange, 1);
  assert.equal(writeCount, 1); // Zero additional writes!
});

test('Test K: dry-run -> zero writes', async () => {
  const game = createMockGame({ steamOffers: [{ priceCents: 10000, discountPercent: 0 }] });
  let writeCalled = false;

  const service = new CatalogRefreshService({
    loadCatalogGames: async () => [game],
    fetchSteamDetails: async () => ({
      success: true,
      data: {
        steam_appid: game.steamAppId,
        price_overview: {
          final: 3000,
          initial: 10000,
          discount_percent: 70,
          currency: 'BRL',
        },
      },
    }),
    applyUpdate: async () => {
      writeCalled = true;
    },
  });

  const manifest = await service.plan({ limit: 1 });
  assert.equal(manifest.eligibleForRefresh, 1);

  // Call apply with dryRun: true
  const result = await service.apply(manifest, { dryRun: true });
  assert.equal(result.updated, 0);
  assert.equal(writeCalled, false);
});

test('Test L: limit > 50 -> rejected', async () => {
  const service = new CatalogRefreshService();
  await assert.rejects(
    async () => service.plan({ limit: 51 }),
    /must be an integer between 1 and 50/,
  );
  await assert.rejects(
    async () => service.plan({ limit: 0 }),
    /must be an integer between 1 and 50/,
  );
  await assert.rejects(
    async () => service.plan({ limit: -1 }),
    /must be an integer between 1 and 50/,
  );
  assert.throws(() => validateCatalogRefreshLimit(100), /between 1 and 50/);
});

test('Test M: provider unavailable -> fail closed / reportável', async () => {
  const game = createMockGame({ steamAppId: 10010 });
  let writeCalled = false;

  const service = new CatalogRefreshService({
    loadCatalogGames: async () => [game],
    fetchSteamDetails: async () => {
      throw new Error('Steam API Gateway Timeout 504');
    },
    applyUpdate: async () => {
      writeCalled = true;
    },
  });

  const manifest = await service.plan({ limit: 1 });
  assert.equal(manifest.failedCount, 1);
  assert.equal(manifest.candidates[0].status, 'FAILED_PROVIDER_UNAVAILABLE');
  assert.equal(manifest.candidates[0].refreshEligible, false);
  assert.ok(manifest.candidates[0].error.includes('Steam details provider unavailable'));

  const result = await service.apply(manifest);
  assert.equal(result.failed, 1);
  assert.equal(result.updated, 0);
  assert.equal(writeCalled, false);
});

test('Test N: múltiplos jogos -> failure isolation', async () => {
  const game1 = createMockGame({ id: 'g1', title: 'Game One', steamAppId: 101, steamOffers: [{ priceCents: 10000 }] });
  const game2 = createMockGame({ id: 'g2', title: 'Game Two', steamAppId: 102, steamOffers: [{ priceCents: 10000 }] });
  const game3 = createMockGame({ id: 'g3', title: 'Game Three', steamAppId: 103, steamOffers: [{ priceCents: 10000 }] });

  const updatedIds = [];

  const service = new CatalogRefreshService({
    loadCatalogGames: async () => [game1, game2, game3],
    fetchSteamDetails: async (appId) => {
      if (appId === 102) {
        throw new Error('Provider down for Game 2');
      }
      return {
        success: true,
        data: {
          steam_appid: appId,
          price_overview: {
            final: 5000,
            initial: 10000,
            discount_percent: 50,
            currency: 'BRL',
          },
        },
      };
    },
    applyUpdate: async (payload) => {
      updatedIds.push(payload.gameId);
    },
  });

  const manifest = await service.plan({ limit: 3 });
  assert.equal(manifest.processed, 3);
  assert.equal(manifest.eligibleForRefresh, 2);
  assert.equal(manifest.failedCount, 1);
  assert.equal(manifest.candidates[1].status, 'FAILED_PROVIDER_UNAVAILABLE');

  const result = await service.apply(manifest);
  assert.equal(result.processed, 3);
  assert.equal(result.updated, 2);
  assert.equal(result.failed, 1);
  assert.deepEqual(updatedIds, ['g1', 'g3']); // Game 1 and 3 updated, Game 2 isolated
});

test('Steam Quality Gate drop reports warning without failing candidate or deleting game', async () => {
  const game = createMockGame({ steamAppId: 500 });

  const service = new CatalogRefreshService({
    loadCatalogGames: async () => [game],
    fetchSteamDetails: async () => ({
      success: true,
      data: {
        steam_appid: 500,
        price_overview: { final: 4000, initial: 8000, discount_percent: 50, currency: 'BRL' },
      },
    }),
    fetchSteamReviews: async () => ({
      totalReviews: 80, // below 100
      positiveReviews: 60,
      positivePercentage: 75.0, // below 80%
    }),
  });

  const manifest = await service.plan({ limit: 1 });
  assert.equal(manifest.eligibleForRefresh, 1);
  assert.equal(manifest.candidates[0].status, 'ELIGIBLE');
  assert.ok(manifest.candidates[0].steamQualityWarning.includes('Steam Quality Warning'));
  // Candidate is still ELIGIBLE and NOT failed
  assert.equal(manifest.candidates[0].refreshEligible, true);
});

test('parseCatalogRefreshArgs validates limit, apply, and rejects invalid limits', () => {
  const opts1 = parseCatalogRefreshArgs(['--limit', '25']);
  assert.equal(opts1.limit, 25);
  assert.equal(opts1.apply, false);

  const opts2 = parseCatalogRefreshArgs(['--limit', '50', '--apply']);
  assert.equal(opts2.limit, 50);
  assert.equal(opts2.apply, true);

  assert.throws(() => parseCatalogRefreshArgs(['--limit', '51']), /between 1 and 50/);
  assert.throws(() => parseCatalogRefreshArgs(['--limit', '0']), /between 1 and 50/);
  assert.throws(() => parseCatalogRefreshArgs([]), /requer argumento explícito --limit/);
});

test('formatCatalogRefreshPlan and formatCatalogRefreshResult generate structured reports', async () => {
  const game = createMockGame();
  const service = new CatalogRefreshService({
    loadCatalogGames: async () => [game],
    fetchSteamDetails: async () => ({
      success: true,
      data: {
        steam_appid: game.steamAppId,
        price_overview: { final: 5000, initial: 10000, discount_percent: 50, currency: 'BRL' },
      },
    }),
  });

  const manifest = await service.plan({ limit: 1 });
  const planReport = formatCatalogRefreshPlan(manifest);
  assert.ok(planReport.includes('NEXTPLAY — CATALOG REFRESH PLAN'));
  assert.ok(planReport.includes('sessionId:'));
  assert.ok(planReport.includes('Test Game'));

  const result = await service.apply(manifest, { dryRun: true });
  const resultReport = formatCatalogRefreshResult(result);
  assert.ok(resultReport.includes('NEXTPLAY — CATALOG REFRESH EXECUTION REPORT'));
  assert.ok(resultReport.includes('updated:'));
});

test('IGDB Identity Test A: Multiple Steam IDs [12120, 12250] with catalog 12250 -> PASS', async () => {
  const game = createMockGame({
    title: 'Grand Theft Auto: San Andreas',
    igdbId: 732,
    steamAppId: 12250,
  });

  const service = new CatalogRefreshService({
    loadCatalogGames: async () => [game],
    fetchSteamDetails: async (appId) => ({
      success: true,
      data: {
        steam_appid: appId,
        price_overview: { final: 5000, initial: 10000, discount_percent: 50, currency: 'BRL' },
      },
    }),
    fetchIgdbGame: async () => ({
      id: 732,
      external_games: [
        { uid: '12120', external_game_source: { name: 'Steam' } },
        { uid: '12250', external_game_source: { name: 'Steam' } },
      ],
    }),
  });

  const manifest = await service.plan({ limit: 1 });
  assert.equal(manifest.failedCount, 0);
  assert.equal(manifest.eligibleForRefresh, 1);
  assert.equal(manifest.candidates[0].status, 'ELIGIBLE');
  assert.equal(manifest.candidates[0].steamAppId, 12250);
  assert.equal(game.steamAppId, 12250);
});

test('IGDB Identity Test B: Multiple Steam IDs [22490, 22380] with catalog 22380 -> PASS', async () => {
  const game = createMockGame({
    title: 'Fallout: New Vegas',
    igdbId: 16,
    steamAppId: 22380,
  });

  const service = new CatalogRefreshService({
    loadCatalogGames: async () => [game],
    fetchSteamDetails: async (appId) => ({
      success: true,
      data: {
        steam_appid: appId,
        price_overview: { final: 3900, initial: 3900, discount_percent: 0, currency: 'BRL' },
      },
    }),
    fetchIgdbGame: async () => ({
      id: 16,
      external_games: [
        { uid: '22490', external_game_source: { name: 'Steam' } },
        { uid: '22380', external_game_source: { name: 'Steam' } },
      ],
    }),
  });

  const manifest = await service.plan({ limit: 1 });
  assert.equal(manifest.failedCount, 0);
  assert.equal(manifest.eligibleForRefresh, 1);
  assert.equal(manifest.candidates[0].status, 'ELIGIBLE');
  assert.equal(manifest.candidates[0].steamAppId, 22380);
  assert.equal(game.steamAppId, 22380);
});

test('IGDB Identity Test C: IGDB [400] vs catalog 52003 -> FAILED_IDENTITY_CONFLICT', async () => {
  const game = createMockGame({
    title: 'Portal',
    igdbId: 71,
    steamAppId: 52003,
  });

  const service = new CatalogRefreshService({
    loadCatalogGames: async () => [game],
    fetchSteamDetails: async () => ({
      success: true,
      data: {
        steam_appid: 52003,
      },
    }),
    fetchIgdbGame: async () => ({
      id: 71,
      external_games: [
        { uid: '400', external_game_source: { name: 'Steam' } },
      ],
    }),
  });

  const manifest = await service.plan({ limit: 1 });
  assert.equal(manifest.failedCount, 1);
  assert.equal(manifest.candidates[0].status, 'FAILED_IDENTITY_CONFLICT');
  assert.ok(manifest.candidates[0].error.includes('conflicting Steam App ID(s): [400] vs existing confirmed 52003'));
  assert.equal(manifest.candidates[0].steamAppId, 52003);
  assert.equal(game.steamAppId, 52003);
});

test('IGDB Identity Test D: IGDB [35140] vs catalog 35010 -> FAILED_IDENTITY_CONFLICT', async () => {
  const game = createMockGame({
    title: 'Batman: Arkham Asylum',
    igdbId: 500,
    steamAppId: 35010,
  });

  const service = new CatalogRefreshService({
    loadCatalogGames: async () => [game],
    fetchSteamDetails: async () => ({
      success: true,
      data: {
        steam_appid: 35010,
      },
    }),
    fetchIgdbGame: async () => ({
      id: 500,
      external_games: [
        { uid: '35140', external_game_source: { name: 'Steam' } },
      ],
    }),
  });

  const manifest = await service.plan({ limit: 1 });
  assert.equal(manifest.failedCount, 1);
  assert.equal(manifest.candidates[0].status, 'FAILED_IDENTITY_CONFLICT');
  assert.ok(manifest.candidates[0].error.includes('conflicting Steam App ID(s): [35140] vs existing confirmed 35010'));
  assert.equal(manifest.candidates[0].steamAppId, 35010);
  assert.equal(game.steamAppId, 35010);
});

test('IGDB Identity Test E: IGDB [379720] vs catalog 430910 -> FAILED_IDENTITY_CONFLICT', async () => {
  const game = createMockGame({
    title: 'Doom',
    igdbId: 7351,
    steamAppId: 430910,
  });

  const service = new CatalogRefreshService({
    loadCatalogGames: async () => [game],
    fetchSteamDetails: async () => ({
      success: true,
      data: {
        steam_appid: 430910,
      },
    }),
    fetchIgdbGame: async () => ({
      id: 7351,
      external_games: [
        { uid: '379720', external_game_source: { name: 'Steam' } },
      ],
    }),
  });

  const manifest = await service.plan({ limit: 1 });
  assert.equal(manifest.failedCount, 1);
  assert.equal(manifest.candidates[0].status, 'FAILED_IDENTITY_CONFLICT');
  assert.ok(manifest.candidates[0].error.includes('conflicting Steam App ID(s): [379720] vs existing confirmed 430910'));
  assert.equal(manifest.candidates[0].steamAppId, 430910);
  assert.equal(game.steamAppId, 430910);
});

test('IGDB Identity Test F: duplicate, non-numeric and invalid strings are normalized and ignored', async () => {
  const game = createMockGame({
    title: 'Normalization Game',
    igdbId: 9999,
    steamAppId: 12250,
  });

  const service = new CatalogRefreshService({
    loadCatalogGames: async () => [game],
    fetchSteamDetails: async () => ({
      success: true,
      data: {
        steam_appid: 12250,
        price_overview: { final: 1000, initial: 1000, discount_percent: 0, currency: 'BRL' },
      },
    }),
    fetchIgdbGame: async () => ({
      id: 9999,
      external_games: [
        { uid: ' 12250 ', external_game_source: { name: 'Steam' } },
        { uid: '12250', external_game_source: { name: 'Steam' } },
        { uid: 'abc', external_game_source: { name: 'Steam' } },
        { uid: '-500', external_game_source: { name: 'Steam' } },
        { uid: '12.34', external_game_source: { name: 'Steam' } },
        { uid: null, external_game_source: { name: 'Steam' } },
        { uid: undefined, external_game_source: { name: 'Steam' } },
      ],
    }),
  });

  const manifest = await service.plan({ limit: 1 });
  assert.equal(manifest.failedCount, 0);
  assert.equal(manifest.candidates[0].status, 'ELIGIBLE');
  assert.equal(manifest.candidates[0].steamAppId, 12250);
});

test('IGDB Identity Test G: external_games without Steam IDs preserves existing fail-closed behavior', async () => {
  const game = createMockGame({
    title: 'GOG Only Game',
    igdbId: 8888,
    steamAppId: 10010,
  });

  const service = new CatalogRefreshService({
    loadCatalogGames: async () => [game],
    fetchSteamDetails: async () => ({
      success: true,
      data: {
        steam_appid: 10010,
        price_overview: { final: 2000, initial: 2000, discount_percent: 0, currency: 'BRL' },
      },
    }),
    fetchIgdbGame: async () => ({
      id: 8888,
      external_games: [
        { uid: 'gog_123', external_game_source: { name: 'GOG' } },
      ],
    }),
  });

  const manifest = await service.plan({ limit: 1 });
  // Does not fail from IGDB check, does not invent identity
  assert.equal(manifest.failedCount, 0);
  assert.equal(manifest.candidates[0].status, 'ELIGIBLE');
  assert.equal(manifest.candidates[0].steamAppId, 10010);
});

test('IGDB Identity Test H: steamAppId is never mutated across plan or apply', async () => {
  const originalSteamAppId = 12250;
  const game = createMockGame({
    title: 'Immutability Check',
    igdbId: 732,
    steamAppId: originalSteamAppId,
  });

  let updateCalled = false;
  const service = new CatalogRefreshService({
    loadCatalogGames: async () => [game],
    fetchSteamDetails: async (appId) => ({
      success: true,
      data: {
        steam_appid: appId,
        price_overview: { final: 4000, initial: 8000, discount_percent: 50, currency: 'BRL' },
      },
    }),
    fetchIgdbGame: async () => ({
      id: 732,
      external_games: [
        { uid: '12120', external_game_source: { name: 'Steam' } },
        { uid: '12250', external_game_source: { name: 'Steam' } },
      ],
    }),
    applyUpdate: async (payload) => {
      updateCalled = true;
      // Payload MUST NOT contain steamAppId mutation
      assert.equal(payload.steamAppId, undefined);
      assert.equal(payload.updates.steamAppId, undefined);
    },
  });

  const manifest = await service.plan({ limit: 1 });
  assert.equal(game.steamAppId, originalSteamAppId);
  assert.equal(manifest.candidates[0].steamAppId, originalSteamAppId);

  const result = await service.apply(manifest);
  assert.equal(result.updated, 1);
  assert.equal(game.steamAppId, originalSteamAppId);
});
