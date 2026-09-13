export class IgdbClient {
  private accessToken?: string;
  private accessTokenExpiresAt = 0;

  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  private async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.accessTokenExpiresAt) return this.accessToken;

    if (!this.clientId || !this.clientSecret) {
      throw new Error('IGDB credentials are not configured');
    }

    const tokenResponse = await this.fetcher('https://id.twitch.tv/oauth2/token', {
      method: 'POST',
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        grant_type: 'client_credentials',
      }),
    });
    if (!tokenResponse.ok) throw new Error(`IGDB auth failed (${tokenResponse.status})`);

    const token = (await tokenResponse.json()) as {
      access_token?: string;
      expires_in?: number;
    };
    if (!token.access_token) throw new Error('IGDB auth response did not include a token');

    this.accessToken = token.access_token;
    // Refresh slightly before expiry; IGDB normally returns an hour-long token.
    this.accessTokenExpiresAt = Date.now() + Math.max(1, (token.expires_in ?? 3600) - 60) * 1000;
    return token.access_token;
  }

  async search(query: string): Promise<unknown[]> {
    const token = await this.getAccessToken();
    const response = await this.fetcher('https://api.igdb.com/v4/games', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Client-ID': this.clientId,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'text/plain',
      },
      body: query,
    });
    if (!response.ok) throw new Error(`IGDB request failed (${response.status})`);
    return (await response.json()) as unknown[];
  }
}
