import type { Prisma } from '@prisma/client';
import type { PrismaDbClient } from './prisma-game.repository.js';
import { describeTrailer, type NormalizedTrailer } from './normalized-game.js';

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
  releaseDate?: Date;
  coverUrl?: string;
  heroUrl?: string;
  isFree: boolean;
  steamAppId?: number;
  igdbId?: number;
  genres: string[];
  platforms: string[];
  steam?: {
    storeUrl: string;
    priceCents?: number;
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

function orderedTrailerDetails(urls: string[]): NormalizedTrailer[] {
  return urls.map(describeTrailer).sort((a, b) => Number(a.provider !== 'YOUTUBE') - Number(b.provider !== 'YOUTUBE'));
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
      },
    });

    if (!record) return null;

    const latestSteam = record.steamOffers[0];
    const screenshots = record.media.filter((m) => m.type === 'SCREENSHOT').map((m) => m.url);
    const trailers = record.media
      .filter((m) => m.type === 'TRAILER' || m.type === 'GAMEPLAY')
      .map((m) => m.url);
    const trailerDetails = orderedTrailerDetails(trailers);

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
      screenshots,
      trailers,
      trailerDetails,
      primaryTrailer: trailerDetails[0],
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
  }

  async getFeedGames(limit = 20) {
    const safeLimit = Math.min(50, Math.max(1, limit));
    // Busca primeiro os jogos que possuem mídia do tipo TRAILER ou GAMEPLAY,
    // ordenados por nota decrescente (com notas nulas por último).
    const withTrailer = await this.prisma.game.findMany({
      take: safeLimit,
      where: {
        media: {
          some: {
            type: { in: ['TRAILER', 'GAMEPLAY'] },
          },
        },
      },
      orderBy: [{ rating: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
      include: {
        genres: { include: { genre: true } },
        platforms: { include: { platform: true } },
        media: { orderBy: { sortOrder: 'asc' } },
        steamOffers: { orderBy: { capturedAt: 'desc' }, take: 1 },
      },
    });

    const remaining = safeLimit - withTrailer.length;
    const withoutTrailer =
      remaining > 0
        ? await this.prisma.game.findMany({
            take: remaining,
            where: {
              id: { notIn: withTrailer.map((g) => g.id) },
            },
            orderBy: [{ rating: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
            include: {
              genres: { include: { genre: true } },
              platforms: { include: { platform: true } },
              media: { orderBy: { sortOrder: 'asc' } },
              steamOffers: { orderBy: { capturedAt: 'desc' }, take: 1 },
            },
          })
        : [];

    const records = [...withTrailer, ...withoutTrailer];

    // Deduplicação defensiva por id (o Prisma já garante unicidade, mas é uma
    // salvaguarda caso queries futuras alterem o comportamento).
    const seen = new Set<string>();
    const unique = records.filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)));

    const toDto = (record: (typeof records)[number]) => {
      const latestSteam = record.steamOffers[0];
      const screenshots = record.media.filter((m) => m.type === 'SCREENSHOT').map((m) => m.url);
      const trailers = record.media
        .filter((m) => m.type === 'TRAILER' || m.type === 'GAMEPLAY')
        .map((m) => m.url);
      const trailerDetails = orderedTrailerDetails(trailers);
      return {
        id: record.id,
        slug: record.slug,
        title: record.title,
        studio: record.studio ?? '',
        publisher: record.publisher ?? '',
        description: record.description ?? '',
        rating: record.rating ? Number(record.rating.toFixed(1)) : null,
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
        primaryTrailer: trailerDetails[0],
        matchScore: 95, // Editorial baseline for MVP feed
        steam: latestSteam
          ? {
              storeUrl: latestSteam.storeUrl,
              priceCents: latestSteam.priceCents ?? null,
              discountPercent: latestSteam.discountPercent ?? null,
              currency: latestSteam.currency ?? null,
              isAvailable: latestSteam.isAvailable,
            }
          : null,
      };
    };

    return unique.slice(0, safeLimit).map(toDto);
  }
}
