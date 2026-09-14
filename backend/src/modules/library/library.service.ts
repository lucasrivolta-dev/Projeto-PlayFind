import { Prisma, type LibraryStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type { PrismaDbClient } from '../games/prisma-game.repository.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface LibraryFilters {
  status?: LibraryStatus;
  favorite?: boolean;
  rated?: boolean;
  liked?: boolean;
}

export interface InteractionPatch {
  liked?: boolean;
  isFavorite?: boolean;
  status?: LibraryStatus | null;
  rating?: number | null;
  reviewText?: string | null;
}

type Interaction = {
  gameId: string;
  status: LibraryStatus | null;
  liked: boolean;
  isFavorite: boolean;
  rating: number | null;
  reviewText: string | null;
};

function toInteraction(entry: Interaction | null, gameId: string): Interaction {
  return (
    entry ?? {
      gameId,
      status: null,
      liked: false,
      isFavorite: false,
      rating: null,
      reviewText: null,
    }
  );
}

function hasInteraction(entry: Interaction): boolean {
  return (
    entry.status !== null ||
    entry.liked ||
    entry.isFavorite ||
    entry.rating !== null ||
    entry.reviewText !== null
  );
}

export class LibraryService {
  constructor(private readonly prisma: PrismaDbClient) {}

  async resolveGameId(idOrSlug: string): Promise<string | null> {
    const trimmed = idOrSlug.trim();
    if (UUID_REGEX.test(trimmed)) {
      const game = await this.prisma.game.findUnique({
        where: { id: trimmed },
        select: { id: true },
      });
      if (game) return game.id;
    }
    if (/^\d+$/.test(trimmed)) {
      const num = Number(trimmed);
      const bySteam = await this.prisma.game.findUnique({
        where: { steamAppId: num },
        select: { id: true },
      });
      if (bySteam) return bySteam.id;

      const byIgdb = await this.prisma.game.findUnique({
        where: { igdbId: num },
        select: { id: true },
      });
      if (byIgdb) return byIgdb.id;
    }

    const bySlug = await this.prisma.game.findUnique({
      where: { slug: trimmed },
      select: { id: true },
    });
    return bySlug?.id ?? null;
  }

  private async resolveCanonicalGameId(gameId: string): Promise<string | null> {
    if (!UUID_REGEX.test(gameId)) return null;
    const game = await this.prisma.game.findUnique({
      where: { id: gameId },
      select: { id: true },
    });
    return game?.id ?? null;
  }

  async ensureUser(firebaseUid: string): Promise<string> {
    if (!firebaseUid) throw new Error('INVALID_FIREBASE_UID');

    // O UID chega de um ID Token já validado pela rota; nunca o resolver por
    // User.id ou username, mesmo quando seu formato coincidir com eles.
    const cleanUsername =
      firebaseUid
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, '_')
        .slice(0, 30) || 'user';
    const uniqueUsername = `${cleanUsername}_${randomUUID().slice(0, 12)}`;

    try {
      const user = await this.prisma.user.upsert({
        where: { firebaseUid },
        update: {},
        create: {
          firebaseUid,
          username: uniqueUsername,
          name: firebaseUid,
        },
        select: { id: true },
      });
      return user.id;
    } catch (error) {
      // Algumas versões/estratégias de upsert podem disputar o primeiro insert.
      // A constraint única em firebaseUid define o vencedor; só reutilizamos
      // uma linha com o mesmo UID validado.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const user = await this.prisma.user.findUnique({
          where: { firebaseUid },
          select: { id: true },
        });
        if (user) return user.id;
      }
      throw error;
    }
  }

  async getUserLibrary(userId: string, filters: LibraryFilters = {}) {
    const where: Prisma.UserGameLibraryWhereInput = {
      userId,
    };

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.favorite !== undefined) {
      where.isFavorite = filters.favorite;
    }

    if (filters.rated === true) {
      where.rating = { not: null };
    }
    if (filters.liked === true) where.liked = true;
    // A nullable status permits like-only/favorite-only games, but never empty rows.
    where.OR = [
      { status: { not: null } },
      { liked: true },
      { isFavorite: true },
      { rating: { not: null } },
      { reviewText: { not: null } },
    ];

    const records = await this.prisma.userGameLibrary.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      include: {
        game: {
          include: {
            genres: { include: { genre: true } },
            platforms: { include: { platform: true } },
            steamOffers: { orderBy: { capturedAt: 'desc' }, take: 1 },
          },
        },
      },
    });

    return records.map((entry) => {
      const latestSteam = entry.game.steamOffers[0];
      return {
        gameId: entry.gameId,
        status: entry.status,
        liked: entry.liked,
        isFavorite: entry.isFavorite,
        rating: entry.rating,
        reviewText: entry.reviewText,
        updatedAt: entry.updatedAt,
        game: {
          id: entry.game.id,
          slug: entry.game.slug,
          title: entry.game.title,
          coverUrl: entry.game.coverUrl,
          heroUrl: entry.game.heroUrl,
          studio: entry.game.studio,
          description: entry.game.description,
          publisher: entry.game.publisher,
          releaseDate: entry.game.releaseDate,
          mode: entry.game.mode,
          isFree: entry.game.isFree,
          rating: entry.game.rating,
          steamAppId: entry.game.steamAppId,
          igdbId: entry.game.igdbId,
          genres: entry.game.genres.map((g) => g.genre.name),
          platforms: entry.game.platforms.map((p) => p.platform.name),
          steam: latestSteam
            ? {
                storeUrl: latestSteam.storeUrl,
                priceCents: latestSteam.priceCents,
                discountPercent: latestSteam.discountPercent,
              }
            : null,
        },
      };
    });
  }

  async getUserLikedGames(userId: string) {
    const records = await this.prisma.userGameLibrary.findMany({
      where: { userId, liked: true },
      select: {
        gameId: true,
        game: { select: { steamAppId: true, igdbId: true } },
      },
    });

    return records.map(({ gameId, game }) => ({
      gameId,
      steamAppId: game.steamAppId,
      igdbId: game.igdbId,
    }));
  }

  async getInteraction(userId: string, canonicalGameId: string) {
    const gameId = await this.resolveCanonicalGameId(canonicalGameId);
    if (!gameId) throw new Error('GAME_NOT_FOUND');
    const entry = await this.prisma.userGameLibrary.findUnique({
      where: { userId_gameId: { userId, gameId } },
    });
    return toInteraction(entry, gameId);
  }

  async updateInteraction(userId: string, canonicalGameId: string, patch: InteractionPatch) {
    const gameId = await this.resolveCanonicalGameId(canonicalGameId);
    if (!gameId) throw new Error('GAME_NOT_FOUND');
    const key = { userId_gameId: { userId, gameId } };
    const existing = await this.prisma.userGameLibrary.findUnique({ where: key });
    if (
      patch.rating != null &&
      (!Number.isInteger(patch.rating) ||
        patch.rating < 1 ||
        patch.rating > 5 ||
        (patch.status !== undefined && patch.status !== 'PLAYED'))
    ) {
      throw new Error('INVALID_INTERACTION');
    }
    const target: Interaction = {
      gameId,
      status: patch.status !== undefined ? patch.status : (existing?.status ?? null),
      liked: patch.liked ?? existing?.liked ?? false,
      isFavorite: patch.isFavorite ?? existing?.isFavorite ?? false,
      rating: patch.rating !== undefined ? patch.rating : (existing?.rating ?? null),
      reviewText:
        patch.reviewText !== undefined ? patch.reviewText : (existing?.reviewText ?? null),
    };
    if (patch.rating != null) target.status = 'PLAYED';
    if (patch.reviewText != null && target.status !== 'PLAYED')
      throw new Error('INVALID_INTERACTION');
    if (target.status === 'WANT_TO_PLAY' || target.status === null) {
      target.rating = null;
      target.reviewText = null;
    }
    if (!hasInteraction(target) && !existing) {
      return toInteraction(null, gameId);
    }
    const create = {
      userId,
      gameId,
      status: target.status,
      liked: target.liked,
      isFavorite: target.isFavorite,
      rating: target.rating,
      reviewText: target.reviewText,
      reviewUpdatedAt:
        patch.reviewText !== undefined || patch.rating !== undefined ? new Date() : null,
    };
    // Only write fields present in the patch. Independent rapid actions must not
    // overwrite each other with values from a stale read.
    const update = {
      ...(patch.liked !== undefined ? { liked: patch.liked } : {}),
      ...(patch.isFavorite !== undefined ? { isFavorite: patch.isFavorite } : {}),
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(patch.rating !== undefined ? { rating: patch.rating } : {}),
      ...(patch.reviewText !== undefined ? { reviewText: patch.reviewText } : {}),
      ...(patch.status === 'WANT_TO_PLAY' || patch.status === null
        ? { rating: null, reviewText: null, reviewUpdatedAt: null }
        : {}),
      ...(patch.rating != null ? { status: 'PLAYED' as const, reviewUpdatedAt: new Date() } : {}),
      ...(patch.reviewText !== undefined && target.status === 'PLAYED'
        ? { reviewUpdatedAt: new Date() }
        : {}),
      ...(patch.rating === null && patch.reviewText === null ? { reviewUpdatedAt: null } : {}),
    };
    const result = await this.prisma.userGameLibrary.upsert({
      where: key,
      create,
      update,
    });
    if (!hasInteraction(result)) {
      await this.prisma.userGameLibrary.deleteMany({
        where: {
          userId,
          gameId,
          status: null,
          liked: false,
          isFavorite: false,
          rating: null,
          reviewText: null,
        },
      });
    }
    return toInteraction(result, gameId);
  }

  async setGameStatus(userId: string, gameIdOrSlug: string, status: LibraryStatus) {
    const gameId = await this.resolveGameId(gameIdOrSlug);
    if (!gameId) throw new Error('GAME_NOT_FOUND');

    return this.updateInteraction(userId, gameId, { status });
  }

  async removeFromLibrary(userId: string, gameIdOrSlug: string) {
    const gameId = await this.resolveGameId(gameIdOrSlug);
    if (!gameId) throw new Error('GAME_NOT_FOUND');

    // Removing from Library clears membership, not independent likes/favorites.
    await this.updateInteraction(userId, gameId, { status: null, rating: null, reviewText: null });
    return { success: true };
  }

  async toggleFavorite(userId: string, gameIdOrSlug: string, isFavorite?: boolean) {
    const gameId = await this.resolveGameId(gameIdOrSlug);
    if (!gameId) throw new Error('GAME_NOT_FOUND');

    const existing = await this.prisma.userGameLibrary.findUnique({
      where: { userId_gameId: { userId, gameId } },
    });

    const targetFavorite =
      isFavorite !== undefined ? isFavorite : existing ? !existing.isFavorite : true;

    return this.updateInteraction(userId, gameId, { isFavorite: targetFavorite });
  }

  async rateGame(userId: string, gameIdOrSlug: string, rating: number, reviewText?: string) {
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      throw new Error('INVALID_RATING');
    }

    const gameId = await this.resolveGameId(gameIdOrSlug);
    if (!gameId) throw new Error('GAME_NOT_FOUND');

    // Ao atribuir nota, o status passa obrigatoriamente para PLAYED (conforme constraint SQL)
    return this.updateInteraction(userId, gameId, {
      rating,
      ...(reviewText !== undefined ? { reviewText } : {}),
    });
  }

  async removeRating(userId: string, gameIdOrSlug: string) {
    const gameId = await this.resolveGameId(gameIdOrSlug);
    if (!gameId) throw new Error('GAME_NOT_FOUND');

    return this.updateInteraction(userId, gameId, { rating: null, reviewText: null });
  }

  async toggleGameLike(userId: string, gameIdOrSlug: string) {
    const gameId = await this.resolveGameId(gameIdOrSlug);
    if (!gameId) throw new Error('GAME_NOT_FOUND');

    // One atomic statement makes simultaneous legacy toggle requests alternate
    // the same row instead of racing on findUnique/create.
    const rows = await this.prisma.$queryRaw<Array<{ liked: boolean }>>`
      INSERT INTO "UserGameLibrary" ("userId", "gameId", "status", "liked", "createdAt", "updatedAt")
      VALUES (${userId}::uuid, ${gameId}::uuid, NULL, true, NOW(), NOW())
      ON CONFLICT ("userId", "gameId") DO UPDATE
      SET "liked" = NOT "UserGameLibrary"."liked", "updatedAt" = NOW()
      RETURNING "liked"
    `;
    const liked = rows[0]?.liked ?? false;
    if (!liked)
      await this.prisma.userGameLibrary.deleteMany({
        where: {
          userId,
          gameId,
          status: null,
          liked: false,
          isFavorite: false,
          rating: null,
          reviewText: null,
        },
      });
    return { liked };
  }
}
