import { TikTokConfig } from "./tiktokConfig";

export interface TikTokTokenResponse { access_token: string; refresh_token: string; expires_in: number; refresh_token_expires_in?: number; open_id?: string; seller_name?: string; issuedAt?: number; }
export interface TikTokTokenStore { get(): TikTokTokenResponse | null; save(token: TikTokTokenResponse): void; clear(): void; }
export class MemoryTikTokTokenStore implements TikTokTokenStore {
  private token: TikTokTokenResponse | null = null;
  get() { return this.token; }
  save(token: TikTokTokenResponse) { this.token = { ...token }; }
  clear() { this.token = null; }
}
export type TikTokTokenFetcher = (body: URLSearchParams) => Promise<TikTokTokenResponse>;

export class TikTokOAuthClient {
  constructor(private readonly config: TikTokConfig, private readonly store: TikTokTokenStore = new MemoryTikTokTokenStore(), private readonly fetcher: TikTokTokenFetcher = defaultTokenFetcher(config.tokenUrl)) {}
  authorizationUrl(state: string): string {
    const url = new URL(this.config.authorizationUrl);
    url.searchParams.set("app_key", this.config.appKey);
    url.searchParams.set("redirect_uri", this.config.redirectUri);
    url.searchParams.set("state", state);
    url.searchParams.set("scope", this.config.scopes.join(","));
    return url.toString();
  }
  async exchangeAuthorizationCode(code: string): Promise<TikTokTokenResponse> {
    if (!code?.trim()) throw new Error("TikTok authorization code is required");
    const token = await this.fetcher(new URLSearchParams({ app_key: this.config.appKey, app_secret: this.config.appSecret, auth_code: code, grant_type: "authorized_code" }));
    this.validateToken(token); this.store.save(token); return token;
  }
  async refresh(): Promise<TikTokTokenResponse> {
    const current = this.store.get();
    if (!current?.refresh_token) throw new Error("No TikTok refresh token is available");
    const token = await this.fetcher(new URLSearchParams({ app_key: this.config.appKey, app_secret: this.config.appSecret, refresh_token: current.refresh_token, grant_type: "refresh_token" }));
    this.validateToken(token); this.store.save(token); return token;
  }
  async getAccessToken(now = Date.now()): Promise<string> {
    const token = this.store.get();
    if (!token?.access_token) throw new Error("TikTok seller authorization is not configured");
    const issuedAt = token.issuedAt || 0;
    if (issuedAt && now >= issuedAt + Math.max(0, token.expires_in - 60) * 1000) return (await this.refresh()).access_token;
    return token.access_token;
  }
  private validateToken(token: TikTokTokenResponse) { if (!token?.access_token || !token.refresh_token || !Number.isFinite(token.expires_in)) throw new Error("Malformed TikTok token response"); token.issuedAt = Date.now(); }
}
function defaultTokenFetcher(tokenUrl: string): TikTokTokenFetcher { return async body => { const response = await fetch(tokenUrl, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: body.toString() }); const text = await response.text(); if (!response.ok) { const error: any = new Error(`TikTok token exchange failed: HTTP ${response.status}`); error.status = response.status; throw error; } let parsed: unknown; try { parsed = JSON.parse(text); } catch { throw new Error("Malformed TikTok token response"); } return parsed as TikTokTokenResponse; }; }
