import type { Prisma, PrismaClient } from '@prisma/client';
import type { GameRepository, StoredGame } from './game.repository.js';
import type { NormalizedGame, GamePlatform } from './normalized-game.js';

export type PrismaDbClient = PrismaClient | Prisma.TransactionClient;

export function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'game'
  );
}

export class PrismaGameRepository implements GameRepository {
  constructor(private readonly client: PrismaDbClient) {}

  async findCandidates(game: NormalizedGame): Promise<StoredGame[]> {
    const orConditions: Prisma.GameWhereInput[] = [];

    if (game.igdbId) {
      orConditions.push({ igdbId: game.igdbId });
    }
    if (game.steamAppId) {
      orConditions.push({ steamAppId: game.steamAppId });
    }

    const slug = game.slug || slugify(game.title);
    orConditions.push({ slug });
    orConditions.push({ title: { equals: game.title, mode: 'insensitive' } });

    const records = await this.client.game.findMany({
      where: { OR: orConditions },
      include: {
        genres: { include: { genre: true } },
        platforms: { include: { platform: true } },
        media: { orderBy: { sortOrder: 'asc' } },
        steamOffers: { orderBy: { capturedAt: 'desc' }, take: 1 },
      },
      take: 10,
    });

    return records.map((record) => {
      const latestSteam = record.steamOffers[0];
      return {
        id: record.id,
        title: record.title,
        slug: record.slug,
        description: record.description ?? undefined,
        developer: record.studio ?? undefined,
        publisher: record.publisher ?? undefined,
        coverUrl: record.coverUrl ?? undefined,
        heroUrl: record.heroUrl ?? undefined,
        rating: record.rating ?? undefined,
        releaseDate: record.releaseDate ?? undefined,
        igdbId: record.igdbId ?? undefined,
        steamAppId: record.steamAppId ?? undefined,
        genres: record.genres.map((g) => g.genre.name),
        platforms: record.platforms.map((p) => p.platform.name as GamePlatform),
        screenshots: record.media.filter((m) => m.type === 'SCREENSHOT').map((m) => m.url),
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
  }

  async upsertByExternalId(game: NormalizedGame): Promise<NormalizedGame> {
    const baseSlug = game.slug || slugify(game.title);

    // 1. Locate existing game if any
    let existing = null;
    if (game.igdbId) {
      existing = await this.client.game.findUnique({ where: { igdbId: game.igdbId } });
    }
    if (!existing && game.steamAppId) {
      existing = await this.client.game.findUnique({ where: { steamAppId: game.steamAppId } });
    }
    if (!existing) {
      existing = await this.client.game.findUnique({ where: { slug: baseSlug } });
    }

    let gameId: string;

    if (existing) {
      gameId = existing.id;
      await this.client.game.update({
        where: { id: gameId },
        data: {
          title: game.title,
          description: game.description ?? existing.description,
          studio: game.developer ?? existing.studio,
          publisher: game.publisher ?? existing.publisher,
          coverUrl: game.coverUrl ?? existing.coverUrl,
          heroUrl: game.heroUrl ?? existing.heroUrl,
          rating: game.rating ?? existing.rating,
          releaseDate: game.releaseDate ?? existing.releaseDate,
          igdbId: game.igdbId ?? existing.igdbId,
          steamAppId: game.steamAppId ?? existing.steamAppId,
          lastSyncedAt: new Date(),
        },
      });
    } else {
      let finalSlug = baseSlug;
      const slugClash = await this.client.game.findUnique({ where: { slug: finalSlug } });
      if (slugClash) {
        finalSlug = `${baseSlug}-${game.igdbId ?? game.steamAppId ?? Date.now()}`;
      }

      const created = await this.client.game.create({
        data: {
          title: game.title,
          slug: finalSlug,
          description: game.description,
          studio: game.developer,
          publisher: game.publisher,
          coverUrl: game.coverUrl,
          heroUrl: game.heroUrl,
          rating: game.rating,
          releaseDate: game.releaseDate,
          igdbId: game.igdbId,
          steamAppId: game.steamAppId,
          lastSyncedAt: new Date(),
        },
      });
      gameId = created.id;
    }

    // 2. Synchronize genres
    for (const genreName of game.genres) {
      const gSlug = slugify(genreName);
      const genre = await this.client.genre.upsert({
        where: { slug: gSlug },
        update: { name: genreName },
        create: { name: genreName, slug: gSlug },
      });
      await this.client.gameGenre.upsert({
        where: { gameId_genreId: { gameId, genreId: genre.id } },
        update: {},
        create: { gameId, genreId: genre.id },
      });
    }

    // 3. Synchronize platforms
    for (const platformName of game.platforms) {
      const pSlug = slugify(platformName);
      const platform = await this.client.platform.upsert({
        where: { slug: pSlug },
        update: { name: platformName },
        create: { name: platformName, slug: pSlug },
      });
      await this.client.gamePlatform.upsert({
        where: { gameId_platformId: { gameId, platformId: platform.id } },
        update: {},
        create: { gameId, platformId: platform.id },
      });
    }

    // 4. Synchronize screenshots
    if (game.screenshots?.length) {
      for (let i = 0; i < game.screenshots.length; i++) {
        const url = game.screenshots[i];
        const mediaExists = await this.client.gameMedia.findFirst({
          where: { gameId, url },
        });
        if (!mediaExists) {
          await this.client.gameMedia.create({
            data: {
              gameId,
              type: 'SCREENSHOT',
              url,
              sortOrder: i,
            },
          });
        }
      }
    }

    // 5. Record steam offer if present
    if (game.steam) {
      await this.client.steamOffer.create({
        data: {
          gameId,
          storeUrl: game.steam.storeUrl,
          priceCents: game.steam.priceCents,
          discountPercent: game.steam.discountPercent,
          currency: game.steam.currency,
          isAvailable: game.steam.isAvailable,
        },
      });
    }

    return game;
  }

  async linkExternalIds(
    gameId: string,
    ids: {
      igdbId?: number;
      steamAppId?: number;
    },
  ): Promise<void> {
    await this.client.game.update({
      where: { id: gameId },
      data: {
        ...(ids.igdbId !== undefined ? { igdbId: ids.igdbId } : {}),
        ...(ids.steamAppId !== undefined ? { steamAppId: ids.steamAppId } : {}),
        lastSyncedAt: new Date(),
      },
    });
  }

  async markSynced(gameId: string): Promise<void> {
    await this.client.game.update({
      where: { id: gameId },
      data: { lastSyncedAt: new Date() },
    });
  }
}
