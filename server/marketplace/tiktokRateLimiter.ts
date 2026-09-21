import { TikTokApiError } from "./tiktokErrors";
export interface TikTokRateLimitKey { appKey: string; shopId?: string; endpoint: string; operation: string; }
export interface TikTokRateLimiterOptions { maxConcurrent?: number; maxRetries?: number; initialBackoffMs?: number; maxBackoffMs?: number; jitter?: () => number; sleep?: (ms: number) => Promise<void>; }
export class TikTokRateLimiter {
  private readonly nextAvailable = new Map<string, number>();
  private active = 0;
  constructor(private readonly options: TikTokRateLimiterOptions = {}) {}
  async execute<T>(key: TikTokRateLimitKey, task: () => Promise<T>): Promise<T> {
    const bucket = `${key.appKey}:${key.shopId || "unbound"}:${key.endpoint}:${key.operation}`;
    while (this.active >= (this.options.maxConcurrent ?? 3)) await this.sleep(5);
    this.active++;
    try { let attempt = 0; let delay = this.options.initialBackoffMs ?? 250; while (true) { await this.waitBucket(bucket); try { return await task(); } catch (error) { const retryable = error instanceof TikTokApiError && error.details.retryable; if (!retryable || attempt++ >= (this.options.maxRetries ?? 3)) throw error; const retryAfter = error instanceof TikTokApiError ? error.details.retryAfterMs : undefined; const jitter = (this.options.jitter || Math.random)() * delay * 0.3; const wait = retryAfter ?? Math.min(this.options.maxBackoffMs ?? 10_000, delay + jitter); this.nextAvailable.set(bucket, Date.now() + wait); await this.sleep(wait); delay = Math.min(this.options.maxBackoffMs ?? 10_000, delay * 2); } } } finally { this.active--; }
  }
  private async waitBucket(bucket: string) { const wait = Math.max(0, (this.nextAvailable.get(bucket) || 0) - Date.now()); if (wait) await this.sleep(wait); }
  private sleep(ms: number) { return (this.options.sleep || ((value: number) => new Promise<void>(resolve => setTimeout(resolve, value))))(ms); }
}
