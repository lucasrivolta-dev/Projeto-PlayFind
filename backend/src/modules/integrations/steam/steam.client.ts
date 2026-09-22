import type { SteamAppDetailsDto, SteamReviewSummary } from './steam.types.js';
import { isEligibleForCatalog } from '../../games/game-eligibility.js';
import {
  matchSteamCandidate,
  normalizeTitle,
  stripEditionSuffix,
  type CandidateIdentityInfo,
  type SteamAppCandidateInfo,
  type SteamMatchResult,
} from '../../sync/steam-matcher.service.js';

export type { SteamReviewSummary, CandidateIdentityInfo, SteamMatchResult };

export const STEAM_REQUEST_MIN_INTERVAL_MS = 250;
export const STEAM_DEFAULT_MAX_RETRIES = 3;
export const STEAM_DEFAULT_RETRY_AFTER_MS = 2000;

export interface SteamClientOptions {
  apiKey?: string;
  fetcher?: typeof fetch;
  minIntervalMs?: number;
  maxRetries?: number;
  defaultRetryAfterMs?: number;
  sleeper?: (ms: number) => Promise<void>;
  now?: () => number;
}

export class SteamClient {
  private appIndex: Map<string, number[]> | null = null;
  private appIndexPromise: Promise<Map<string, number[]> | null> | null = null;
  private appListFailed = false;

  private readonly apiKey: string;
  private readonly fetcher: typeof fetch;
  private readonly minIntervalMs: number;
  private readonly maxRetries: number;
  private readonly defaultRetryAfterMs: number;
  private readonly sleeper: (ms: number) => Promise<void>;
  private readonly now: () => number;

  private lastRequestEndTime = 0;
  private requestQueue: Promise<void> = Promise.resolve();

  constructor(
    apiKeyOrOptions: string | SteamClientOptions = '',
    fetcher?: typeof fetch,
    options?: Partial<SteamClientOptions>,
  ) {
    if (typeof apiKeyOrOptions === 'object' && apiKeyOrOptions !== null) {
      this.apiKey = apiKeyOrOptions.apiKey ?? '';
      this.fetcher = apiKeyOrOptions.fetcher ?? fetch;
      this.minIntervalMs = apiKeyOrOptions.minIntervalMs ?? STEAM_REQUEST_MIN_INTERVAL_MS;
      this.maxRetries = apiKeyOrOptions.maxRetries ?? STEAM_DEFAULT_MAX_RETRIES;
      this.defaultRetryAfterMs =
        apiKeyOrOptions.defaultRetryAfterMs ?? STEAM_DEFAULT_RETRY_AFTER_MS;
      this.sleeper = apiKeyOrOptions.sleeper ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
      this.now = apiKeyOrOptions.now ?? (() => Date.now());
    } else {
      this.apiKey = apiKeyOrOptions ?? '';
      this.fetcher = fetcher ?? options?.fetcher ?? fetch;
      this.minIntervalMs = options?.minIntervalMs ?? STEAM_REQUEST_MIN_INTERVAL_MS;
      this.maxRetries = options?.maxRetries ?? STEAM_DEFAULT_MAX_RETRIES;
      this.defaultRetryAfterMs =
        options?.defaultRetryAfterMs ?? STEAM_DEFAULT_RETRY_AFTER_MS;
      this.sleeper = options?.sleeper ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
      this.now = options?.now ?? (() => Date.now());
    }
  }

  private enqueueRequest<T>(operation: () => Promise<T>): Promise<T> {
    const run = async (): Promise<T> => {
      const now = this.now();
      const elapsed = now - this.lastRequestEndTime;
      if (this.lastRequestEndTime > 0 && elapsed < this.minIntervalMs) {
        const waitMs = this.minIntervalMs - elapsed;
        await this.sleeper(waitMs);
      }
      try {
        return await operation();
      } finally {
        this.lastRequestEndTime = this.now();
      }
    };

    const next = this.requestQueue.then(run, run);
    this.requestQueue = next.then(
      () => {},
      () => {},
    );
    return next;
  }

  private getHeader(response: Response, name: string): string | null {
    if (typeof response.headers?.get === 'function') {
      return response.headers.get(name);
    }
    if (response.headers && typeof response.headers === 'object') {
      const record = response.headers as unknown as Record<string, string>;
      return record[name] ?? record[name.toLowerCase()] ?? null;
    }
    return null;
  }

  private async fetchWithRetry(url: string): Promise<Response> {
    let attempt = 0;
    while (true) {
      const response = await this.fetcher(url);
      if (response.status !== 429) {
        return response;
      }

      attempt++;
      if (attempt > this.maxRetries) {
        throw new Error(`Steam rate limit exceeded (429) after ${this.maxRetries} retries`);
      }

      const retryAfterHeader = this.getHeader(response, 'retry-after');
      let delayMs = this.defaultRetryAfterMs;

      if (retryAfterHeader) {
        const seconds = Number(retryAfterHeader);
        if (Number.isFinite(seconds) && seconds > 0) {
          delayMs = seconds * 1000;
        } else {
          const parsedDate = Date.parse(retryAfterHeader);
          if (!Number.isNaN(parsedDate)) {
            const diff = parsedDate - this.now();
            if (diff > 0) delayMs = diff;
          }
        }
      }

      await this.sleeper(delayMs);
    }
  }

  async details(appId: number): Promise<SteamAppDetailsDto | undefined> {
    if (!Number.isSafeInteger(appId) || appId <= 0) return undefined;
    const url = `https://store.steampowered.com/api/appdetails?appids=${appId}&cc=br&l=english`;
    const response = await this.enqueueRequest(() => this.fetchWithRetry(url));
    if (response.status === 404) return undefined;
    if (!response.ok) throw new Error(`Steam request failed (${response.status})`);
    const body = (await response.json()) as Record<string, SteamAppDetailsDto>;
    const details = body[String(appId)];
    return details?.success === true ? details : undefined;
  }

  async reviews(appId: number): Promise<SteamReviewSummary | undefined> {
    if (!Number.isSafeInteger(appId) || appId <= 0) return undefined;
    const url = `https://store.steampowered.com/appreviews/${appId}?json=1&language=all&purchase_type=all`;
    const response = await this.enqueueRequest(() => this.fetchWithRetry(url));
    if (response.status === 404) return undefined;
    if (!response.ok) throw new Error(`Steam reviews request failed (${response.status})`);
    const body = (await response.json()) as {
      success?: number;
      query_summary?: {
        total_reviews?: number;
        total_positive?: number;
        total_negative?: number;
        review_score_desc?: string;
      };
    };
    if (body?.success !== 1 || !body.query_summary) return undefined;
    const totalReviews = body.query_summary.total_reviews ?? 0;
    const totalPositive = body.query_summary.total_positive ?? 0;
    const totalNegative = body.query_summary.total_negative ?? 0;
    const positivePercentage =
      totalReviews > 0 ? (totalPositive / totalReviews) * 100 : 0;
    return {
      totalReviews,
      totalPositive,
      totalNegative,
      positivePercentage: Number(positivePercentage.toFixed(2)),
      reviewScoreDesc: body.query_summary.review_score_desc ?? '',
    };
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

      const response = await this.enqueueRequest(() => this.fetchWithRetry(url.toString()));
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

  async resolveConfidentMatch(
    candidate: CandidateIdentityInfo,
  ): Promise<SteamMatchResult> {
    if (!this.apiKey || this.appListFailed) {
      return { status: 'NO_MATCH', reasons: ['Steam API indisponível ou sem chave'] };
    }

    const index = await this.getAppIndex();
    if (!index) {
      return { status: 'NO_MATCH', reasons: ['Índice de apps Steam indisponível'] };
    }

    const norm = normalizeTitle(candidate.name);
    if (!norm) {
      return { status: 'NO_MATCH', reasons: ['Nome do candidato vazio ou inválido'] };
    }

    // Lookup by exact normalized name and by base title without edition
    const { base: candidateBase } = stripEditionSuffix(norm);
    const candidateIds = new Set<number>();

    const directMatches = index.get(norm);
    if (directMatches) {
      for (const id of directMatches) candidateIds.add(id);
    }
    if (candidateBase !== norm) {
      const baseMatches = index.get(candidateBase);
      if (baseMatches) {
        for (const id of baseMatches) candidateIds.add(id);
      }
    }

    if (candidateIds.size === 0) {
      return { status: 'NO_MATCH', reasons: [`Nenhum app Steam encontrado para "${candidate.name}"`] };
    }

    const validIds = [...candidateIds].filter((id) => Number.isSafeInteger(id) && id > 0);
    const evaluatedResults: Array<{ appId: number; result: SteamMatchResult }> = [];

    for (const appId of validIds) {
      try {
        const detail = await this.details(appId);
        const data = detail?.data;
        if (!data) continue;

        const steamCandidate: SteamAppCandidateInfo = {
          appId,
          name: data.name ?? '',
          type: data.type,
          releaseDateRaw: data.release_date?.date,
          developers: data.developers,
          publishers: data.publishers,
          isFree: data.is_free,
        };

        const result = matchSteamCandidate(candidate, steamCandidate);
        evaluatedResults.push({ appId, result });
      } catch {
        // Individual detail failure ignored
      }
    }

    const confidentMatches = evaluatedResults.filter((r) => r.result.status === 'CONFIDENT_MATCH');
    if (confidentMatches.length === 1) {
      return confidentMatches[0].result;
    }
    if (confidentMatches.length > 1) {
      // Multiple confident matches is ambiguous
      return {
        status: 'AMBIGUOUS',
        reasons: [
          `Múltiplos matches confiáveis encontrados (${confidentMatches.map((m) => m.appId).join(', ')}): ambiguidade`,
        ],
      };
    }

    const ambiguousMatches = evaluatedResults.filter((r) => r.result.status === 'AMBIGUOUS');
    if (ambiguousMatches.length > 0) {
      return {
        status: 'AMBIGUOUS',
        reasons: ambiguousMatches.flatMap((m) => m.result.reasons),
      };
    }

    return {
      status: 'NO_MATCH',
      reasons: evaluatedResults.flatMap((r) => r.result.reasons).slice(0, 5),
    };
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
