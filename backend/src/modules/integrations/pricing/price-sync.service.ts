import type { PrismaClient } from '@prisma/client';
import type { PriceGame, PriceOffer, StorePriceProvider } from './store-price.provider.js';
import { relevantPlatform } from './v2-price.provider.js';
import { PriceProviderError } from './v2-client.js';

export class PriceSyncService {
  constructor(private readonly db: PrismaClient) {}

  async run(
    provider: StorePriceProvider,
    options: {
      limit: number;
      gameId?: string;
      productId?: string;
      dryRun?: boolean;
    },
  ) {
    const result = {
      provider: provider.providerName,
      status: 'READY',
      checked: 0,
      matched: 0,
      created: 0,
      refreshed: 0,
      skipped: 0,
    };
    if (!provider.isConfigured()) return { ...result, status: 'MISSING_API_KEY' };
    if (provider.storeName !== 'PLAYSTATION' && provider.storeName !== 'NINTENDO') {
      return { ...result, status: 'NO_ACTIVE_PROVIDER' };
    }
    let cursor: string | undefined;
    while (result.checked < options.limit) {
      const records = await this.db.game.findMany({
        where: options.gameId ? { id: options.gameId } : {},
        take: 100,
        orderBy: { id: 'asc' },
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        include: {
          platforms: { include: { platform: true } },
          storeOffers: {
            where: { store: provider.storeName, provider: provider.providerName, region: 'BR' },
            orderBy: { observedAt: 'desc' },
            take: 1,
          },
        },
      });
      if (!records.length) break;
      for (const record of records) {
        const platforms = record.platforms.map((p) => p.platform.name);
        if (!relevantPlatform(provider.storeName, platforms)) continue;
        result.checked++;
        const productId =
          options.productId ?? record.storeOffers[0]?.externalProductId ?? undefined;
        const game: PriceGame = {
          ...record,
          platforms,
          productIds: productId ? { [provider.storeName]: productId } : undefined,
        };
        try {
          const offers = await provider.fetchOffers(game);
          if (!offers.length) result.skipped++;
          for (const offer of offers) {
            result.matched++;
            if (!options.dryRun) result[await this.persist(record.id, offer)]++;
          }
        } catch (error) {
          // Abort this provider on errors, including 429; do not hammer API or change snapshots.
          // No raw error text can leak a key, response body or connection string.
          return {
            ...result,
            status: error instanceof PriceProviderError ? error.code : 'SYNC_FAILED',
            retryAfter: error instanceof PriceProviderError ? error.retryAfter : undefined,
          };
        }
        if (result.checked >= options.limit) break;
      }
      if (options.gameId || records.length < 100) break;
      cursor = records.at(-1)!.id;
    }
    return { ...result, status: options.dryRun ? 'DRY_RUN' : 'COMPLETED' };
  }

  async persist(gameId: string, offer: PriceOffer): Promise<'created' | 'refreshed' | 'skipped'> {
    if (
      !offer.externalProductId ||
      !offer.observedAt ||
      offer.region !== 'BR' ||
      offer.currency !== 'BRL' ||
      (offer.isAvailable && offer.finalPriceCents == null)
    ) {
      throw new PriceProviderError('INVALID_OFFER');
    }
    return this.db.$transaction(async (tx) => {
      // Serialize concurrent syncs for this game/store without a migration or duplicates.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`${gameId}:${offer.store}:${offer.region}`}))::text`;
      const previous = await tx.storeOffer.findFirst({
        where: { gameId, store: offer.store, region: offer.region },
        orderBy: [{ observedAt: 'desc' }, { id: 'desc' }],
      });
      // A slow concurrent request must not overwrite a more recent observation.
      if (previous && previous.observedAt > offer.observedAt!) return 'skipped';
      const data = {
        ...offer,
        gameId,
        edition: offer.edition ?? null,
        originalPriceCents: offer.originalPriceCents ?? null,
        finalPriceCents: offer.finalPriceCents ?? null,
        discountPercent: offer.discountPercent ?? null,
      };
      const unchanged =
        previous &&
        Object.entries(data)
          .filter(([key]) => key !== 'observedAt')
          .every(([key, value]) => previous[key as keyof typeof previous] === value);
      if (unchanged) {
        await tx.storeOffer.update({
          where: { id: previous.id },
          data: { observedAt: offer.observedAt },
        });
        return 'refreshed';
      }
      await tx.storeOffer.create({ data });
      return 'created';
    });
  }
}
