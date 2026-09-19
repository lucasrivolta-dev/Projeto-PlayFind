import type { StoreName } from '@prisma/client';

export interface PriceGame {
  id: string;
  title: string;
  slug: string;
  publisher?: string | null;
  releaseDate?: Date | null;
  edition?: string;
  steamAppId?: number | null;
  igdbId?: number | null;
  platforms: string[];
  // Store IDs are not provider-specific PPIDs and can be reused by future providers.
  productIds?: Partial<Record<StoreName, string>>;
}

export interface PriceOffer {
  store: StoreName;
  externalProductId?: string;
  edition?: string;
  storeUrl: string;
  region: string;
  currency: string;
  originalPriceCents?: number | null;
  finalPriceCents?: number | null;
  discountPercent?: number | null;
  isAvailable: boolean;
  observedAt?: Date;
  provider: string;
}

export interface StorePriceProvider {
  readonly providerName: string;
  readonly storeName: StoreName;
  isConfigured(): boolean;
  fetchOffers(game: PriceGame): Promise<PriceOffer[]>;
}

export class SteamPriceProvider implements StorePriceProvider {
  readonly providerName = 'STEAM_OFFICIAL';
  readonly storeName: StoreName = 'STEAM';

  isConfigured(): boolean {
    return true;
  }

  async fetchOffers(game: {
    id: string;
    title: string;
    slug: string;
    steamAppId?: number | null;
  }): Promise<PriceOffer[]> {
    if (!game.steamAppId) return [];
    return [
      {
        store: 'STEAM',
        externalProductId: String(game.steamAppId),
        storeUrl: `https://store.steampowered.com/app/${game.steamAppId}/`,
        region: 'BR',
        currency: 'BRL',
        isAvailable: true,
        provider: this.providerName,
      },
    ];
  }
}

export { PlatPricesPriceProvider, NintendoPriceProvider } from './v2-price.provider.js';

// PSPrices B2B is the intended Xbox adapter. No undocumented endpoints or fake offers.
// PSPRICES_API_KEY alone does not activate a client that has not been implemented.
export class XboxPriceProvider implements StorePriceProvider {
  readonly providerName = 'PSPRICES_B2B';
  readonly storeName: StoreName = 'XBOX';
  isConfigured(): boolean {
    return false;
  }
  async fetchOffers(): Promise<PriceOffer[]> {
    return [];
  }
}
