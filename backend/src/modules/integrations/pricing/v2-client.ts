export type JsonRecord = Record<string, unknown>;
export function object(value: unknown): JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

// Never expose response bodies, request headers, keys or raw network errors.
export class PriceProviderError extends Error {
  constructor(
    readonly code: string,
    readonly status?: number,
    readonly retryAfter?: string,
  ) {
    super(`Price provider: ${code}${status ? ` (HTTP ${status})` : ''}`);
    this.name = 'PriceProviderError';
  }
}

export class V2PriceClient {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async get(path: string, query: Record<string, string> = {}): Promise<JsonRecord> {
    const url = new URL(`${this.baseUrl}${path}`);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
    let response: Response;
    try {
      response = await this.fetcher(url, {
        headers: { 'X-API-Key': this.apiKey, Accept: 'application/json' },
        signal: AbortSignal.timeout(15000),
        redirect: 'error',
      });
    } catch {
      throw new PriceProviderError('UNAVAILABLE');
    }
    if (!response.ok) {
      const retry = response.headers.get('retry-after');
      throw new PriceProviderError(
        response.status === 401
          ? 'UNAUTHORIZED'
          : response.status === 403
            ? 'REGION_OR_PLAN_DENIED'
            : response.status === 429
              ? 'RATE_LIMITED'
              : 'HTTP_ERROR',
        response.status,
        retry && /^\d{1,10}$/.test(retry) ? retry : undefined,
      );
    }
    let envelope: JsonRecord;
    try {
      envelope = object(await response.json());
    } catch {
      throw new PriceProviderError('INVALID_RESPONSE');
    }
    if (envelope.success !== true) throw new PriceProviderError('API_ERROR');
    return envelope;
  }
}
