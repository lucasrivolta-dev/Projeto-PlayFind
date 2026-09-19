import type { PriceGame, PriceOffer, StorePriceProvider } from './store-price.provider.js';
import { matchesBaseGame, normalized } from './price-matching.js';
import { V2PriceClient, PriceProviderError, object, type JsonRecord } from './v2-client.js';

type Store = 'PLAYSTATION' | 'NINTENDO';
export interface V2ProviderOptions {
  apiKey?: string;
  fetcher?: typeof fetch;
  now?: () => Date;
}

export function relevantPlatform(store: Store, platforms: string[]): boolean {
  const accepted =
    store === 'PLAYSTATION'
      ? ['playstation', 'playstation 4', 'playstation 5', 'ps4', 'ps5']
      : ['switch', 'switch 2', 'nintendo', 'nintendo switch', 'nintendo switch 2'];
  return platforms.some((value) => accepted.includes(normalized(value)));
}

abstract class V2PriceProvider implements StorePriceProvider {
  abstract readonly storeName: Store;
  abstract readonly providerName: string;
  private readonly client: V2PriceClient;
  private readonly apiKey: string;
  private regionsChecked = false;
  private readonly now: () => Date;

  constructor(base: string, envKey: string, options: V2ProviderOptions) {
    this.apiKey = (options.apiKey ?? process.env[envKey] ?? '').trim();
    this.client = new V2PriceClient(base, this.apiKey, options.fetcher);
    this.now = options.now ?? (() => new Date());
  }
  isConfigured() {
    return Boolean(this.apiKey);
  }

  async fetchOffers(game: PriceGame): Promise<PriceOffer[]> {
    if (!this.isConfigured() || !relevantPlatform(this.storeName, game.platforms)) return [];
    if (!this.regionsChecked) {
      const regions = await this.client.get('/regions');
      const br = Array.isArray(regions.data)
        ? regions.data.map(object).find((region) => String(region.region).toUpperCase() === 'BR')
        : undefined;
      if (!br || br.decimalPlaces !== 2 || (br.inYourPlan !== true && br.inYourPlan !== 1)) {
        throw new PriceProviderError('BR_REGION_UNAVAILABLE');
      }
      this.regionsChecked = true;
    }
    const knownId = game.productIds?.[this.storeName];
    const idField = this.storeName === 'PLAYSTATION' ? 'PSNID' : 'NSUID';
    const path = knownId
      ? `/games/by-${this.storeName === 'PLAYSTATION' ? 'psnid' : 'nsuid'}/${encodeURIComponent(knownId)}`
      : '/games/search';
    const envelope = await this.client.get(
      path,
      knownId ? { region: 'br' } : { region: 'br', q: game.title, include_dlc: '0' },
    );
    const items = knownId
      ? [object(envelope.data)]
      : Array.isArray(envelope.data)
        ? envelope.data.map(object)
        : [];
    // Refuse truncated searches; ambiguity must not depend on which result was first.
    if (!knownId && (items.length >= 200 || Number(object(envelope.meta).count) > items.length))
      return [];
    const matches = items.filter((item) => {
      if (String(item.region ?? item.Region).toUpperCase() !== 'BR') return false;
      if (knownId && item[idField] !== knownId) return false;
      if (!this.platformMatches(game, item)) return false;
      return matchesBaseGame(game, item, knownId);
    });
    // Distinct products/editions, including PS4 vs PS5 / Switch vs Switch 2, need explicit identity.
    if (matches.length !== 1) return [];
    const offer = this.mapOffer(matches[0]);
    return offer ? [offer] : [];
  }

  private platformMatches(game: PriceGame, item: JsonRecord): boolean {
    const platforms = game.platforms.map(normalized);
    if (this.storeName === 'PLAYSTATION') {
      if (platforms.includes('playstation')) return item.IsPS4 === 1 || item.IsPS5 === 1;
      return (
        (platforms.some((p) => ['ps4', 'playstation 4'].includes(p)) && item.IsPS4 === 1) ||
        (platforms.some((p) => ['ps5', 'playstation 5'].includes(p)) && item.IsPS5 === 1)
      );
    }
    // Catalog's current Switch token is a family. Explicit Switch 2 still requires IsSwitch2.
    if (platforms.some((p) => ['switch', 'nintendo', 'nintendo switch'].includes(p))) {
      return item.IsSwitch === 1 || item.IsSwitch2 === 1;
    }
    return item.IsSwitch2 === 1;
  }

  private mapOffer(item: JsonRecord): PriceOffer | null {
    const ps = this.storeName === 'PLAYSTATION';
    const id = item[ps ? 'PSNID' : 'NSUID'];
    if (typeof id !== 'string' || !(ps ? /^[A-Z0-9_-]+$/ : /^\d{14}$/).test(id)) return null;
    const rawUrl = item[ps ? 'PSStoreURL' : 'eShopURL'];
    if (typeof rawUrl !== 'string') return null;
    let url: URL;
    try {
      url = new URL(rawUrl);
    } catch {
      return null;
    }
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash)
      return null;
    if (
      ps
        ? url.host !== 'store.playstation.com' || url.pathname !== `/pt-br/product/${id}`
        : url.host !== 'ec.nintendo.com' ||
          !new RegExp(`^/BR/[a-z]{2}/titles/${id}$`, 'i').test(url.pathname)
    )
      return null;
    // BR is explicit and validated through /regions. NTPrices omits currency in game objects.
    if (item.PriceCurrency != null && item.PriceCurrency !== 'BRL') return null;
    if (![0, 1].includes(item.IsDelisted as number)) return null;
    const available = item.IsDelisted === 0;
    const integer = (v: unknown): v is number =>
      typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 && v <= 2147483647;
    if (
      available &&
      (!integer(item.BasePrice) ||
        !integer(item.SalePrice) ||
        item.SalePrice > item.BasePrice ||
        !integer(item.DiscPerc) ||
        item.DiscPerc > 100)
    )
      return null;
    return {
      store: this.storeName,
      externalProductId: id,
      edition: typeof item.EditionName === 'string' ? item.EditionName : undefined,
      storeUrl: rawUrl,
      region: 'BR',
      currency: 'BRL',
      originalPriceCents: available ? (item.BasePrice as number) : null,
      finalPriceCents: available ? (item.SalePrice as number) : null,
      discountPercent: available ? (item.DiscPerc as number) : 0,
      isAvailable: available,
      observedAt: this.now(),
      provider: this.providerName,
    };
  }
}

export class PlatPricesPriceProvider extends V2PriceProvider {
  readonly providerName = 'PLATPRICES';
  readonly storeName = 'PLAYSTATION' as const;
  constructor(options: V2ProviderOptions = {}) {
    super('https://platprices.com/api/v2', 'PLATPRICES_API_KEY', options);
  }
}
export class NintendoPriceProvider extends V2PriceProvider {
  readonly providerName = 'NTPRICES';
  readonly storeName = 'NINTENDO' as const;
  constructor(options: V2ProviderOptions = {}) {
    super('https://ntprices.com/api/v2', 'NTPRICES_API_KEY', options);
  }
}
