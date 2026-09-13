import type { Prisma, PrismaClient } from '@prisma/client';
import type { GameRepository, StoredGame } from './game.repository.js';
import { describeTrailer, type NormalizedGame, type GamePlatform } from './normalized-game.js';

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

function validExternalId(value?: number): value is number {
  return value !== undefined && Number.isSafeInteger(value) && value > 0;
}

function trailerUrls(game: NormalizedGame): string[] {
  const urls = game.trailers ?? [];
  if (urls.length > 0) return urls;
  return (game.trailerDetails ?? []).map((trailer) => trailer.url);
}

export class PrismaGameRepository implements GameRepository {
  constructor(private readonly client: PrismaDbClient) {}

  async findCandidates(game: NormalizedGame): Promise<StoredGame[]> {
    const orConditions: Prisma.GameWhereInput[] = [];

    if (validExternalId(game.igdbId)) {
      orConditions.push({ igdbId: game.igdbId });
    }
    if (validExternalId(game.steamAppId)) {
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
        isFree: record.isFree,
        releaseDate: record.releaseDate ?? undefined,
        igdbId: record.igdbId ?? undefined,
        steamAppId: record.steamAppId ?? undefined,
        genres: record.genres.map((g) => g.genre.name),
        platforms: record.platforms.map((p) => p.platform.name as GamePlatform),
        screenshots: record.media.filter((m) => m.type === 'SCREENSHOT').map((m) => m.url),
        trailers: record.media
          .filter((m) => m.type === 'TRAILER' || m.type === 'GAMEPLAY')
          .map((m) => m.url),
        trailerDetails: record.media
          .filter((m) => m.type === 'TRAILER' || m.type === 'GAMEPLAY')
          .map((m) => describeTrailer(m.url)),
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
    const igdbId = validExternalId(game.igdbId) ? game.igdbId : undefined;
    const steamAppId = validExternalId(game.steamAppId) ? game.steamAppId : undefined;

    // 1. Locate existing game if any
    const byIgdb = igdbId ? await this.client.game.findUnique({ where: { igdbId } }) : null;
    const bySteam = steamAppId
      ? await this.client.game.findUnique({ where: { steamAppId } })
      : null;
    if (byIgdb && bySteam && byIgdb.id !== bySteam.id) {
      throw new Error(
        `External IDs point to different games (IGDB ${igdbId}, Steam ${steamAppId}).`,
      );
    }
    let existing = byIgdb ?? bySteam;
    // A source record with an external ID must not silently reuse a slug-only
    // row: that could merge a remake, edition or demo that deliberately did
    // not pass the conservative metadata matcher. Slug upserts remain useful
    // for local/legacy fixtures that have no external identity.
    if (!existing && igdbId === undefined && steamAppId === undefined) {
      existing = await this.client.game.findUnique({ where: { slug: baseSlug } });
    }

    const source = igdbId !== undefined ? 'IGDB' : steamAppId !== undefined ? 'STEAM' : undefined;
    const sourceId =
      igdbId !== undefined
        ? String(igdbId)
        : steamAppId !== undefined
          ? String(steamAppId)
          : undefined;

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
          isFree: game.isFree ?? existing.isFree,
          releaseDate: game.releaseDate ?? existing.releaseDate,
          igdbId: igdbId ?? existing.igdbId,
          steamAppId: steamAppId ?? existing.steamAppId,
          source: existing.source ?? source,
          sourceId: existing.sourceId ?? sourceId,
          lastSyncedAt: new Date(),
        },
      });
    } else {
      let finalSlug = baseSlug;
      const slugClash = await this.client.game.findUnique({ where: { slug: finalSlug } });
      if (slugClash) {
        finalSlug = `${baseSlug}-${igdbId ?? steamAppId ?? Date.now()}`;
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
          isFree: game.isFree,
          releaseDate: game.releaseDate,
          igdbId,
          steamAppId,
          source,
          sourceId,
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
    const media = [
      ...(game.screenshots ?? []).map((url) => ({ type: 'SCREENSHOT' as const, url })),
      ...trailerUrls(game).map((url) => ({ type: 'TRAILER' as const, url })),
    ];
    for (let i = 0; i < media.length; i++) {
      const { type, url } = media[i];
      if (!url?.trim()) continue;
      const mediaExists = await this.client.gameMedia.findFirst({
        where: { gameId, url },
      });
      if (!mediaExists) {
        await this.client.gameMedia.create({
          data: {
            gameId,
            type,
            url,
            sortOrder: i,
          },
        });
      }
    }

    // 5. Record steam offer if present
    if (game.steam) {
      const offer = {
        gameId,
        storeUrl: game.steam.storeUrl,
        priceCents: game.steam.priceCents ?? null,
        discountPercent: game.steam.discountPercent ?? null,
        currency: game.steam.currency ?? null,
        isAvailable: game.steam.isAvailable,
      };
      const offerExists = await this.client.steamOffer.findFirst({ where: offer });
      if (!offerExists) await this.client.steamOffer.create({ data: offer });
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
