import test from 'node:test';
import assert from 'node:assert/strict';
import { GameService } from '../dist/modules/games/game.service.js';
import { RecommendationService } from '../dist/modules/recommendation/recommendation.service.js';
import { buildApp } from '../dist/app.js';

function createMockGame(id, title) {
  return {
    id,
    title,
    slug: title.toLowerCase().replace(/\s+/g, '-'),
    rating: 8.5,
    ratingCount: 200,
    totalRating: 8.5,
    totalRatingCount: 200,
    releaseDate: new Date('2024-01-01'),
    createdAt: new Date('2024-01-01'),
    description: `A quality game description for ${title} to satisfy catalog eligibility requirements.`,
    studio: 'Test Studio',
    publisher: 'Test Publisher',
    coverUrl: `https://example.com/${id}.jpg`,
    heroUrl: null,
    isFree: false,
    steamAppId: 1000 + Number(id.replace(/\D/g, '') || '1'),
    igdbId: 5000 + Number(id.replace(/\D/g, '') || '1'),
    genres: [{ genre: { id: 'g-action', name: 'Action', slug: 'action' } }],
    platforms: [{ platform: { id: 'p-pc', name: 'PC', slug: 'pc' } }],
    media: [
      {
        type: 'TRAILER',
        url: `https://www.youtube.com/watch?v=mockVideo${id}`,
        provider: 'YOUTUBE',
        mimeType: null,
        origin: 'official',
        sortOrder: 0,
      },
    ],
    steamOffers: [],
    storeOffers: [],
  };
}

const mockCatalog = Array.from({ length: 30 }).map((_, i) =>
  createMockGame(`11111111-0000-0000-0000-0000000000${String(i + 1).padStart(2, '0')}`, `Game ${i + 1}`)
);

function createMockPrisma() {
  const users = [
    { id: 'user-a', firebaseUid: 'firebase-user-a', name: 'User A', email: 'a@test.com' },
    { id: 'user-b', firebaseUid: 'firebase-user-b', name: 'User B', email: 'b@test.com' },
  ];

  const events = [];

  return {
    game: {
      findMany: async () => mockCatalog,
      findUnique: async ({ where }) => mockCatalog.find((g) => g.id === where.id || g.slug === where.slug) ?? null,
      count: async () => mockCatalog.length,
    },
    user: {
      findUnique: async ({ where }) => users.find((u) => u.id === where.id || u.firebaseUid === where.firebaseUid) ?? null,
      upsert: async ({ create }) => create,
    },
    userPlatformPreference: {
      findMany: async () => [],
    },
    userGameLibrary: {
      findMany: async () => [],
      count: async () => 0,
      groupBy: async () => [],
    },
    recommendationEvent: {
      findFirst: async ({ where }) => {
        return events.find((e) => {
          if (where.userId && e.userId !== where.userId) return false;
          if (where.gameId && e.gameId !== where.gameId) return false;
          if (where.eventType && e.eventType !== where.eventType) return false;
          return true;
        }) ?? null;
      },
      findMany: async ({ where }) => {
        return events.filter((e) => {
          if (where.userId && e.userId !== where.userId) return false;
          if (where.eventType && e.eventType !== where.eventType) return false;
          return true;
        });
      },
      create: async ({ data }) => {
        const item = { id: `event-${events.length + 1}`, ...data, createdAt: new Date() };
        events.push(item);
        return item;
      },
      update: async ({ where, data }) => {
        const item = events.find(e => e.id === where.id);
        if (item) {
          if (data.createdAt) item.createdAt = data.createdAt;
        }
        return item;
      },
      count: async () => 0,
    },
    comment: {
      count: async () => 0,
      groupBy: async () => [],
    },
    $transaction: async (fn) => fn(this),
    _events: events,
  };
}

test('A) usuÃ¡rio sem seen history -> recebe feed normal', async () => {
  const db = createMockPrisma();
  const recService = new RecommendationService(db);
  const gameService = new GameService(db, recService);

  const feed = await gameService.getFeedGames(20, [], [], 'user-a');
  assert.equal(feed.length, 20);
});

test('B, C) usuÃ¡rio vÃª jogo A -> persistÃªncia registra A -> A nÃ£o reaparece', async () => {
  const db = createMockPrisma();
  const recService = new RecommendationService(db);
  const gameService = new GameService(db, recService);
  const app = await buildApp({ prisma: db, allowTestUsers: true });

  const feed1 = await gameService.getFeedGames(20, [], [], 'user-a');
  const topGameId = feed1[0].id;

  await gameService.markFeedSeen('user-a', topGameId);

  const feed2 = await gameService.getFeedGames(20, [], [], 'user-a');

  assert.equal(feed2.find(g => g.id === topGameId), undefined);
});

test('E) usuÃ¡rio A nÃ£o contamina usuÃ¡rio B', async () => {
  const db = createMockPrisma();
  const recService = new RecommendationService(db);
  const gameService = new GameService(db, recService);

  const feed1 = await gameService.getFeedGames(20, [], [], 'user-a');
  const topGameId = feed1[0].id;

  await gameService.markFeedSeen('user-a', topGameId);

  // User B hasn't seen it, so it should still be at the top for B
  const feedB = await gameService.getFeedGames(20, [], [], 'user-b');
  assert.equal(feedB[0].id, topGameId);
});

test('H, I) quando unseen Ã© insuficiente -> fallback recicla os menos recentes', async () => {
  const db = createMockPrisma();
  const recService = new RecommendationService(db);
  const gameService = new GameService(db, recService);

  // We have 30 games. We want a feed of 20.
  // Let's mark 25 games as seen recently, and 5 as unseen.
  // The feed should return the 5 unseen + 15 seen recently.

  for (let i = 0; i < 25; i++) {
    await gameService.markFeedSeen('user-a', mockCatalog[i].id);
  }

  const feed = await gameService.getFeedGames(20, [], [], 'user-a');
  assert.equal(feed.length, 20);

  // The first 5 should be the unseen ones (index 25 to 29)
  const unseenIds = new Set(mockCatalog.slice(25).map(g => g.id));
  const feedTop5 = feed.slice(0, 5);
  for (const g of feedTop5) {
    assert.ok(unseenIds.has(g.id), 'Top games should be unseen');
  }

  // The rest should be from the seen recently bucket.
  const seenIds = new Set(mockCatalog.slice(0, 25).map(g => g.id));
  const feedRest = feed.slice(5);
  for (const g of feedRest) {
    assert.ok(seenIds.has(g.id), 'Fallback games should be recently seen');
  }
});

test('G) registrar o mesmo jogo novamente nÃ£o cria duplicaÃ§Ã£o', async () => {
  const db = createMockPrisma();
  const recService = new RecommendationService(db);
  const gameService = new GameService(db, recService);

  await gameService.markFeedSeen('user-a', mockCatalog[0].id);
  await gameService.markFeedSeen('user-a', mockCatalog[0].id);

  assert.equal(db._events.length, 1);
});

test('FASE 8 Fallback: bucket 0 > bucket 1 (>72h) > bucket 2 (<72h)', async () => {
  const db = createMockPrisma();
  const recService = new RecommendationService(db);
  const gameService = new GameService(db, recService);

  // 30 games total.
  // Games 0..4: unseen (5 games) -> bucket 0
  // Games 5..14: seen 100 hours ago (10 games) -> bucket 1 (>72h)
  // Games 15..29: seen recently (15 games) -> bucket 2 (<72h)
  for (let i = 5; i < 15; i++) {
    db._events.push({
      id: `ev-old-${i}`,
      userId: 'user-a',
      gameId: mockCatalog[i].id,
      eventType: 'FEED_VIEWED',
      createdAt: new Date(Date.now() - 100 * 3600 * 1000),
    });
  }
  for (let i = 15; i < 30; i++) {
    db._events.push({
      id: `ev-recent-${i}`,
      userId: 'user-a',
      gameId: mockCatalog[i].id,
      eventType: 'FEED_VIEWED',
      createdAt: new Date(),
    });
  }

  const feed = await gameService.getFeedGames(20, [], [], 'user-a');
  assert.equal(feed.length, 20);

  // Top 5 must be unseen (bucket 0)
  const unseenIds = new Set(mockCatalog.slice(0, 5).map(g => g.id));
  const feedTop5 = feed.slice(0, 5);
  for (const g of feedTop5) {
    assert.ok(unseenIds.has(g.id), `Top 5 must be bucket 0 (unseen), got ${g.title}`);
  }

  // Next 10 must be bucket 1 (seen > 72h)
  const oldSeenIds = new Set(mockCatalog.slice(5, 15).map(g => g.id));
  const feedNext10 = feed.slice(5, 15);
  for (const g of feedNext10) {
    assert.ok(oldSeenIds.has(g.id), `Middle 10 must be bucket 1 (seen > 72h), got ${g.title}`);
  }

  // Last 5 must be bucket 2 (recently seen)
  const recentSeenIds = new Set(mockCatalog.slice(15, 30).map(g => g.id));
  const feedLast5 = feed.slice(15, 20);
  for (const g of feedLast5) {
    assert.ok(recentSeenIds.has(g.id), `Last 5 must be bucket 2 (recently seen), got ${g.title}`);
  }
});
