import crypto from "node:crypto";

export interface TikTokConfig {
  appKey: string;
  appSecret: string;
  redirectUri: string;
  scopes: string[];
  authorizationUrl: string;
  tokenUrl: string;
  apiBaseUrl: string;
}

export class TikTokConfigurationError extends Error {
  public readonly code = "TIKTOK_CONFIGURATION_ERROR";
}

export function getTikTokConfig(env: NodeJS.ProcessEnv = process.env): TikTokConfig {
  const value = (name: string) => env[name]?.trim() || "";
  const appKey = value("TIKTOK_APP_KEY");
  const appSecret = value("TIKTOK_APP_SECRET");
  const redirectUri = value("TIKTOK_REDIRECT_URI");
  const scopes = value("TIKTOK_SCOPES").split(/[ ,]+/).filter(Boolean);
  if (!appKey || !appSecret || !redirectUri || scopes.length === 0) {
    throw new TikTokConfigurationError("TIKTOK_APP_KEY, TIKTOK_APP_SECRET, TIKTOK_REDIRECT_URI, and TIKTOK_SCOPES are required");
  }
  return {
    appKey, appSecret, redirectUri, scopes,
    authorizationUrl: value("TIKTOK_AUTHORIZATION_URL") || "https://auth.tiktok-shops.com/oauth/authorize",
    tokenUrl: value("TIKTOK_TOKEN_URL") || "https://auth.tiktok-shops.com/api/v2/oauth/token",
    apiBaseUrl: value("TIKTOK_API_BASE_URL") || "https://open-api.tiktokglobalshop.com",
  };
}

export function hasTikTokAppCredentials(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.TIKTOK_APP_KEY?.trim() && env.TIKTOK_APP_SECRET?.trim() && env.TIKTOK_REDIRECT_URI?.trim() && env.TIKTOK_SCOPES?.trim());
}

export function redactTikTokSecrets(value: unknown): unknown {
  if (typeof value === "string") return value.length > 8 ? `${value.slice(0, 4)}…[REDACTED]` : "[REDACTED]";
  if (Array.isArray(value)) return value.map(redactTikTokSecrets);
  if (value && typeof value === "object") {
    const secretKeys = /secret|token|cipher|authorization|code/i;
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, secretKeys.test(key) ? "[REDACTED]" : redactTikTokSecrets(item)]));
  }
  return value;
}

export interface OAuthStatePayload { nonce: string; createdAt: number; returnTo?: string; }
export class TikTokOAuthState {
  constructor(private readonly secret: string, private readonly ttlMs = 10 * 60 * 1000) { if (!secret) throw new TikTokConfigurationError("OAuth state secret is required"); }
  create(returnTo?: string, now = Date.now()): string {
    const payload: OAuthStatePayload = { nonce: crypto.randomBytes(24).toString("base64url"), createdAt: now, returnTo };
    const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const signature = crypto.createHmac("sha256", this.secret).update(encoded).digest("base64url");
    return `${encoded}.${signature}`;
  }
  validate(state: string, now = Date.now()): OAuthStatePayload {
    const [encoded, signature] = state.split(".");
    if (!encoded || !signature) throw new Error("Invalid TikTok OAuth state");
    const expected = crypto.createHmac("sha256", this.secret).update(encoded).digest("base64url");
    if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) throw new Error("Invalid TikTok OAuth state signature");
    let payload: OAuthStatePayload;
    try { payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")); } catch { throw new Error("Malformed TikTok OAuth state"); }
    if (!payload.nonce || !Number.isFinite(payload.createdAt) || now - payload.createdAt > this.ttlMs || payload.createdAt - now > 30_000) throw new Error("Expired TikTok OAuth state");
    return payload;
  }
}
