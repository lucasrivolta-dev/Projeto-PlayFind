import type { PrismaDbClient } from '../games/prisma-game.repository.js';
import { GenrePreferencesService, GENRE_PREFERENCES_EVENT, EXPLICIT_GENRE_WEIGHT } from '../user/genre-preferences.service.js';

export type RecommendationEventType =
  | 'ONBOARDING_POSITIVE'
  | 'WATCH'
  | 'EARLY_SKIP'
  | 'DETAIL_VIEW'
  | 'FEED_VIEWED';

export const ALLOWED_EVENT_TYPES: Set<string> = new Set<RecommendationEventType>([
  'ONBOARDING_POSITIVE',
  'WATCH',
  'EARLY_SKIP',
  'DETAIL_VIEW',
  'FEED_VIEWED',
]);

export const TASTE_SIGNAL_WEIGHTS = {
  ONBOARDING_POSITIVE: 3.0,
  WANT_TO_PLAY: 3.0,
  LIKE: 2.0,
  WATCH_HIGH: 2.0,
  WATCH_MODERATE: 1.0,
  DETAIL_VIEW: 1.0,
  PLAYED: 1.0,
  EARLY_SKIP: -0.75,
} as const;

export interface IngestRecommendationEventDto {
  gameId: string;
  eventType: string;
  position?: number;
  watchDurationMs?: number;
  metadata?: Record<string, unknown>;
}

export interface UserTasteProfile {
  userId: string;
  genreAffinity: Map<string, number>;
  alreadyInteractedGameIds: Set<string>;
  preferredPlatformSlugs: string[];
  topGenres: string[];
  totalSignals: number;
  /** Existing weighted game signals, retained for corroborating genre combinations. */
  genreEvidence?: Array<{ genres: string[]; weight: number }>;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class RecommendationService {
  constructor(private readonly prisma: PrismaDbClient) {}

  /**
   * Records recommendation and engagement events with deduplication and validation.
   */
  async recordEvents(
    userId: string,
    events: IngestRecommendationEventDto[],
  ): Promise<{ recorded: number; skipped: number }> {
    if (!events || events.length === 0) {
      return { recorded: 0, skipped: 0 };
    }

    const fiveSecondsAgo = new Date(Date.now() - 5000);
    let recorded = 0;
    let skipped = 0;

    for (const ev of events) {
      if (!ev.gameId || !UUID_REGEX.test(ev.gameId)) {
        skipped++;
        continue;
      }
      if (!ALLOWED_EVENT_TYPES.has(ev.eventType)) {
        skipped++;
        continue;
      }

      const watchDurationMs =
        typeof ev.watchDurationMs === 'number' && Number.isSafeInteger(ev.watchDurationMs)
          ? Math.max(0, Math.min(1800000, ev.watchDurationMs))
          : null;

      const position =
        typeof ev.position === 'number' && Number.isSafeInteger(ev.position)
          ? Math.max(0, ev.position)
          : null;

      // Deduplication: skip if identical event for this game and user was recorded in the last 5 seconds
      try {
        const recent = await this.prisma.recommendationEvent.findFirst({
          where: {
            userId,
            gameId: ev.gameId,
            eventType: ev.eventType,
            createdAt: { gte: fiveSecondsAgo },
          },
        });

        if (recent) {
          skipped++;
          continue;
        }

        await this.prisma.recommendationEvent.create({
          data: {
            userId,
            gameId: ev.gameId,
            eventType: ev.eventType,
            position,
            watchDurationMs,
            metadata: (ev.metadata as any) ?? undefined,
          },
        });
        recorded++;
      } catch (error) {
        skipped++;
      }
    }

    return { recorded, skipped };
  }

  /**
   * Persists the 5-10 games selected during taste onboarding as ONBOARDING_POSITIVE events.
   */
  async saveOnboardingTaste(userId: string, gameIds: string[]): Promise<number> {
    const validIds = Array.from(
      new Set(gameIds.map((id) => id?.trim()).filter((id) => id && UUID_REGEX.test(id))),
    );

    if (validIds.length === 0) return 0;

    // Verify games actually exist in database
    const existing = await this.prisma.game.findMany({
      where: { id: { in: validIds } },
      select: { id: true },
    });
    const existingIds = new Set(existing.map((g) => g.id));

    let createdCount = 0;
    for (const gameId of validIds) {
      if (!existingIds.has(gameId)) continue;
      try {
        await this.prisma.recommendationEvent.create({
          data: {
            userId,
            gameId,
            eventType: 'ONBOARDING_POSITIVE',
            metadata: { source: 'onboarding' },
          },
        });
        createdCount++;
      } catch {
        // Safe skip on transient error
      }
    }

    return createdCount;
  }

  /**
   * Checks whether the user needs taste onboarding.
   * If user already has >= 5 onboarding selections OR >= 3 positive library interactions,
   * onboarding is deemed completed so existing accounts are never blocked.
   */
  async getOnboardingTasteStatus(userId: string): Promise<{ completed: boolean; count: number }> {
    const onboardingCount = await this.prisma.recommendationEvent.count({
      where: {
        userId,
        eventType: 'ONBOARDING_POSITIVE',
      },
    });

    if (onboardingCount >= 5) {
      return { completed: true, count: onboardingCount };
    }

    const libraryInteractions = await this.prisma.userGameLibrary.count({
      where: {
        userId,
        OR: [{ liked: true }, { status: { in: ['WANT_TO_PLAY', 'PLAYED'] } }],
      },
    });

    const completed = onboardingCount >= 5 || libraryInteractions >= 3;
    return { completed, count: onboardingCount };
  }

  /**
   * Loads the user's taste profile in a single batch without N+1 queries.
   * Derives genre affinities using weighted signals and recency decay.
   */
  async getUserTasteProfile(userId: string): Promise<UserTasteProfile> {
    const now = Date.now();
    const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);

    // 1. Batch load platform preferences, library, and recent recommendation events in parallel
    const [platformPrefs, libraryEntries, recentEvents, explicitGenres] = await Promise.all([
      this.prisma.userPlatformPreference.findMany({
        where: { userId },
        include: { platform: true },
      }),
      this.prisma.userGameLibrary.findMany({
        where: { userId },
        select: { gameId: true, liked: true, status: true, rating: true, updatedAt: true },
      }),
      this.prisma.recommendationEvent.findMany({
        where: {
          userId,
          createdAt: { gte: thirtyDaysAgo },
          eventType: { not: GENRE_PREFERENCES_EVENT },
        },
        select: {
          gameId: true,
          eventType: true,
          watchDurationMs: true,
          metadata: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      new GenrePreferencesService(this.prisma).signal(userId),
    ]);

    const preferredPlatformSlugs = platformPrefs.map((p) => p.platform.slug.toLowerCase());

    const alreadyInteractedGameIds = new Set<string>();
    const gameSignalWeights = new Map<string, number>();

    // Process library signals (liked, WANT_TO_PLAY, PLAYED)
    for (const entry of libraryEntries) {
      let weight = 0;
      if (entry.status === 'WANT_TO_PLAY') {
        weight += TASTE_SIGNAL_WEIGHTS.WANT_TO_PLAY;
        alreadyInteractedGameIds.add(entry.gameId);
      }
      if (entry.liked) {
        weight += TASTE_SIGNAL_WEIGHTS.LIKE;
        alreadyInteractedGameIds.add(entry.gameId);
      }
      if (entry.status === 'PLAYED') {
        weight += TASTE_SIGNAL_WEIGHTS.PLAYED;
        alreadyInteractedGameIds.add(entry.gameId);
      }
      if (entry.rating && entry.rating >= 4) {
        weight += 1.0;
        alreadyInteractedGameIds.add(entry.gameId);
      }

      if (weight > 0) {
        gameSignalWeights.set(entry.gameId, (gameSignalWeights.get(entry.gameId) ?? 0) + weight);
      }
    }

    // Process recommendation events signals with recency decay
    for (const ev of recentEvents) {
      if (!ev.gameId) continue;

      const ageHours = (now - ev.createdAt.getTime()) / (1000 * 60 * 60);
      const recencyMultiplier = ageHours <= 48 ? 1.2 : ageHours <= 336 ? 1.0 : 0.7;

      let baseWeight = 0;
      if (ev.eventType === 'ONBOARDING_POSITIVE') {
        baseWeight = TASTE_SIGNAL_WEIGHTS.ONBOARDING_POSITIVE;
        alreadyInteractedGameIds.add(ev.gameId);
      } else if (ev.eventType === 'DETAIL_VIEW') {
        baseWeight = TASTE_SIGNAL_WEIGHTS.DETAIL_VIEW;
      } else if (ev.eventType === 'WATCH') {
        const watchDuration = ev.watchDurationMs ?? 0;
        const watchRatio =
          typeof ev.metadata === 'object' && ev.metadata !== null && 'watchRatio' in ev.metadata
            ? Number((ev.metadata as any).watchRatio)
            : 0;

        if (watchRatio >= 0.7 || watchDuration >= 15000) {
          baseWeight = TASTE_SIGNAL_WEIGHTS.WATCH_HIGH;
        } else if (watchRatio >= 0.35 || watchDuration >= 6000) {
          baseWeight = TASTE_SIGNAL_WEIGHTS.WATCH_MODERATE;
        }
      } else if (ev.eventType === 'EARLY_SKIP') {
        baseWeight = TASTE_SIGNAL_WEIGHTS.EARLY_SKIP;
      }

      if (baseWeight !== 0) {
        const weighted = baseWeight * recencyMultiplier;
        gameSignalWeights.set(ev.gameId, (gameSignalWeights.get(ev.gameId) ?? 0) + weighted);
      }
    }

    // 2. Fetch genres and metadata of all signal games in ONE batch query (No N+1)
    const signalGameIds = Array.from(gameSignalWeights.keys());
    const genreAffinity = new Map<string, number>();
    for (const genre of explicitGenres.genres) {
      genreAffinity.set(genre.name.toLowerCase(), EXPLICIT_GENRE_WEIGHT);
    }
    const genreEvidence: NonNullable<UserTasteProfile['genreEvidence']> = [];

    if (signalGameIds.length > 0) {
      const signalGames = await this.prisma.game.findMany({
        where: { id: { in: signalGameIds } },
        select: {
          id: true,
          genres: { include: { genre: true } },
        },
      });

      for (const game of signalGames) {
        const signalWeight = gameSignalWeights.get(game.id) ?? 0;
        if (signalWeight === 0) continue;

        genreEvidence.push({ genres: game.genres.map((g) => g.genre.name), weight: signalWeight });

        const genreCount = Math.max(1, game.genres.length);
        const weightPerGenre = signalWeight / genreCount;

        for (const g of game.genres) {
          const genreName = g.genre.name.toLowerCase();
          const current = genreAffinity.get(genreName) ?? 0;
          genreAffinity.set(genreName, current + weightPerGenre);
        }
      }
    }

    // Sort top genres
    const sortedGenres = Array.from(genreAffinity.entries())
      .filter(([, score]) => score > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([name]) => name);

    return {
      userId,
      genreAffinity,
      alreadyInteractedGameIds,
      preferredPlatformSlugs,
      topGenres: sortedGenres.slice(0, 3),
      totalSignals: gameSignalWeights.size + explicitGenres.selectedKeys.length,
      genreEvidence,
    };
  }
}
