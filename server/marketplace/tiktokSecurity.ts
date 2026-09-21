import crypto from "node:crypto";
import { OAuthStatePayload, TikTokOAuthState } from "./tiktokConfig";

/**
 * Process-local one-time state store. This is safe against replay within one
 * process only. A shared durable store is required when the app is scaled out.
 */
export interface OAuthStateStore {
  put(state: string, expiresAt: number): void;
  consume(state: string, now?: number): boolean;
}

export class MemoryOAuthStateStore implements OAuthStateStore {
  private readonly states = new Map<string, number>();
  put(state: string, expiresAt: number): void {
    this.prune(Date.now());
    this.states.set(state, expiresAt);
  }
  consume(state: string, now = Date.now()): boolean {
    this.prune(now);
    const expiresAt = this.states.get(state);
    if (!expiresAt) return false;
    this.states.delete(state);
    return expiresAt >= now;
  }
  private prune(now: number) {
    for (const [state, expiresAt] of this.states) if (expiresAt < now) this.states.delete(state);
  }
}

export class OneTimeTikTokOAuthState {
  constructor(private readonly signer: TikTokOAuthState, private readonly store: OAuthStateStore, private readonly ttlMs = 10 * 60 * 1000) {}
  create(returnTo?: string, now = Date.now()): string {
    const state = this.signer.create(returnTo, now);
    this.store.put(state, now + this.ttlMs);
    return state;
  }
  validateAndConsume(state: string, now = Date.now()): OAuthStatePayload {
    const payload = this.signer.validate(state, now);
    if (!this.store.consume(state, now)) throw new Error("TikTok OAuth state has already been used or is not registered");
    return payload;
  }
}

export function generateConnectionId(): string {
  return crypto.randomBytes(16).toString("hex");
}
