import type { Prisma, LibraryStatus } from '@prisma/client';
import type { PrismaDbClient } from '../games/prisma-game.repository.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface LibraryFilters {
  status?: LibraryStatus;
  favorite?: boolean;
  rated?: boolean;
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

  async ensureUser(userIdentifier: string): Promise<string> {
    const trimmed = userIdentifier.trim();
    if (UUID_REGEX.test(trimmed)) {
      const user = await this.prisma.user.findUnique({
        where: { id: trimmed },
        select: { id: true },
      });
      if (user) return user.id;
    }

    const byFirebase = await this.prisma.user.findUnique({
      where: { firebaseUid: trimmed },
      select: { id: true },
    });
    if (byFirebase) return byFirebase.id;

    const byUsername = await this.prisma.user.findUnique({
      where: { username: trimmed },
      select: { id: true },
    });
    if (byUsername) return byUsername.id;

    // Criar usuário para o token/identificador caso não exista
    const cleanUsername =
      trimmed
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, '_')
        .slice(0, 30) || 'user';
    const uniqueUsername = `${cleanUsername}_${Date.now().toString().slice(-4)}`;

    const created = await this.prisma.user.create({
      data: {
        firebaseUid: trimmed,
        username: uniqueUsername,
        name: trimmed,
      },
      select: { id: true },
    });

    return created.id;
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
          rating: entry.game.rating,
          steamAppId: entry.game.steamAppId,
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

  async setGameStatus(userId: string, gameIdOrSlug: string, status: LibraryStatus) {
    const gameId = await this.resolveGameId(gameIdOrSlug);
    if (!gameId) throw new Error('GAME_NOT_FOUND');

    return this.prisma.userGameLibrary.upsert({
      where: { userId_gameId: { userId, gameId } },
      create: {
        userId,
        gameId,
        status,
      },
      update: {
        status,
        // Caso mude para WANT_TO_PLAY, a nota deve ser limpa para não violar a constraint library_rating_range
        ...(status === 'WANT_TO_PLAY' ? { rating: null } : {}),
      },
    });
  }

  async removeFromLibrary(userId: string, gameIdOrSlug: string) {
    const gameId = await this.resolveGameId(gameIdOrSlug);
    if (!gameId) throw new Error('GAME_NOT_FOUND');

    await this.prisma.userGameLibrary.deleteMany({
      where: { userId, gameId },
    });
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

    return this.prisma.userGameLibrary.upsert({
      where: { userId_gameId: { userId, gameId } },
      create: {
        userId,
        gameId,
        status: 'WANT_TO_PLAY',
        isFavorite: targetFavorite,
      },
      update: {
        isFavorite: targetFavorite,
      },
    });
  }

  async rateGame(userId: string, gameIdOrSlug: string, rating: number, reviewText?: string) {
    if (rating < 1 || rating > 5) {
      throw new Error('INVALID_RATING');
    }

    const gameId = await this.resolveGameId(gameIdOrSlug);
    if (!gameId) throw new Error('GAME_NOT_FOUND');

    // Ao atribuir nota, o status passa obrigatoriamente para PLAYED (conforme constraint SQL)
    return this.prisma.userGameLibrary.upsert({
      where: { userId_gameId: { userId, gameId } },
      create: {
        userId,
        gameId,
        status: 'PLAYED',
        rating,
        reviewText,
        reviewUpdatedAt: new Date(),
      },
      update: {
        status: 'PLAYED',
        rating,
        reviewText: reviewText !== undefined ? reviewText : undefined,
        reviewUpdatedAt: new Date(),
      },
    });
  }

  async removeRating(userId: string, gameIdOrSlug: string) {
    const gameId = await this.resolveGameId(gameIdOrSlug);
    if (!gameId) throw new Error('GAME_NOT_FOUND');

    return this.prisma.userGameLibrary.update({
      where: { userId_gameId: { userId, gameId } },
      data: {
        rating: null,
        reviewText: null,
        reviewUpdatedAt: null,
      },
    });
  }

  async toggleGameLike(userId: string, gameIdOrSlug: string) {
    const gameId = await this.resolveGameId(gameIdOrSlug);
    if (!gameId) throw new Error('GAME_NOT_FOUND');

    const existing = await this.prisma.gameLike.findUnique({
      where: { userId_gameId: { userId, gameId } },
    });

    if (existing) {
      await this.prisma.gameLike.delete({
        where: { userId_gameId: { userId, gameId } },
      });
      return { liked: false };
    } else {
      await this.prisma.gameLike.create({
        data: { userId, gameId },
      });
      return { liked: true };
    }
  }
}
