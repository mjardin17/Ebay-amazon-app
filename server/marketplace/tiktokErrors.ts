export type TikTokErrorKind = "authentication" | "authorization" | "rate_limit" | "malformed_response" | "api" | "network";
export class TikTokApiError extends Error {
  constructor(message: string, public readonly details: { status?: number; businessCode?: string | number; requestId?: string; retryable: boolean; kind: TikTokErrorKind; retryAfterMs?: number }) { super(message); this.name = "TikTokApiError"; }
}
export function parseRetryAfter(value: string | null, now = Date.now()): number | undefined { if (!value) return undefined; const seconds = Number(value); if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000); const date = Date.parse(value); return Number.isFinite(date) ? Math.max(0, date - now) : undefined; }
export function normalizeTikTokError(status: number, body: unknown, headers: Headers = new Headers()): TikTokApiError {
  const item = body && typeof body === "object" ? body as Record<string, any> : {};
  const code = item.code ?? item.error_code ?? item.data?.code;
  const requestId = headers.get("x-tt-logid") || headers.get("x-request-id") || item.request_id;
  const rate = status === 429 || String(code) === "36009002";
  const kind: TikTokErrorKind = rate ? "rate_limit" : status === 401 ? "authentication" : status === 403 ? "authorization" : "api";
  return new TikTokApiError(`TikTok API request failed (${status}${code ? `/${code}` : ""})`, { status, businessCode: code, requestId, retryable: rate || status >= 500, kind, retryAfterMs: parseRetryAfter(headers.get("retry-after")) });
}
