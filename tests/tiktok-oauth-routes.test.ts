import assert from "node:assert/strict";
import express from "express";
import { createServer } from "node:http";
import { getTikTokConfig, TikTokOAuthState } from "../server/marketplace/tiktokConfig";
import { MemoryTikTokTokenStore, TikTokOAuthClient } from "../server/marketplace/tiktokOAuth";
import { MemoryOAuthStateStore, OneTimeTikTokOAuthState } from "../server/marketplace/tiktokSecurity";
import { createTikTokOAuthRoutes } from "../server/marketplace/tiktokRoutes";

Object.assign(process.env, { TIKTOK_APP_KEY: "app", TIKTOK_APP_SECRET: "secret", TIKTOK_REDIRECT_URI: "https://example.test/callback", TIKTOK_SCOPES: "shop.read", TIKTOK_OAUTH_STATE_SECRET: "state-secret" });
const config = getTikTokConfig();
const store = new MemoryTikTokTokenStore();
const oauth = new TikTokOAuthClient(config, store, async () => ({ access_token: "access", refresh_token: "refresh", expires_in: 3600 }));
const state = new OneTimeTikTokOAuthState(new TikTokOAuthState("state-secret"), new MemoryOAuthStateStore());
const handlers = createTikTokOAuthRoutes({ tokenStore: store, oauthState: state, oauth });
const app = express(); app.get("/api/tiktok-shop/connect", handlers.start); app.get("/api/tiktok-shop/callback", handlers.callback); app.get("/api/tiktok-shop/status", handlers.status);
const server = createServer(app); server.listen(0, "127.0.0.1");
const address = await new Promise<any>(resolve => server.once("listening", () => resolve(server.address())));
const base = `http://127.0.0.1:${address.port}`;
try {
  const start = await fetch(`${base}/api/tiktok-shop/connect`); assert.equal(start.status, 302); const location = new URL(start.headers.get("location")!); assert(location.searchParams.has("state"));
  const success = await fetch(`${base}/api/tiktok-shop/callback?state=${encodeURIComponent(location.searchParams.get("state")!)}&code=auth-code`); const successBody = await success.json(); assert.equal(successBody.status, "AUTHORIZED"); assert(!JSON.stringify(successBody).includes("access")); assert(!JSON.stringify(successBody).includes("refresh"));
  const replay = await fetch(`${base}/api/tiktok-shop/callback?state=${encodeURIComponent(location.searchParams.get("state")!)}&code=auth-code`); assert.equal(replay.status, 400);
  const invalid = await fetch(`${base}/api/tiktok-shop/callback?state=invalid&code=auth-code`); assert.equal(invalid.status, 400);
  const status = await fetch(`${base}/api/tiktok-shop/status`); const statusBody = await status.json(); assert.equal(statusBody.status, "AUTHORIZED"); assert(!JSON.stringify(statusBody).includes("access"));
  console.log("✓ MOCKED: mounted TikTok OAuth route behavior");
} finally { server.close(); }
