import type { SteamAppDetailsDto } from './steam.types.js';
export class SteamClient {
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
  async findByName(name: string): Promise<number | undefined> {
    if (!this.apiKey) return undefined;
    const response = await this.fetcher(
      `https://api.steampowered.com/ISteamApps/GetAppList/v2/?key=${encodeURIComponent(this.apiKey)}`,
    );
    if (!response.ok) throw new Error(`Steam app list failed (${response.status})`);
    const body = (await response.json()) as {
      applist?: {
        apps?: {
          appid: number;
          name: string;
        }[];
      };
    };
    const normalized = normalizeName(name);
    return body.applist?.apps?.find((app) => normalizeName(app.name) === normalized)?.appid;
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
