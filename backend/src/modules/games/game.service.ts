import type { Prisma } from '@prisma/client';
import { matchesPlatformPreference } from './platform-preference.js';
import type { PrismaDbClient } from './prisma-game.repository.js';
import { describeTrailer, type NormalizedTrailer } from './normalized-game.js';
import {
  isEligibleForCatalog,
  areDuplicateEditions,
  calculateDiscoveryScore,
  applyFeedDiversity,
  isDisqualifiedTrailer,
  type FeedCandidateInput,
} from './game-eligibility.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ListGamesOptions {
  page?: number;
  limit?: number;
  genre?: string;
  platform?: string;
  search?: string;
}

export interface GameSummaryDto {
  id: string;
  slug: string;
  title: string;
  studio?: string;
  publisher?: string;
  description?: string;
  rating?: number;
  ratingCount?: number;
  releaseDate?: Date;
  coverUrl?: string;
  heroUrl?: string;
  isFree: boolean;
  steamAppId?: number;
  igdbId?: number;
  genres: string[];
  platforms: string[];
  likeCount?: number;
  commentCount?: number;
  stores?: Array<{ name: string; url?: string }>;
  storeOffers?: Array<{
    store: string;
    storeUrl?: string;
    originalPriceCents?: number | null;
    finalPriceCents?: number | null;
    discountPercent?: number;
    currency?: string;
    isAvailable: boolean;
  }>;
  steam?: {
    storeUrl: string;
    priceCents?: number;
    originalPriceCents?: number;
    discountPercent?: number;
    currency?: string;
    isAvailable: boolean;
  };
}

export interface GameDetailDto extends GameSummaryDto {
  screenshots: string[];
  trailers: string[];
  trailerDetails: NormalizedTrailer[];
  primaryTrailer?: NormalizedTrailer;
}

/**
 * Priority order for trailer selection:
 * 1. DIRECT (authorized, reproducible) — best for native player
 * 2. YOUTUBE (valid videoId) — reliable fallback
 * 3. STEAM
 * 4. OTHER
 * Within the same provider category, preserve original sortOrder.
 */
function providerPriority(provider: NormalizedTrailer['provider']): number {
  switch (provider) {
    case 'DIRECT':
      return 0;
    case 'YOUTUBE':
      return 1;
    case 'STEAM':
      return 2;
    default:
      return 3;
  }
}

function orderedTrailerDetails(mediaRows: { url: string; provider: string | null; mimeType: string | null; origin: string | null }[]): NormalizedTrailer[] {
  return mediaRows
    .map((m) => {
      const isOfficial = m.origin
        ? /\b(launch|official|reveal|announcement|teaser|press|cinematic)\b/i.test(m.origin)
        : m.provider === 'DIRECT';
      if (m.provider != null) {
        const described = describeTrailer(m.url);
        return {
          provider: m.provider as NormalizedTrailer['provider'],
          url: m.url,
          ...(described.videoId ? { videoId: described.videoId } : {}),
          ...(m.mimeType ? { mimeType: m.mimeType } : {}),
          ...(m.origin ? { origin: m.origin } : {}),
          isOfficial,
          // authorizationRef is NEVER included here
        } as NormalizedTrailer;
      }
      const described = describeTrailer(m.url);
      return { ...described, isOfficial };
    })
    .sort((a, b) => providerPriority(a.provider) - providerPriority(b.provider));
}

/**
 * Selects the primary reproducible trailer.
 * DIRECT or YOUTUBE with a valid videoId are reproducible.
 * STEAM and OTHER are NOT used as primaryTrailer — they return null if no DIRECT/YOUTUBE exists.
 */
function pickPrimaryTrailer(trailerDetails: NormalizedTrailer[]): NormalizedTrailer | undefined {
  for (const t of trailerDetails) {
    if (t.provider === 'DIRECT') return t;
    if (
      t.provider === 'YOUTUBE' &&
      t.videoId &&
      !isDisqualifiedTrailer(t.providerLabel) &&
      !isDisqualifiedTrailer(t.origin)
    ) {
      return t;
    }
  }
  return undefined;
}

export class GameService {
  constructor(private readonly prisma: PrismaDbClient) {}

  async listGames(options: ListGamesOptions = {}) {
    const page = Math.max(1, options.page ?? 1);
    const limit = Math.min(100, Math.max(1, options.limit ?? 20));
    const skip = (page - 1) * limit;

    const where: Prisma.GameWhereInput = {};

    if (options.search?.trim()) {
      const term = options.search.trim();
      where.OR = [
        { title: { contains: term, mode: 'insensitive' } },
        { description: { contains: term, mode: 'insensitive' } },
      ];
    }

    if (options.genre?.trim()) {
      const genreTerm = options.genre.trim().toLowerCase();
      where.genres = {
        some: {
          genre: {
            OR: [
              { slug: genreTerm },
              { name: { equals: options.genre.trim(), mode: 'insensitive' } },
            ],
          },
        },
      };
    }

    if (options.platform?.trim()) {
      const platformTerm = options.platform.trim().toLowerCase();
      where.platforms = {
        some: {
          platform: {
            OR: [
              { slug: platformTerm },
              { name: { equals: options.platform.trim(), mode: 'insensitive' } },
            ],
          },
        },
      };
    }

    const [total, records] = await Promise.all([
      this.prisma.game.count({ where }),
      this.prisma.game.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ rating: 'desc' }, { createdAt: 'desc' }],
        include: {
          genres: { include: { genre: true } },
          platforms: { include: { platform: true } },
          steamOffers: { orderBy: { capturedAt: 'desc' }, take: 1 },
        },
      }),
    ]);

    const data: GameSummaryDto[] = records.map((record) => {
      const latestSteam = record.steamOffers[0];
      return {
        id: record.id,
        slug: record.slug,
        title: record.title,
        studio: record.studio ?? undefined,
        publisher: record.publisher ?? undefined,
        description: record.description ?? undefined,
        rating: record.rating ?? undefined,
        releaseDate: record.releaseDate ?? undefined,
        coverUrl: record.coverUrl ?? undefined,
        heroUrl: record.heroUrl ?? undefined,
        isFree: record.isFree,
        steamAppId: record.steamAppId ?? undefined,
        igdbId: record.igdbId ?? undefined,
        genres: record.genres.map((g) => g.genre.name),
        platforms: record.platforms.map((p) => p.platform.name),
        steam: latestSteam
          ? {
              storeUrl: latestSteam.storeUrl,
              priceCents: latestSteam.priceCents ?? undefined,
              discountPercent: latestSteam.discountPercent ?? undefined,
              currency: latestSteam.currency ?? undefined,
              isAvailable: latestSteam.isAvailable,
            }
          : undefined,
      };
    });

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getGameById(idOrSlug: string): Promise<GameDetailDto | null> {
    const trimmed = idOrSlug.trim();
    let where: Prisma.GameWhereUniqueInput;

    if (UUID_REGEX.test(trimmed)) {
      where = { id: trimmed };
    } else if (/^\d+$/.test(trimmed)) {
      const num = Number(trimmed);
      const bySteam = await this.prisma.game.findUnique({ where: { steamAppId: num } });
      if (bySteam) {
        where = { id: bySteam.id };
      } else {
        const byIgdb = await this.prisma.game.findUnique({ where: { igdbId: num } });
        if (byIgdb) {
          where = { id: byIgdb.id };
        } else {
          where = { slug: trimmed };
        }
      }
    } else {
      where = { slug: trimmed };
    }

    const record = await this.prisma.game.findUnique({
      where,
      include: {
        genres: { include: { genre: true } },
        platforms: { include: { platform: true } },
        media: { orderBy: { sortOrder: 'asc' } },
        steamOffers: { orderBy: { capturedAt: 'desc' }, take: 1 },
        storeOffers: { orderBy: { observedAt: 'desc' } },
      },
    });

    if (!record) return null;

    let likeCount = 0;
    let commentCount = 0;
    if (this.prisma.userGameLibrary?.count) {
      try {
        likeCount = await this.prisma.userGameLibrary.count({
          where: { gameId: record.id, liked: true },
        });
      } catch {}
    }
    if (this.prisma.comment?.count) {
      try {
        commentCount = await this.prisma.comment.count({
          where: { gameId: record.id, deletedAt: null },
        });
      } catch {}
    }

    const latestSteam = record.steamOffers[0];
    const screenshots = record.media.filter((m) => m.type === 'SCREENSHOT').map((m) => m.url);
    const trailerMediaRows = record.media.filter((m) => m.type === 'TRAILER' || m.type === 'GAMEPLAY');
    const trailers = trailerMediaRows.map((m) => m.url);
    const trailerDetails = orderedTrailerDetails(
      trailerMediaRows.map((m) => ({
        url: m.url,
        provider: m.provider as string | null,
        mimeType: m.mimeType,
        origin: m.origin,
      })),
    );

    const stores: Array<{ name: string; url?: string }> = [];
    if (latestSteam?.storeUrl) {
      stores.push({ name: 'Steam', url: latestSteam.storeUrl });
    }
    for (const so of record.storeOffers ?? []) {
      if (so.store === 'STEAM' && !stores.some((s) => s.name === 'Steam')) {
        stores.push({ name: 'Steam', url: so.storeUrl });
      }
    }

    return {
      id: record.id,
      slug: record.slug,
      title: record.title,
      studio: record.studio ?? undefined,
      publisher: record.publisher ?? undefined,
      description: record.description ?? undefined,
      rating: record.rating ?? undefined,
      ratingCount: record.ratingCount ?? record.totalRatingCount ?? undefined,
      releaseDate: record.releaseDate ?? undefined,
      coverUrl: record.coverUrl ?? undefined,
      heroUrl: record.heroUrl ?? undefined,
      isFree: record.isFree,
      steamAppId: record.steamAppId ?? undefined,
      igdbId: record.igdbId ?? undefined,
      genres: record.genres.map((g) => g.genre.name),
      platforms: record.platforms.map((p) => p.platform.name),
      likeCount,
      commentCount,
      stores,
      screenshots,
      trailers,
      trailerDetails,
      primaryTrailer: pickPrimaryTrailer(trailerDetails),
      storeOffers: (record.storeOffers ?? [])
        .filter((so) => so.store === 'STEAM')
        .map((so) => ({
          store: so.store,
          storeUrl: so.storeUrl,
          originalPriceCents: so.originalPriceCents ?? null,
          finalPriceCents: so.finalPriceCents ?? null,
          discountPercent: so.discountPercent ?? 0,
          currency: so.currency ?? 'BRL',
          isAvailable: so.isAvailable,
        })),
      steam: latestSteam
        ? {
            storeUrl: latestSteam.storeUrl,
            priceCents: latestSteam.priceCents ?? undefined,
            originalPriceCents:
              latestSteam.originalPriceCents ?? latestSteam.priceCents ?? undefined,
            discountPercent: latestSteam.discountPercent ?? undefined,
            currency: latestSteam.currency ?? undefined,
            isAvailable: latestSteam.isAvailable,
          }
        : undefined,
    };
  }

  async getFeedGames(limit = 20, excludeIds?: string[], preferredPlatforms?: string[]) {
    const safeLimit = Math.min(100, Math.max(1, limit));
    const now = new Date();

    const validExcludeIds = (excludeIds ?? []).filter((id) => UUID_REGEX.test(id));
    const where: Prisma.GameWhereInput =
      validExcludeIds.length > 0 ? { id: { notIn: validExcludeIds } } : {};

    // Fetch an expanded candidate pool ordered by quality/recency, excluding already seen games
    const poolSize = Math.min(200, Math.max(100, safeLimit * 5));
    const records = await this.prisma.game.findMany({
      where,
      take: poolSize,
      orderBy: [{ rating: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
      include: {
        genres: { include: { genre: true } },
        platforms: { include: { platform: true } },
        media: { orderBy: { sortOrder: 'asc' } },
        steamOffers: { orderBy: { capturedAt: 'desc' }, take: 1 },
        storeOffers: { orderBy: { observedAt: 'desc' } },
      },
    });

    // 1. Filter out ineligible games (mods, DLCs, expansions, demos, playtests, tools, etc.)
    const eligibleRecords = records.filter((record) => {
      const eligibility = isEligibleForCatalog({
        title: record.title,
        slug: record.slug,
        rating: record.rating,
        ratingCount: record.ratingCount,
        totalRating: record.totalRating,
        totalRatingCount: record.totalRatingCount,
        releaseDate: record.releaseDate,
        description: record.description,
        coverUrl: record.coverUrl,
      });
      return eligibility.eligible;
    });

    const eligibleIds = eligibleRecords.map((r) => r.id);
    const likeMap = new Map<string, number>();
    const commentMap = new Map<string, number>();

    if (eligibleIds.length > 0 && this.prisma.userGameLibrary?.groupBy) {
      try {
        const likeGroups = await this.prisma.userGameLibrary.groupBy({
          by: ['gameId'],
          where: { gameId: { in: eligibleIds }, liked: true },
          _count: { _all: true },
        });
        for (const g of likeGroups) {
          likeMap.set(g.gameId, g._count._all);
        }
      } catch {}
    }

    if (eligibleIds.length > 0 && this.prisma.comment?.groupBy) {
      try {
        const commentGroups = await this.prisma.comment.groupBy({
          by: ['gameId'],
          where: { gameId: { in: eligibleIds }, deletedAt: null },
          _count: { _all: true },
        });
        for (const g of commentGroups) {
          commentMap.set(g.gameId, g._count._all);
        }
      } catch {}
    }

    // 2. Map records and calculate discovery scores
    const scoredCandidates = eligibleRecords.map((record) => {
      const latestSteam = record.steamOffers[0];
      const screenshots = record.media.filter((m) => m.type === 'SCREENSHOT').map((m) => m.url);
      const trailerMediaRows = record.media.filter(
        (m) => m.type === 'TRAILER' || m.type === 'GAMEPLAY',
      );
      const trailers = trailerMediaRows.map((m) => m.url);
      const trailerDetails = orderedTrailerDetails(
        trailerMediaRows.map((m) => ({
          url: m.url,
          provider: m.provider as string | null,
          mimeType: m.mimeType,
          origin: m.origin,
        })),
      );
      const primaryTrailer = pickPrimaryTrailer(trailerDetails);

      const scoringInput: FeedCandidateInput = {
        id: record.id,
        title: record.title,
        slug: record.slug,
        rating: record.rating,
        releaseDate: record.releaseDate,
        coverUrl: record.coverUrl,
        heroUrl: record.heroUrl,
        description: record.description,
        studio: record.studio,
        publisher: record.publisher,
        genres: record.genres.map((g) => g.genre.name),
        platforms: record.platforms.map((p) => p.platform.name),
        trailers,
        trailerDetails,
        primaryTrailer,
      };

      const { score, breakdown } = calculateDiscoveryScore(scoringInput, now);

      // Contextual boost if game matches user's preferred platforms
      const platformBoost = matchesPlatformPreference(
        preferredPlatforms ?? [],
        record.platforms.map((p) => p.platform.name),
        Boolean(record.steamAppId || latestSteam?.isAvailable ||
          record.storeOffers?.some((offer) => offer.store === 'STEAM' && offer.isAvailable)),
      ) ? 15 : 0;
      const finalScore = score + platformBoost;

      const likeCount = likeMap.get(record.id) ?? 0;
      const commentCount = commentMap.get(record.id) ?? 0;
      const ratingCount = record.ratingCount ?? record.totalRatingCount ?? null;

      const stores: Array<{ name: string; url?: string }> = [];
      if (latestSteam?.storeUrl) {
        stores.push({ name: 'Steam', url: latestSteam.storeUrl });
      }
      for (const so of record.storeOffers ?? []) {
        if (so.store === 'STEAM' && !stores.some((s) => s.name === 'Steam')) {
          stores.push({ name: 'Steam', url: so.storeUrl });
        }
      }

      return {
        id: record.id,
        slug: record.slug,
        title: record.title,
        studio: record.studio ?? '',
        publisher: record.publisher ?? '',
        description: record.description ?? '',
        rating: record.rating ? Number(record.rating.toFixed(1)) : null,
        ratingCount,
        likeCount,
        commentCount,
        stores,
        storeOffers: (record.storeOffers ?? [])
          .filter((so) => so.store === 'STEAM')
          .map((so) => ({
            store: so.store,
            storeUrl: so.storeUrl,
            originalPriceCents: so.originalPriceCents ?? null,
            finalPriceCents: so.finalPriceCents ?? null,
            discountPercent: so.discountPercent ?? 0,
            currency: so.currency ?? 'BRL',
            isAvailable: so.isAvailable,
          })),
        coverUrl: record.coverUrl ?? null,
        heroUrl: record.heroUrl ?? null,
        isFree: record.isFree,
        steamAppId: record.steamAppId ?? null,
        igdbId: record.igdbId ?? null,
        genres: record.genres.map((g) => g.genre.name),
        platforms: record.platforms.map((p) => p.platform.name),
        screenshots,
        trailers,
        trailerDetails,
        primaryTrailer: primaryTrailer ?? null,
        matchScore: finalScore,
        discoveryScore: finalScore,
        scoreBreakdown: { ...breakdown, platformPreference: platformBoost },
        releaseDate: record.releaseDate,
        createdAt: record.createdAt,
        steam: latestSteam
          ? {
              storeUrl: latestSteam.storeUrl,
              priceCents: latestSteam.priceCents ?? null,
              originalPriceCents:
                latestSteam.originalPriceCents ?? latestSteam.priceCents ?? null,
              discountPercent: latestSteam.discountPercent ?? null,
              currency: latestSteam.currency ?? null,
              isAvailable: latestSteam.isAvailable,
            }
          : null,
      };
    });

    // 3. Filter candidates strictly to those with a playable trailer (DIRECT or YOUTUBE with valid videoId)
    // Games without playable trailers remain 100% available in catalog (listGames, getGameById, Explore, Search, Library, Forum)
    const feedCandidates = scoredCandidates.filter((c) => c.primaryTrailer !== null);
    const withoutPlayableTrailer = scoredCandidates.length - feedCandidates.length;

    // 4. Deterministic sort by discoveryScore DESC, then rating DESC, then createdAt DESC, then id ASC
    feedCandidates.sort((a, b) => {
      if (b.discoveryScore !== a.discoveryScore) {
        return b.discoveryScore - a.discoveryScore;
      }
      const ratingA = a.rating ?? 0;
      const ratingB = b.rating ?? 0;
      if (ratingB !== ratingA) {
        return ratingB - ratingA;
      }
      const createdA = a.createdAt?.getTime() ?? 0;
      const createdB = b.createdAt?.getTime() ?? 0;
      if (createdB !== createdA) {
        return createdB - createdA;
      }
      return a.id.localeCompare(b.id);
    });

    // 5. Conservative edition deduplication (preserving remakes, remasters, distinct developers)
    const deduplicated: typeof feedCandidates = [];
    const seenIds = new Set<string>();

    for (const candidate of feedCandidates) {
      if (seenIds.has(candidate.id)) continue;

      const isDuplicate = deduplicated.some((picked) =>
        areDuplicateEditions(
          {
            title: picked.title,
            releaseDate: picked.releaseDate,
            developer: picked.studio,
          },
          {
            title: candidate.title,
            releaseDate: candidate.releaseDate,
            developer: candidate.studio,
          },
        ),
      );

      if (!isDuplicate) {
        seenIds.add(candidate.id);
        deduplicated.push(candidate);
      }
    }

    // 6. Light deterministic feed diversity (genre, release year, and studio interleaving)
    const diverse = applyFeedDiversity(deduplicated, safeLimit);

    console.log(
      `[Feed] candidatePool=${records.length} catalogEligible=${eligibleRecords.length} withoutPlayableTrailer=${withoutPlayableTrailer} excludedSeen=${validExcludeIds.length} deduplicated=${deduplicated.length} returned=${Math.min(diverse.length, safeLimit)}`,
    );

    // 7. Return standard DTOs
    return diverse.slice(0, safeLimit).map((item) => {
      const { discoveryScore, scoreBreakdown, createdAt, ...dto } = item;
      return dto;
    });
  }

  async getGameComments(gameId: string) {
    return this.prisma.comment.findMany({
      where: { gameId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            username: true,
            avatarUrl: true,
          },
        },
      },
    });
  }

  async addGameComment(gameId: string, userId: string, body: string) {
    return this.prisma.comment.create({
      data: {
        gameId,
        userId,
        body,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            username: true,
            avatarUrl: true,
          },
        },
      },
    });
  }
}
