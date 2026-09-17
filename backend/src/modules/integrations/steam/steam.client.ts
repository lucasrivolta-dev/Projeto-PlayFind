import type { SteamAppDetailsDto } from './steam.types.js';
import { isEligibleForCatalog } from '../../games/game-eligibility.js';

export class SteamClient {
  private appIndex: Map<string, number[]> | null = null;
  private appIndexPromise: Promise<Map<string, number[]> | null> | null = null;
  private appListFailed = false;

  constructor(
    private readonly apiKey = '',
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async details(appId: number): Promise<SteamAppDetailsDto | undefined> {
    if (!Number.isSafeInteger(appId) || appId <= 0) return undefined;
    const response = await this.fetcher(
      `https://store.steampowered.com/api/appdetails?appids=${appId}&cc=br&l=english`,
    );
    if (response.status === 404) return undefined;
    if (!response.ok) throw new Error(`Steam request failed (${response.status})`);
    const body = (await response.json()) as Record<string, SteamAppDetailsDto>;
    const details = body[String(appId)];
    return details?.success === true ? details : undefined;
  }

  private async fetchAndIndexAppList(): Promise<Map<string, number[]>> {
    const allApps: Array<{ appid: number; name: string }> = [];
    let lastAppId: number | undefined;
    let hasMore = true;
    let pageCount = 0;
    const maxPages = 20;

    while (hasMore && pageCount < maxPages) {
      pageCount++;
      const url = new URL('https://api.steampowered.com/IStoreService/GetAppList/v1/');
      url.searchParams.set('key', this.apiKey);
      url.searchParams.set('include_games', 'true');
      url.searchParams.set('max_results', '50000');
      if (lastAppId !== undefined) {
        url.searchParams.set('last_appid', String(lastAppId));
      }

      const response = await this.fetcher(url.toString());
      if (!response.ok) {
        throw new Error(`Steam app list failed (${response.status})`);
      }

      const body = (await response.json()) as {
        response?: {
          apps?: Array<{ appid: number; name: string }>;
          have_more_results?: boolean;
          last_appid?: number;
        };
        applist?: {
          apps?: Array<{ appid: number; name: string }>;
        };
      };

      const apps = body.response?.apps ?? body.applist?.apps ?? [];
      allApps.push(...apps);

      if (body.response?.have_more_results && body.response.last_appid) {
        lastAppId = body.response.last_appid;
      } else {
        hasMore = false;
      }
    }

    const index = new Map<string, number[]>();
    for (const app of allApps) {
      if (!app.name || !app.appid) continue;
      const normalized = normalizeName(app.name);
      if (!normalized) continue;
      const existing = index.get(normalized);
      if (existing) {
        existing.push(app.appid);
      } else {
        index.set(normalized, [app.appid]);
      }
    }

    return index;
  }

  private async getAppIndex(): Promise<Map<string, number[]> | null> {
    if (this.appListFailed) return null;
    if (this.appIndex) return this.appIndex;
    if (!this.appIndexPromise) {
      this.appIndexPromise = this.fetchAndIndexAppList()
        .then((index) => {
          this.appIndex = index;
          return index;
        })
        .catch((error) => {
          this.appListFailed = true;
          this.appIndexPromise = null;
          throw error;
        });
    }
    return this.appIndexPromise;
  }

  async findByName(name: string): Promise<number | undefined> {
    if (!this.apiKey) return undefined;
    if (this.appListFailed) return undefined;

    const index = await this.getAppIndex();
    if (!index) return undefined;

    const normalized = normalizeName(name);
    const matchingIds = index.get(normalized);
    if (!matchingIds || matchingIds.length === 0) return undefined;
    if (matchingIds.length === 1) return matchingIds[0];

    // Multiple candidates with same normalized title: resolve via primary app validation
    return this.resolvePrimaryApp(name, matchingIds);
  }

  async resolvePrimaryApp(name: string, candidates: number[]): Promise<number | undefined> {
    const valid = [...new Set(candidates)].filter((id) => Number.isSafeInteger(id) && id > 0);
    const details = await Promise.all(
      valid.map(async (id) => ({ id, detail: await this.details(id) })),
    );
    const normalized = normalizeName(name);
    const usable = details.filter(({ detail }) => {
      const data = detail?.data;
      if (!data?.name) return false;
      if (data.type && data.type.toLowerCase() !== 'game') return false;
      const eligible = isEligibleForCatalog({ title: data.name });
      if (!eligible.eligible) return false;
      const value = normalizeName(data.name);
      return value && !/(playtest|beta|demo|dlc|soundtrack|tool|server)/i.test(value);
    });
    const exactMatches = usable.filter(
      ({ detail }) => normalizeName(detail?.data?.name ?? '') === normalized,
    );
    if (exactMatches.length === 1) return exactMatches[0].id;
    if (exactMatches.length > 1) return undefined;
    return usable.length === 1 ? usable[0].id : undefined;
  }
}

function normalizeName(name: string) {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
