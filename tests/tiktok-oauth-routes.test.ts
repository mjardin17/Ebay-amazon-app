import assert from "node:assert/strict";
import { getTikTokConfig, TikTokOAuthState } from "../server/marketplace/tiktokConfig";
import { MemoryTikTokTokenStore, TikTokOAuthClient } from "../server/marketplace/tiktokOAuth";
import { MemoryOAuthStateStore, OneTimeTikTokOAuthState } from "../server/marketplace/tiktokSecurity";
import { createTikTokOAuthRoutes } from "../server/marketplace/tiktokRoutes";

const env = { TIKTOK_APP_KEY: "app", TIKTOK_APP_SECRET: "secret", TIKTOK_REDIRECT_URI: "https://example.test/callback", TIKTOK_SCOPES: "shop.read", TIKTOK_OAUTH_STATE_SECRET: "state-secret" };
Object.assign(process.env, env);
const config = getTikTokConfig(env);
const store = new MemoryTikTokTokenStore();
const state = new OneTimeTikTokOAuthState(new TikTokOAuthState("state-secret"), new MemoryOAuthStateStore());
const oauth = new TikTokOAuthClient(config, store, async () => ({ access_token: "access", refresh_token: "refresh", expires_in: 3600 }));
const routes = createTikTokOAuthRoutes({ tokenStore: store, oauthState: state, oauth });
function response() { return { redirected: "", body: undefined as any, code: 200, redirect(url: string) { this.redirected = url; }, status(code: number) { this.code = code; return this; }, json(body: any) { this.body = body; return this; } }; }
(async () => {
  const start = response(); routes.start({ query: {} } as any, start as any); assert.equal(start.code, 200); assert.match(start.redirected, /state=/);
  const stateValue = new URL(start.redirected).searchParams.get("state")!;
  const success = response(); await routes.callback({ query: { state: stateValue, code: "auth-code" } } as any, success as any); assert.equal(success.body.status, "AUTHORIZED"); assert.equal(JSON.stringify(success.body).includes("access"), false);
  const replay = response(); await routes.callback({ query: { state: stateValue, code: "auth-code" } } as any, replay as any); assert.equal(replay.code, 400);
  const status = response(); routes.status({} as any, status as any); assert.equal(status.body.tokenStored, true);
  console.log("✓ MOCKED: TikTok OAuth route behavior");
})().catch(error => { console.error(error); process.exitCode = 1; });
