/**
 * Centralized Rate Limiter and Exponential Backoff Dispatcher
 * Controls outbound requests to marketplace APIs with backpressure and retry logic.
 */

export interface RateLimiterOptions {
  maxRequestsPerSecond: number;
  maxConcurrent: number;
  maxRetries?: number;
  initialBackoffMs?: number;
  maxBackoffMs?: number;
  timeoutMs?: number;
}

export class MarketplaceRateLimiter {
  private queue: Array<() => Promise<void>> = [];
  private activeCount = 0;
  private lastRequestTime = 0;
  private readonly minIntervalMs: number;
  private readonly maxConcurrent: number;
  private readonly maxRetries: number;
  private readonly initialBackoffMs: number;
  private readonly maxBackoffMs: number;
  private readonly timeoutMs: number;

  constructor(options: RateLimiterOptions) {
    this.minIntervalMs = 1000 / Math.max(1, options.maxRequestsPerSecond);
    this.maxConcurrent = options.maxConcurrent || 3;
    this.maxRetries = options.maxRetries ?? 3;
    this.initialBackoffMs = options.initialBackoffMs ?? 500;
    this.maxBackoffMs = options.maxBackoffMs ?? 10000;
    this.timeoutMs = options.timeoutMs ?? 15000;
  }

  /**
   * Executes a task through the rate limiter with queuing, concurrency control,
   * timeout, and exponential backoff retry for transient network/429 errors.
   */
  public async execute<T>(task: () => Promise<T>, taskName = "MarketplaceRequest"): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const wrappedTask = async () => {
        try {
          const result = await this.executeWithRetry(task, taskName);
          resolve(result);
        } catch (err) {
          reject(err);
        } finally {
          this.activeCount--;
          this.processQueue();
        }
      };

      this.queue.push(wrappedTask);
      this.processQueue();
    });
  }

  private processQueue(): void {
    if (this.queue.length === 0 || this.activeCount >= this.maxConcurrent) {
      return;
    }

    const now = Date.now();
    const timeSinceLast = now - this.lastRequestTime;
    const delayNeeded = Math.max(0, this.minIntervalMs - timeSinceLast);

    if (delayNeeded > 0) {
      setTimeout(() => this.processQueue(), delayNeeded);
      return;
    }

    const nextTask = this.queue.shift();
    if (nextTask) {
      this.activeCount++;
      this.lastRequestTime = Date.now();
      nextTask();
    }
  }

  private async executeWithRetry<T>(task: () => Promise<T>, taskName: string): Promise<T> {
    let attempt = 0;
    let currentDelay = this.initialBackoffMs;

    while (attempt <= this.maxRetries) {
      try {
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => {
            const err = new Error(`Request timeout (${this.timeoutMs}ms) for ${taskName}`);
            (err as any).status = 408;
            reject(err);
          }, this.timeoutMs);
        });

        return await Promise.race([task(), timeoutPromise]);
      } catch (err: any) {
        attempt++;
        const statusCode = err?.status || err?.statusCode || (err?.response && err.response.status);
        const isRetryable = statusCode === 429 || statusCode === 500 || statusCode === 502 || statusCode === 503 || statusCode === 504 || statusCode === 408 || err?.code === "ETIMEDOUT" || err?.code === "ECONNRESET";

        if (attempt > this.maxRetries || !isRetryable) {
          throw err;
        }

        // Apply exponential backoff with jitter
        const jitter = Math.random() * 0.3 * currentDelay;
        const sleepDuration = Math.min(this.maxBackoffMs, currentDelay + jitter);
        await new Promise((res) => setTimeout(res, sleepDuration));
        currentDelay = Math.min(this.maxBackoffMs, currentDelay * 2);
      }
    }

    throw new Error(`Failed ${taskName} after ${this.maxRetries} retry attempts`);
  }

  public getQueueLength(): number {
    return this.queue.length;
  }

  public getActiveCount(): number {
    return this.activeCount;
  }
}

// Default marketplace rate limiters
export const amazonRateLimiter = new MarketplaceRateLimiter({
  maxRequestsPerSecond: 1, // Amazon Creators API 1 req/sec standard
  maxConcurrent: 2,
  maxRetries: 3,
  initialBackoffMs: 800,
  timeoutMs: 12000,
});

export const ebayRateLimiter = new MarketplaceRateLimiter({
  maxRequestsPerSecond: 4, // eBay Browse & Catalog API 5 req/sec
  maxConcurrent: 3,
  maxRetries: 3,
  initialBackoffMs: 500,
  timeoutMs: 12000,
});
