import type { Prisma, PrismaClient, MediaProvider } from '@prisma/client';
import type { GameRepository, StoredGame } from './game.repository.js';
import {
  describeTrailer,
  type NormalizedGame,
  type GamePlatform,
  type IncomingTrailerMetadata,
} from './normalized-game.js';

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

/**
 * Validates that an IncomingTrailerMetadata entry is safe to persist as DIRECT.
 * Throws if provider=DIRECT but authorizationRef is missing/empty, or URL not HTTPS.
 */
function validateIncomingTrailer(trailer: IncomingTrailerMetadata): void {
  if (trailer.provider === 'DIRECT') {
    if (!trailer.authorizationRef?.trim()) {
      throw new Error(
        `DIRECT trailer requires a non-empty authorizationRef (url: ${trailer.url})`,
      );
    }
    if (!/^https:/i.test(trailer.url)) {
      throw new Error(`DIRECT trailer URL must use HTTPS (url: ${trailer.url})`);
    }
  }
}

function trailerUrls(game: NormalizedGame): string[] {
  // Prefer incomingTrailerDetails if present
  if (game.incomingTrailerDetails && game.incomingTrailerDetails.length > 0) {
    return game.incomingTrailerDetails.map((t) => t.url);
  }
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
          .map((m) => {
            // Use persisted provider when available; fall back to describeTrailer for legacy rows.
            // authorizationRef is NEVER included in the public NormalizedTrailer.
            if (m.provider != null) {
              const described = describeTrailer(m.url);
              return {
                provider: m.provider as unknown as import('./normalized-game.js').TrailerProvider,
                url: m.url,
                ...(described.videoId ? { videoId: described.videoId } : {}),
                ...(m.mimeType ? { mimeType: m.mimeType } : {}),
                ...(m.origin ? { origin: m.origin } : {}),
              };
            }
            return describeTrailer(m.url);
          }),
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

    // 4. Synchronize screenshots and trailers with structured metadata
    //
    // incomingTrailerDetails takes precedence over legacy trailers/trailerDetails arrays.
    // DIRECT provider requires explicit authorizationRef (validated before any DB write).
    // authorizationRef is stored in the DB but NEVER returned to public callers.

    const screenshotItems = (game.screenshots ?? []).map((url, idx) => ({
      type: 'SCREENSHOT' as const,
      url,
      sortOrder: idx,
      provider: undefined as MediaProvider | undefined,
      mimeType: undefined as string | undefined,
      origin: undefined as string | undefined,
      authorizationRef: undefined as string | undefined,
    }));

    // Build structured trailer items
    const trailerItems: {
      type: 'TRAILER';
      url: string;
      sortOrder: number;
      provider: MediaProvider | undefined;
      mimeType: string | undefined;
      origin: string | undefined;
      authorizationRef: string | undefined;
    }[] = [];

    if (game.incomingTrailerDetails && game.incomingTrailerDetails.length > 0) {
      // Validate all DIRECT entries before any DB write
      for (const trailer of game.incomingTrailerDetails) {
        validateIncomingTrailer(trailer);
      }
      for (let i = 0; i < game.incomingTrailerDetails.length; i++) {
        const t = game.incomingTrailerDetails[i];
        trailerItems.push({
          type: 'TRAILER',
          url: t.url,
          sortOrder: screenshotItems.length + i,
          provider: t.provider as MediaProvider,
          mimeType: t.mimeType,
          origin: t.origin,
          authorizationRef: t.authorizationRef,
        });
      }
    } else {
      // Legacy path: plain URL list, no structured metadata
      const urls = trailerUrls(game);
      for (let i = 0; i < urls.length; i++) {
        trailerItems.push({
          type: 'TRAILER',
          url: urls[i],
          sortOrder: screenshotItems.length + i,
          provider: undefined,
          mimeType: undefined,
          origin: undefined,
          authorizationRef: undefined,
        });
      }
    }

    const allMedia = [...screenshotItems, ...trailerItems];
    for (const item of allMedia) {
      if (!item.url?.trim()) continue;
      const existing = await this.client.gameMedia.findFirst({
        where: { gameId, url: item.url },
      });
      if (!existing) {
        await this.client.gameMedia.create({
          data: {
            gameId,
            type: item.type,
            url: item.url,
            sortOrder: item.sortOrder,
            ...(item.provider !== undefined ? { provider: item.provider } : {}),
            ...(item.mimeType !== undefined ? { mimeType: item.mimeType } : {}),
            ...(item.origin !== undefined ? { origin: item.origin } : {}),
            ...(item.authorizationRef !== undefined
              ? { authorizationRef: item.authorizationRef }
              : {}),
          },
        });
      } else if (
        item.provider !== undefined &&
        // Update structured metadata if we now have it and didn't before,
        // but never downgrade an existing DIRECT entry to another provider.
        !(existing.provider === 'DIRECT' && item.provider !== 'DIRECT')
      ) {
        await this.client.gameMedia.update({
          where: { id: existing.id },
          data: {
            provider: item.provider,
            ...(item.mimeType !== undefined ? { mimeType: item.mimeType } : {}),
            ...(item.origin !== undefined ? { origin: item.origin } : {}),
            ...(item.authorizationRef !== undefined
              ? { authorizationRef: item.authorizationRef }
              : {}),
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
