export class IgdbClient {
  constructor(private readonly clientId: string, private readonly clientSecret: string, private readonly fetcher = fetch) {}
  async search(query: string): Promise<unknown[]> {
    const tokenResponse = await this.fetcher('https://id.twitch.tv/oauth2/token', { method: 'POST', body: new URLSearchParams({ client_id: this.clientId, client_secret: this.clientSecret, grant_type: 'client_credentials' }) });
    if (!tokenResponse.ok) throw new Error(`IGDB auth failed (${tokenResponse.status})`);
    const token = (await tokenResponse.json()) as { access_token?: string };
    if (!token.access_token) throw new Error('IGDB auth response did not include a token');
    const response = await this.fetcher('https://api.igdb.com/v4/games', { method: 'POST', headers: { 'Client-ID': this.clientId, Authorization: `Bearer ${token.access_token}`, 'Content-Type': 'text/plain' }, body: query });
    if (!response.ok) throw new Error(`IGDB request failed (${response.status})`);
    return (await response.json()) as unknown[];
  }
}
