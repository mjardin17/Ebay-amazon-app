import { TikTokApiError, normalizeTikTokError } from "./tiktokErrors";
import { TikTokConfig } from "./tiktokConfig";
import { TikTokOAuthClient } from "./tiktokOAuth";
import { TikTokRateLimiter } from "./tiktokRateLimiter";
export interface TikTokShopBinding { shopId: string; shopCipher?: string; openId?: string; authorizedAt: number; }
export class TikTokShopClient {
  constructor(private readonly config: TikTokConfig, private readonly oauth: TikTokOAuthClient, private readonly limiter = new TikTokRateLimiter(), private readonly http: typeof fetch = fetch) {}
  async request<T>(path: string, operation: string, binding: TikTokShopBinding, init: RequestInit = {}): Promise<T> {
    if (!binding.shopId) throw new Error("TikTok authorized shop binding is required");
    const token = await this.oauth.getAccessToken();
    const url = new URL(path, this.config.apiBaseUrl);
    return this.limiter.execute({ appKey: this.config.appKey, shopId: binding.shopId, endpoint: url.pathname, operation }, async () => {
      const response = await this.http(url, { ...init, headers: { ...(init.headers || {}), Authorization: `Bearer ${token}`, "content-type": "application/json", ...(binding.shopCipher ? { "x-tts-shop-cipher": binding.shopCipher } : {}) } });
      const text = await response.text(); let body: unknown; try { body = text ? JSON.parse(text) : {}; } catch { throw new TikTokApiError("Malformed TikTok API response", { status: response.status, retryable: false, kind: "malformed_response" }); }
      if (!response.ok) throw normalizeTikTokError(response.status, body, response.headers);
      return body as T;
    });
  }
  getSupportedCapabilities() { return { sellerAuthorization: "CODE VERIFIED", shopBinding: "CODE VERIFIED", productInventoryOrders: "UNVERIFIED" as const }; }
}
