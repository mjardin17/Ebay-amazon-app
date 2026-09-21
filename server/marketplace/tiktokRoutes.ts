import type { Request, RequestHandler, Response } from "express";
import { getTikTokConfig, TikTokOAuthState, hasTikTokAppCredentials } from "./tiktokConfig";
import { TikTokOAuthClient, TikTokTokenStore } from "./tiktokOAuth";
import { MemoryOAuthStateStore, OneTimeTikTokOAuthState } from "./tiktokSecurity";

export interface TikTokOAuthRouteDependencies {
  tokenStore: TikTokTokenStore;
  oauthState?: OneTimeTikTokOAuthState;
  oauth?: TikTokOAuthClient;
  now?: () => number;
}

export function createTikTokOAuthRoutes(deps: TikTokOAuthRouteDependencies): {
  start: RequestHandler;
  callback: RequestHandler;
  status: RequestHandler;
} {
  const now = deps.now || (() => Date.now());
  const config = getTikTokConfig();
  const stateSecret = process.env.TIKTOK_OAUTH_STATE_SECRET?.trim();
  if (!stateSecret) {
    throw new Error("TIKTOK_OAUTH_STATE_SECRET is required to mount TikTok OAuth routes");
  }
  const state = deps.oauthState || new OneTimeTikTokOAuthState(
    new TikTokOAuthState(stateSecret),
    new MemoryOAuthStateStore(),
  );
  const oauth = deps.oauth || new TikTokOAuthClient(config, deps.tokenStore);

  const start: RequestHandler = (req: Request, res: Response) => {
    const returnTo = typeof req.query.returnTo === "string" ? req.query.returnTo : undefined;
    res.redirect(oauth.authorizationUrl(state.create(returnTo, now())));
  };
  const callback: RequestHandler = async (req: Request, res: Response) => {
    const receivedState = typeof req.query.state === "string" ? req.query.state : "";
    const code = typeof req.query.code === "string" ? req.query.code : "";
    if (!receivedState) return res.status(400).json({ success: false, status: "AUTH_FAILED", error: "Missing OAuth state" });
    try {
      state.validateAndConsume(receivedState, now());
      if (!code) return res.status(400).json({ success: false, status: "AUTH_FAILED", error: "Missing authorization code" });
      await oauth.exchangeAuthorizationCode(code);
      return res.json({ success: true, status: "AUTHORIZED", provider: "tiktok-shop", tokenStored: true });
    } catch (error: any) {
      const stateError = /state|OAuth/i.test(error?.message || "");
      return res.status(stateError ? 400 : 502).json({ success: false, status: "AUTH_FAILED", error: "TikTok authorization could not be completed" });
    }
  };
  const status: RequestHandler = (_req, res) => {
    const token = deps.tokenStore.get();
    return res.json({
      provider: "tiktok-shop",
      status: !hasTikTokAppCredentials() ? "NOT_CONFIGURED" : token?.access_token ? "AUTHORIZED" : "AUTH_REQUIRED",
      tokenStored: Boolean(token?.access_token),
      shopBinding: "UNVERIFIED",
      tokenPersistence: "NON-PRODUCTION TOKEN STORAGE — PROCESS LOCAL",
    });
  };
  return { start, callback, status };
}
