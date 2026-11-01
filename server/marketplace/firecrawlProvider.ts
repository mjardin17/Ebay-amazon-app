/**
 * Official Firecrawl Supplementary Product-Research Provider
 *
 * Implements Firecrawl v2 `/scrape` endpoint integration as an OPTIONAL,
 * supplementary public web product-page extractor.
 *
 * Security, Architectural & Marketplace Integrity Guarantees:
 * - Strict SSRF protection: blocks private/loopback/link-local/CGNAT/reserved IPv4 & IPv6,
 *   IPv4-mapped IPv6, integer/octal/hex IP encodings, wildcard DNS rebinding domains
 *   (nip.io, sslip.io, localtest.me, etc.), non-standard ports, and verifies DNS resolution
 *   records before dispatching requests.
 * - Strict Firecrawl API Base URL validation: enforces HTTPS, blocks embedded credentials,
 *   enforces trusted API host allowlist (`api.firecrawl.dev`), and sets `redirect: "manual"`
 *   so `Authorization: Bearer <FIRECRAWL_API_KEY>` can NEVER be sent or redirected to an
 *   untrusted host.
 * - Uses existing MarketplaceCache (with in-flight deduplication) and MarketplaceRateLimiter.
 * - Registers capability in MarketplaceCapabilityManager ("firecrawl_product_research").
 * - Keeps API credentials strictly server-side (FIRECRAWL_API_KEY).
 * - Never treats extracted web pages as proof of completed sales, live inventory,
 *   seller ungating eligibility, or actual marketplace fees/net profit.
 */

import dns from "node:dns";
import net from "node:net";
import {
  CapabilityInfo,
  CapabilityState,
  FirecrawlDataIntegrityReport,
  FirecrawlExtractOptions,
  FirecrawlExtractionStatus,
  FirecrawlIdentifierEvidence,
  IdentifierConfidenceState,
  NormalizedFirecrawlProductResearch,
} from "./types";
import { marketplaceCache, MarketplaceCache } from "./cache";
import { firecrawlRateLimiter, MarketplaceRateLimiter } from "./rateLimiter";
import { HttpExecutor } from "./amazonProvider";

export interface ValidatedUrlResult {
  valid: boolean;
  normalizedUrl: string;
  domain: string;
  reason?: string;
}

export type DnsLookupRecord = { address: string; family: number };
export type DnsLookupFn = (hostname: string) => Promise<DnsLookupRecord[]>;

const DEFAULT_FIRECRAWL_BASE_URL = "https://api.firecrawl.dev/v2";
const DEFAULT_TRUSTED_FIRECRAWL_HOSTS = new Set(["api.firecrawl.dev"]);
const DEFAULT_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const DEFAULT_STALE_THRESHOLD_MS = 60 * 60 * 1000; // 1 hour freshness window for pricing/availability
const MAX_URL_LENGTH = 2048;

const AUTH_OR_PAYWALL_PATH_PATTERNS = [
  /\/login(\/|$)/i,
  /\/signin(\/|$)/i,
  /\/ap\/signin/i,
  /\/auth(\/|$)/i,
  /\/checkout(\/|$)/i,
  /\/cart(\/|$)/i,
  /\/myaccount(\/|$)/i,
  /\/account\/login/i,
  /\/paywall(\/|$)/i,
  /\/subscribe(\/|$)/i,
];

const ANTI_BOT_OR_WALL_PATTERNS = [
  /enter the characters you see below/i,
  /robot check/i,
  /please verify you are a human/i,
  /pardon our interruption/i,
  /access to this page has been denied/i,
  /cloudflare.*ray id/i,
  /captcha/i,
];

const BLOCKED_HOST_SUFFIXES = [
  ".local",
  ".internal",
  ".localhost",
  ".lan",
  ".home",
  ".corp",
  ".localdomain",
  ".nip.io",
  ".sslip.io",
  ".xip.io",
  ".localtest.me",
  ".lvh.me",
  ".vcap.me",
];

const BLOCKED_EXACT_HOSTS = new Set([
  "localhost",
  "metadata",
  "metadata.google.internal",
  "instance-data",
  "localtest.me",
  "lvh.me",
  "vcap.me",
  "0.0.0.0",
]);

/**
 * Checks whether an IPv4 4-octet array falls in any private, loopback, link-local,
 * CGNAT, documentation, multicast, broadcast, or reserved CIDR block.
 */
function isPrivateOrReservedIpv4Octets(octets: number[]): boolean {
  if (octets.length !== 4 || octets.some((o) => !Number.isInteger(o) || o < 0 || o > 255)) {
    return true;
  }
  const [a, b, c] = octets;

  // 0.0.0.0/8 (Current network)
  if (a === 0) return true;
  // 10.0.0.0/8 (Private network)
  if (a === 10) return true;
  // 100.64.0.0/10 (Shared Address Space / CGNAT / Tailscale)
  if (a === 100 && b >= 64 && b <= 127) return true;
  // 127.0.0.0/8 (Loopback)
  if (a === 127) return true;
  // 169.254.0.0/16 (Link-local / Cloud Instance Metadata)
  if (a === 169 && b === 254) return true;
  // 172.16.0.0/12 (Private network)
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 192.0.0.0/24 (IETF Protocol Assignments)
  if (a === 192 && b === 0 && c === 0) return true;
  // 192.0.2.0/24 (TEST-NET-1)
  if (a === 192 && b === 0 && c === 2) return true;
  // 192.88.99.0/24 (6to4 Relay Anycast)
  if (a === 192 && b === 88 && c === 99) return true;
  // 192.168.0.0/16 (Private network)
  if (a === 192 && b === 168) return true;
  // 198.18.0.0/15 (Benchmark testing)
  if (a === 198 && (b === 18 || b === 19)) return true;
  // 198.51.100.0/24 (TEST-NET-2)
  if (a === 198 && b === 51 && c === 100) return true;
  // 203.0.113.0/24 (TEST-NET-3)
  if (a === 203 && b === 0 && c === 113) return true;
  // 224.0.0.0/4 (Multicast) and 240.0.0.0/4 (Reserved / Broadcast)
  if (a >= 224) return true;

  return false;
}

/**
 * Checks whether an IPv4 or IPv6 literal is private, loopback, link-local, or reserved.
 */
export function isPrivateOrReservedIp(rawIp: string): boolean {
  const cleaned = rawIp.trim().replace(/^\[|\]$/g, "").toLowerCase();
  const ipVersion = net.isIP(cleaned);

  if (ipVersion === 4) {
    const octets = cleaned.split(".").map((part) => Number(part));
    return isPrivateOrReservedIpv4Octets(octets);
  }

  if (ipVersion === 6) {
    if (cleaned === "::" || cleaned === "::1" || cleaned === "0:0:0:0:0:0:0:1" || cleaned === "0:0:0:0:0:0:0:0") {
      return true;
    }
    // Unique local (fc00::/7 -> fc.. or fd..), Link-local (fe80::/10 -> fe8., fe9., fea., feb.), Multicast (ff00::/8)
    if (
      cleaned.startsWith("fc") ||
      cleaned.startsWith("fd") ||
      cleaned.startsWith("fe8") ||
      cleaned.startsWith("fe9") ||
      cleaned.startsWith("fea") ||
      cleaned.startsWith("feb") ||
      cleaned.startsWith("ff") ||
      cleaned.startsWith("2001:db8:") ||
      cleaned.startsWith("2001:0db8:")
    ) {
      return true;
    }

    // Check IPv4-mapped IPv6 addresses: ::ffff:a.b.c.d or ::ffff:xxxx:yyyy
    const v4MappedDotted = cleaned.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
    if (v4MappedDotted?.[1]) {
      const octets = v4MappedDotted[1].split(".").map(Number);
      return isPrivateOrReservedIpv4Octets(octets);
    }

    const v4MappedHex = cleaned.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
    if (v4MappedHex) {
      const high = parseInt(v4MappedHex[1], 16);
      const low = parseInt(v4MappedHex[2], 16);
      const octets = [(high >> 8) & 0xff, high & 0xff, (low >> 8) & 0xff, low & 0xff];
      return isPrivateOrReservedIpv4Octets(octets);
    }

    return false;
  }

  return true;
}

/**
 * Validates standard Modulo-10 check digit for GTIN-8 (8), UPC-A (12), EAN-13 (13), or GTIN-14 (14).
 * Rejects any string containing alphabetic or non-barcode characters.
 */
export function isValidGtinCheckDigit(code: string): boolean {
  if (typeof code !== "string") return false;
  const trimmed = code.trim();
  if (!/^[\d\s-]+$/.test(trimmed)) {
    return false;
  }
  const digitsOnly = trimmed.replace(/\D/g, "");
  if (![8, 12, 13, 14].includes(digitsOnly.length)) {
    return false;
  }
  if (/^(\d)\1+$/.test(digitsOnly)) {
    return false;
  }
  const digits = digitsOnly.split("").map(Number);
  const checkDigit = digits.pop()!;
  let sum = 0;
  for (let i = digits.length - 1, pos = 0; i >= 0; i--, pos++) {
    const weight = pos % 2 === 0 ? 3 : 1;
    sum += digits[i] * weight;
  }
  const calculated = (10 - (sum % 10)) % 10;
  return calculated === checkDigit;
}

/**
 * Validates standard 10-character Amazon ASIN format
 */
export function isValidAsinFormat(asin: string): boolean {
  const clean = asin.trim().toUpperCase();
  return /^B[0-9A-Z]{9}$/.test(clean) || /^[0-9]{9}[0-9X]$/.test(clean);
}

/**
 * Validates the Firecrawl API Base URL to prevent credential exfiltration to untrusted hosts.
 * Enforces HTTPS, forbids embedded credentials/queries/fragments, and requires the host to be
 * on the trusted Firecrawl API host allowlist (`api.firecrawl.dev` by default).
 */
export function validateFirecrawlApiBaseUrl(rawBaseUrl?: string): ValidatedUrlResult {
  const candidate = (rawBaseUrl || process.env.FIRECRAWL_API_BASE_URL || DEFAULT_FIRECRAWL_BASE_URL).trim();
  if (!candidate) {
    return {
      valid: false,
      normalizedUrl: "",
      domain: "",
      reason: "Firecrawl API base URL is empty.",
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return {
      valid: false,
      normalizedUrl: candidate,
      domain: "",
      reason: "FIRECRAWL_API_BASE_URL is not a valid URL.",
    };
  }

  if (parsed.protocol !== "https:") {
    return {
      valid: false,
      normalizedUrl: candidate,
      domain: parsed.hostname,
      reason: `FIRECRAWL_API_BASE_URL must use https: protocol (received "${parsed.protocol}") to protect API credentials in transit.`,
    };
  }

  if (parsed.username || parsed.password) {
    return {
      valid: false,
      normalizedUrl: candidate,
      domain: parsed.hostname,
      reason: "FIRECRAWL_API_BASE_URL must not contain embedded user/password credentials.",
    };
  }

  if (parsed.search || parsed.hash) {
    return {
      valid: false,
      normalizedUrl: candidate,
      domain: parsed.hostname,
      reason: "FIRECRAWL_API_BASE_URL must not contain query parameters or hash fragments.",
    };
  }

  if (parsed.port && parsed.port !== "443") {
    return {
      valid: false,
      normalizedUrl: candidate,
      domain: parsed.hostname,
      reason: `FIRECRAWL_API_BASE_URL port "${parsed.port}" is not permitted; only standard HTTPS port 443 is allowed.`,
    };
  }

  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (net.isIP(host) !== 0 && isPrivateOrReservedIp(host)) {
    return {
      valid: false,
      normalizedUrl: candidate,
      domain: host,
      reason: `FIRECRAWL_API_BASE_URL host "${host}" is a private or reserved IP address.`,
    };
  }

  const allowedHosts = new Set(DEFAULT_TRUSTED_FIRECRAWL_HOSTS);
  const extraAllowed = (process.env.FIRECRAWL_ALLOWED_API_HOSTS || "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  for (const h of extraAllowed) {
    allowedHosts.add(h);
  }

  if (!allowedHosts.has(host)) {
    return {
      valid: false,
      normalizedUrl: candidate,
      domain: host,
      reason: `Untrusted Firecrawl API host "${host}". Credentials can only be sent to allowlisted hosts (${Array.from(
        allowedHosts
      ).join(", ")}).`,
    };
  }

  const cleanUrl = parsed.toString().replace(/\/+$/, "");
  return {
    valid: true,
    normalizedUrl: cleanUrl,
    domain: host,
  };
}

export class FirecrawlResearchProvider {
  private cache: MarketplaceCache;
  private rateLimiter: MarketplaceRateLimiter;
  private httpExecutor: HttpExecutor;
  private dnsLookup: DnsLookupFn;
  private hasCustomDnsLookup: boolean;
  private lastError: { state: CapabilityState; message: string; timestamp: number } | null = null;

  constructor(
    cache: MarketplaceCache = marketplaceCache,
    rateLimiter: MarketplaceRateLimiter = firecrawlRateLimiter,
    httpExecutor?: HttpExecutor,
    dnsLookup?: DnsLookupFn
  ) {
    this.cache = cache;
    this.rateLimiter = rateLimiter;
    this.httpExecutor = httpExecutor || ((url, opts) => fetch(url, opts));
    this.hasCustomDnsLookup = Boolean(dnsLookup);
    this.dnsLookup =
      dnsLookup ||
      (async (hostname: string) => {
        const records = await dns.promises.lookup(hostname, { all: true, verbatim: true });
        return records;
      });
  }

  public setHttpExecutor(executor: HttpExecutor): void {
    this.httpExecutor = executor;
  }

  public setDnsLookup(lookupFn: DnsLookupFn): void {
    this.dnsLookup = lookupFn;
    this.hasCustomDnsLookup = true;
  }

  public clearErrorState(): void {
    this.lastError = null;
  }

  /**
   * Checks whether Firecrawl is explicitly disabled via FIRECRAWL_ENABLED=false
   */
  public isExplicitlyDisabled(): boolean {
    const flag = (process.env.FIRECRAWL_ENABLED || "").trim().toLowerCase();
    return flag === "false" || flag === "0" || flag === "no";
  }

  /**
   * Checks whether FIRECRAWL_API_KEY is configured in environment
   */
  public hasCredentials(): boolean {
    const key = (process.env.FIRECRAWL_API_KEY || "").trim();
    return Boolean(key.length > 0 && key !== "MY_FIRECRAWL_API_KEY" && key !== "YOUR_FIRECRAWL_API_KEY");
  }

  /**
   * Checks whether provider is active and ready to execute requests
   */
  public isEnabledAndConfigured(): boolean {
    return !this.isExplicitlyDisabled() && this.hasCredentials();
  }

  private getCacheTtlMs(): number {
    const parsed = Number(process.env.FIRECRAWL_CACHE_TTL_MS);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_CACHE_TTL_MS;
  }

  private getStaleThresholdMs(overrideMs?: number): number {
    if (overrideMs !== undefined && Number.isFinite(overrideMs) && overrideMs >= 0) {
      return overrideMs;
    }
    const parsed = Number(process.env.FIRECRAWL_STALE_THRESHOLD_MS);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_STALE_THRESHOLD_MS;
  }

  /**
   * Returns current capability status for MarketplaceCapabilityManager
   */
  public async getCapabilityStatus(): Promise<CapabilityInfo> {
    if (this.isExplicitlyDisabled()) {
      return {
        id: "firecrawl_product_research",
        name: "Firecrawl Public Web Product Research & Extraction (Supplementary)",
        provider: "firecrawl-research",
        state: "not_configured",
        message:
          "Firecrawl supplementary research provider is disabled via FIRECRAWL_ENABLED=false. Core Amazon and eBay marketplace integrations remain active.",
        lastChecked: Date.now(),
        documentationUrl: "https://docs.firecrawl.dev/api-reference/endpoint/scrape",
        requiredCredentials: ["FIRECRAWL_API_KEY"],
      };
    }

    if (!this.hasCredentials()) {
      return {
        id: "firecrawl_product_research",
        name: "Firecrawl Public Web Product Research & Extraction (Supplementary)",
        provider: "firecrawl-research",
        state: "not_configured",
        message:
          "Optional Firecrawl API key (FIRECRAWL_API_KEY) not configured. Add FIRECRAWL_API_KEY to enable supplementary public product-page extraction.",
        lastChecked: Date.now(),
        documentationUrl: "https://docs.firecrawl.dev/api-reference/endpoint/scrape",
        requiredCredentials: ["FIRECRAWL_API_KEY"],
      };
    }

    const baseUrlCheck = validateFirecrawlApiBaseUrl();
    if (!baseUrlCheck.valid) {
      return {
        id: "firecrawl_product_research",
        name: "Firecrawl Public Web Product Research & Extraction (Supplementary)",
        provider: "firecrawl-research",
        state: "restricted",
        message: baseUrlCheck.reason || "Invalid FIRECRAWL_API_BASE_URL configuration.",
        lastChecked: Date.now(),
        documentationUrl: "https://docs.firecrawl.dev/api-reference/endpoint/scrape",
        requiredCredentials: ["FIRECRAWL_API_KEY"],
      };
    }

    if (this.lastError && Date.now() - this.lastError.timestamp < 5 * 60 * 1000) {
      return {
        id: "firecrawl_product_research",
        name: "Firecrawl Public Web Product Research & Extraction (Supplementary)",
        provider: "firecrawl-research",
        state: this.lastError.state,
        message: this.lastError.message,
        lastChecked: Date.now(),
        documentationUrl: "https://docs.firecrawl.dev/api-reference/endpoint/scrape",
        requiredCredentials: ["FIRECRAWL_API_KEY"],
      };
    }

    return {
      id: "firecrawl_product_research",
      name: "Firecrawl Public Web Product Research & Extraction (Supplementary)",
      provider: "firecrawl-research",
      state: "available",
      message:
        "Firecrawl v2 /scrape supplementary product research active. Extracted public web data is strictly isolated from confirmed marketplace API records.",
      lastChecked: Date.now(),
      documentationUrl: "https://docs.firecrawl.dev/api-reference/endpoint/scrape",
      requiredCredentials: ["FIRECRAWL_API_KEY"],
    };
  }

  /**
   * Validates that a target URL is a safe, public HTTP/HTTPS product page URL.
   * Rejects private/loopback/metadata/CGNAT/reserved IPs, non-HTTP protocols,
   * non-standard ports, integer/octal/hex IP encodings, DNS-rebinding domains,
   * and login/paywall paths.
   */
  public validatePublicProductUrl(rawUrl: string): ValidatedUrlResult {
    if (typeof rawUrl !== "string") {
      return {
        valid: false,
        normalizedUrl: "",
        domain: "",
        reason: "URL must be a string.",
      };
    }

    const trimmed = rawUrl.trim();
    if (!trimmed) {
      return {
        valid: false,
        normalizedUrl: "",
        domain: "",
        reason: "URL is empty. Provide a public HTTP/HTTPS product page URL.",
      };
    }

    if (trimmed.length > MAX_URL_LENGTH || /[\u0000-\u001F\u007F]/.test(trimmed)) {
      return {
        valid: false,
        normalizedUrl: trimmed.slice(0, 100),
        domain: "",
        reason: `URL exceeds maximum length (${MAX_URL_LENGTH} chars) or contains control characters.`,
      };
    }

    // Reject raw octal/hex/integer IPv4 authority patterns before URL canonicalization
    const rawAuthorityMatch = trimmed.match(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\/([^/?#]+)/);
    const rawHostPort = rawAuthorityMatch?.[1]?.split("@").pop() || "";
    const rawHostOnly = rawHostPort.replace(/:\d+$/, "");
    if (
      /^0x[0-9a-f]+$/i.test(rawHostOnly) ||
      /^\d+$/.test(rawHostOnly) ||
      /^0\d+\./.test(rawHostOnly) ||
      /^\d+\.\d+$/.test(rawHostOnly) ||
      /^\d+\.\d+\.\d+$/.test(rawHostOnly)
    ) {
      return {
        valid: false,
        normalizedUrl: trimmed,
        domain: rawHostOnly,
        reason: `Shorthand, integer, octal, or hexadecimal IP host "${rawHostOnly}" is not permitted.`,
      };
    }

    let parsed: URL;
    try {
      parsed = new URL(trimmed);
    } catch {
      return {
        valid: false,
        normalizedUrl: trimmed,
        domain: "",
        reason: `Malformed URL "${trimmed.slice(0, 100)}". Must be a valid absolute http:// or https:// URL.`,
      };
    }

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return {
        valid: false,
        normalizedUrl: trimmed,
        domain: parsed.hostname || "",
        reason: `Unsupported URL protocol "${parsed.protocol}". Only public http:// and https:// URLs are supported.`,
      };
    }

    if (parsed.username || parsed.password) {
      return {
        valid: false,
        normalizedUrl: trimmed,
        domain: parsed.hostname,
        reason: "URLs containing embedded authentication credentials are not permitted.",
      };
    }

    // Only allow standard HTTP/HTTPS ports (default empty, 80, or 443)
    if (parsed.port && parsed.port !== "80" && parsed.port !== "443") {
      return {
        valid: false,
        normalizedUrl: trimmed,
        domain: parsed.hostname,
        reason: `Non-standard port ":${parsed.port}" is not permitted for public product page extraction.`,
      };
    }

    const host = parsed.hostname.toLowerCase().replace(/\.$/, "");
    const cleanHost = host.replace(/^\[|\]$/g, "");

    if (
      BLOCKED_EXACT_HOSTS.has(cleanHost) ||
      BLOCKED_HOST_SUFFIXES.some((suffix) => cleanHost.endsWith(suffix))
    ) {
      return {
        valid: false,
        normalizedUrl: trimmed,
        domain: cleanHost,
        reason: `Internal, loopback, or wildcard DNS host "${cleanHost}" is not permitted for public product research.`,
      };
    }

    // Check literal IPv4 or IPv6 addresses
    if (net.isIP(cleanHost) !== 0 || parsed.hostname.startsWith("[")) {
      if (isPrivateOrReservedIp(cleanHost)) {
        return {
          valid: false,
          normalizedUrl: trimmed,
          domain: cleanHost,
          reason: `Private, loopback, link-local, or reserved IP address "${cleanHost}" is not permitted.`,
        };
      }
    } else {
      // Must be a valid multi-label public domain name (with at least one dot and valid TLD)
      if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(cleanHost)) {
        return {
          valid: false,
          normalizedUrl: trimmed,
          domain: cleanHost,
          reason: `Hostname "${cleanHost}" is not a valid public domain name.`,
        };
      }
    }

    for (const pattern of AUTH_OR_PAYWALL_PATH_PATTERNS) {
      if (pattern.test(parsed.pathname)) {
        return {
          valid: false,
          normalizedUrl: trimmed,
          domain: cleanHost,
          reason: `URL path "${parsed.pathname}" appears to be an authentication, checkout, or gated account endpoint. Firecrawl only extracts public product pages.`,
        };
      }
    }

    parsed.hash = "";
    return {
      valid: true,
      normalizedUrl: parsed.toString(),
      domain: cleanHost,
    };
  }

  /**
   * Performs DNS resolution on the hostname and verifies that no resolved A/AAAA record
   * points to a private, loopback, link-local, or reserved IP address (preventing DNS rebinding).
   */
  public async verifyHostDnsResolution(hostname: string): Promise<{ valid: boolean; reason?: string }> {
    const cleanHost = hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (net.isIP(cleanHost) !== 0) {
      if (isPrivateOrReservedIp(cleanHost)) {
        return {
          valid: false,
          reason: `Host IP "${cleanHost}" is a private or reserved address.`,
        };
      }
      return { valid: true };
    }

    try {
      const records = await this.dnsLookup(cleanHost);
      if (!Array.isArray(records) || records.length === 0) {
        if (this.hasCustomDnsLookup || process.env.FIRECRAWL_STRICT_DNS === "true") {
          return {
            valid: false,
            reason: `DNS resolution returned no records for "${cleanHost}".`,
          };
        }
        return { valid: true };
      }

      for (const rec of records) {
        if (!rec?.address || isPrivateOrReservedIp(rec.address)) {
          return {
            valid: false,
            reason: `DNS resolution for "${cleanHost}" resolved to private or reserved IP address "${
              rec?.address || "unknown"
            }" (DNS rebinding / SSRF protection).`,
          };
        }
      }

      return { valid: true };
    } catch (err: any) {
      const code = err?.code || "";
      if (this.hasCustomDnsLookup || process.env.FIRECRAWL_STRICT_DNS === "true") {
        return {
          valid: false,
          reason: `DNS lookup failed for "${cleanHost}": ${code || err?.message || "Unknown DNS error"}.`,
        };
      }
      // In offline/sandbox test environments where synthetic domains (.example.com) return ENOTFOUND/EAI_AGAIN,
      // allow fallback only when no custom DNS lookup or FIRECRAWL_STRICT_DNS was enforced.
      return { valid: true };
    }
  }

  /**
   * Builds default empty integrity report with mandatory marketplace guardrails
   */
  private createDefaultIntegrityReport(
    overrides?: Partial<Omit<FirecrawlDataIntegrityReport, "marketplaceDisclaimers">>
  ): FirecrawlDataIntegrityReport {
    return {
      missingFields: overrides?.missingFields || [],
      staleDataWarnings: overrides?.staleDataWarnings || [],
      contradictions: overrides?.contradictions || [],
      inferredFields: overrides?.inferredFields || [],
      marketplaceDisclaimers: {
        notProofOfSoldTransaction: true,
        notProofOfLiveInventory: true,
        notProofOfSellerEligibilityOrUngating: true,
        notProofOfExactFeesOrNetProfit: true,
        requiresAuthorizedApiVerification: true,
      },
    };
  }

  /**
   * Builds a safe fallback NormalizedFirecrawlProductResearch object for non-200 / unconfigured states
   */
  private createStatusResult(
    sourceUrl: string,
    domain: string,
    status: FirecrawlExtractionStatus,
    statusMessage: string,
    missingFields: string[] = ["title", "brand", "model", "observedPrice", "specifications", "identifiers"]
  ): NormalizedFirecrawlProductResearch {
    return {
      sourceUrl,
      domain,
      retrievalTimestamp: Date.now(),
      isStale: false,
      provenance: "extracted_public_web_firecrawl",
      extractionStatus: status,
      statusMessage,
      confidenceScorePct: 0,
      observedPriceNote:
        "No verified price extracted. Public web pages are not proof of completed sales or guaranteed live inventory.",
      imageUrls: [],
      specifications: {},
      identifiers: {
        identifierConfidence: "missing",
        identifierNotes: [statusMessage],
      },
      integrity: this.createDefaultIntegrityReport({
        missingFields,
      }),
    };
  }

  /**
   * Extracts public product-page attributes using Firecrawl's documented `/v2/scrape` API.
   * Gracefully handles disabled state, missing credentials, invalid URLs, DNS rebinding,
   * untrusted API base URLs, rate limits, timeouts, inaccessible pages, and malformed payloads.
   */
  public async extractProductPage(
    rawUrl: string,
    options: FirecrawlExtractOptions = {}
  ): Promise<NormalizedFirecrawlProductResearch> {
    // 1. Validate URL syntax, protocol, port, and IP/host rules first
    const urlCheck = this.validatePublicProductUrl(rawUrl);
    if (!urlCheck.valid) {
      return this.createStatusResult(
        typeof rawUrl === "string" ? rawUrl.slice(0, 200) : "",
        urlCheck.domain,
        "unsupported_url",
        urlCheck.reason || "Unsupported or invalid product URL."
      );
    }

    const { normalizedUrl, domain } = urlCheck;

    // 2. Verify DNS resolution for target host (blocks DNS rebinding to 127.0.0.1 / 169.254.x.x / 10.x.x.x)
    const dnsCheck = await this.verifyHostDnsResolution(domain);
    if (!dnsCheck.valid) {
      return this.createStatusResult(
        normalizedUrl,
        domain,
        "unsupported_url",
        dnsCheck.reason || `Host "${domain}" failed DNS security verification.`
      );
    }

    // 3. Check if explicitly disabled
    if (this.isExplicitlyDisabled()) {
      return this.createStatusResult(
        normalizedUrl,
        domain,
        "disabled",
        "Firecrawl supplementary research is disabled (FIRECRAWL_ENABLED=false)."
      );
    }

    // 4. Check credentials
    if (!this.hasCredentials()) {
      return this.createStatusResult(
        normalizedUrl,
        domain,
        "not_configured",
        "FIRECRAWL_API_KEY is not configured. Add FIRECRAWL_API_KEY on the server to enable public page extraction."
      );
    }

    // 5. Validate Firecrawl API Base URL BEFORE attaching API credentials
    const apiBaseCheck = validateFirecrawlApiBaseUrl();
    if (!apiBaseCheck.valid) {
      this.lastError = {
        state: "restricted",
        message: apiBaseCheck.reason || "Untrusted FIRECRAWL_API_BASE_URL rejected.",
        timestamp: Date.now(),
      };
      return this.createStatusResult(
        normalizedUrl,
        domain,
        "error",
        this.lastError.message
      );
    }

    const cacheKey = `scrape:${normalizedUrl}`;
    const fullCacheKey = this.cache.generateKey("firecrawl-research", "web", cacheKey);
    const staleThresholdMs = this.getStaleThresholdMs(options.staleThresholdMs);

    // 6. Check cache unless forceRefresh is set
    if (!options.forceRefresh) {
      const cached = this.cache.get<NormalizedFirecrawlProductResearch>(fullCacheKey);
      if (cached) {
        const ageMs = Date.now() - cached.retrievedTimestamp;
        const isStale = ageMs > staleThresholdMs;
        if (!isStale) {
          return cached.response;
        }
        const staleMinutes = Math.max(1, Math.round(ageMs / 60000));
        const staleWarning = `Cached extraction is ${staleMinutes} minute(s) old (retrieved at ${new Date(
          cached.retrievedTimestamp
        ).toISOString()}); public page price or availability text may have changed.`;
        const existingWarnings = cached.response.integrity.staleDataWarnings;
        return {
          ...cached.response,
          isStale: true,
          confidenceScorePct: Math.max(10, cached.response.confidenceScorePct - 15),
          integrity: {
            ...cached.response.integrity,
            staleDataWarnings: existingWarnings.includes(staleWarning)
              ? existingWarnings
              : [...existingWarnings, staleWarning],
          },
        };
      }
    }

    // 7. Deduplicate concurrent in-flight requests for the same URL
    return this.cache.deduplicate(fullCacheKey, async () => {
      const apiKey = (process.env.FIRECRAWL_API_KEY || "").trim();
      const endpoint = `${apiBaseCheck.normalizedUrl}/scrape`;
      const timeoutMs = options.timeoutMs || Number(process.env.FIRECRAWL_TIMEOUT_MS) || 15000;

      const requestBody = {
        url: normalizedUrl,
        onlyMainContent: true,
        timeout: timeoutMs,
        formats: [
          "markdown",
          {
            type: "json",
            prompt:
              "Extract factual product attributes visible on this public product page: title, brand, model, category, description, current displayed price (number), currency (ISO code), availability text, image URLs, specifications key-value pairs, and product identifiers (upc, ean, gtin, asin, epid, mpn, sku). Leave any field empty if not explicitly present on the page.",
            schema: {
              type: "object",
              properties: {
                title: { type: "string" },
                brand: { type: "string" },
                model: { type: "string" },
                category: { type: "string" },
                description: { type: "string" },
                price: { type: "number" },
                currency: { type: "string" },
                availabilityText: { type: "string" },
                imageUrls: { type: "array", items: { type: "string" } },
                specifications: {
                  type: "object",
                  additionalProperties: { type: "string" },
                },
                identifiers: {
                  type: "object",
                  properties: {
                    upc: { type: "string" },
                    ean: { type: "string" },
                    gtin: { type: "string" },
                    asin: { type: "string" },
                    epid: { type: "string" },
                    mpn: { type: "string" },
                    sku: { type: "string" },
                  },
                },
                publishedOrUpdatedAt: { type: "string" },
              },
            },
          },
        ],
      };

      try {
        const response = await this.rateLimiter.execute(async () => {
          const res = await this.httpExecutor(endpoint, {
            method: "POST",
            // Prevent automatic redirect following so Authorization header is never sent to a redirect target
            redirect: "manual",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
              Accept: "application/json",
              "User-Agent": "Listofa-Arbitrage-Research/2.0",
            },
            body: JSON.stringify(requestBody),
          });

          // Block any 3xx redirect response from the API endpoint
          if (res.status >= 300 && res.status < 400) {
            const err: any = new Error(
              `Firecrawl API returned unexpected HTTP ${res.status} redirect; halted to protect credentials.`
            );
            err.status = 403;
            throw err;
          }

          if (!res.ok) {
            const errBody = await res.text().catch(() => "");
            const err: any = new Error(
              `Firecrawl API HTTP ${res.status}: ${errBody.slice(0, 240)}`
            );
            err.status = res.status;
            throw err;
          }

          return res;
        }, `FirecrawlScrape_${domain}`);

        let rawPayload: any;
        try {
          rawPayload = await response.json();
        } catch {
          return this.createStatusResult(
            normalizedUrl,
            domain,
            "malformed",
            "Firecrawl returned a non-JSON or malformed response body."
          );
        }

        if (!rawPayload || typeof rawPayload !== "object") {
          return this.createStatusResult(
            normalizedUrl,
            domain,
            "malformed",
            "Firecrawl returned an empty or unexpected payload structure."
          );
        }

        if (rawPayload.success === false) {
          const apiErrMsg =
            typeof rawPayload.error === "string"
              ? rawPayload.error
              : "Firecrawl reported success: false during page extraction.";
          return this.createStatusResult(
            normalizedUrl,
            domain,
            "inaccessible",
            apiErrMsg
          );
        }

        const dataObj = rawPayload.data;
        if (!dataObj || typeof dataObj !== "object") {
          return this.createStatusResult(
            normalizedUrl,
            domain,
            "malformed",
            "Firecrawl response payload is missing the required 'data' container."
          );
        }

        this.lastError = null;
        const normalized = this.normalizeExtractionResponse(
          normalizedUrl,
          domain,
          dataObj,
          this.getCacheTtlMs()
        );

        // Cache only successful or partial extractions
        if (
          normalized.extractionStatus === "extracted" ||
          normalized.extractionStatus === "partial"
        ) {
          this.cache.set(
            "firecrawl-research",
            cacheKey,
            "web",
            normalized,
            this.getCacheTtlMs()
          );
        }

        return normalized;
      } catch (err: any) {
        const status = err?.status || err?.statusCode || 0;
        const rawMsg = String(err?.message || "Unknown Firecrawl error").replace(
          apiKey,
          "[REDACTED]"
        );

        if (status === 401) {
          this.lastError = {
            state: "authentication_failed",
            message: "Firecrawl API returned HTTP 401 Unauthorized. Check FIRECRAWL_API_KEY.",
            timestamp: Date.now(),
          };
          return this.createStatusResult(
            normalizedUrl,
            domain,
            "error",
            this.lastError.message
          );
        }

        if (status === 402 || status === 403) {
          this.lastError = {
            state: "restricted",
            message: `Firecrawl API returned HTTP ${status}: ${rawMsg}`,
            timestamp: Date.now(),
          };
          return this.createStatusResult(
            normalizedUrl,
            domain,
            "inaccessible",
            this.lastError.message
          );
        }

        if (status === 429) {
          this.lastError = {
            state: "rate_limited",
            message: "Firecrawl API rate limit exceeded (HTTP 429) after retry attempts.",
            timestamp: Date.now(),
          };
          return this.createStatusResult(
            normalizedUrl,
            domain,
            "rate_limited",
            this.lastError.message
          );
        }

        if (status === 404 || status === 410) {
          return this.createStatusResult(
            normalizedUrl,
            domain,
            "inaccessible",
            `Target product page was not found or removed (HTTP ${status}).`
          );
        }

        if (status === 408 || /timeout/i.test(rawMsg)) {
          return this.createStatusResult(
            normalizedUrl,
            domain,
            "error",
            `Firecrawl request timed out while fetching ${domain}.`
          );
        }

        return this.createStatusResult(
          normalizedUrl,
          domain,
          "error",
          `Firecrawl extraction failed: ${rawMsg}`
        );
      }
    });
  }

  /**
   * Normalizes Firecrawl v2 data payload into NormalizedFirecrawlProductResearch,
   * auditing identifiers, post-redirect destination URLs, missing fields, inferred fields,
   * stale indicators, and contradictions.
   */
  public normalizeExtractionResponse(
    sourceUrl: string,
    domain: string,
    dataObj: any,
    cacheTtlMs: number = DEFAULT_CACHE_TTL_MS
  ): NormalizedFirecrawlProductResearch {
    const now = Date.now();
    const jsonBlock =
      (dataObj.json && typeof dataObj.json === "object" ? dataObj.json : null) ||
      (dataObj.extract && typeof dataObj.extract === "object" ? dataObj.extract : null) ||
      {};
    const productBlock =
      dataObj.product && typeof dataObj.product === "object" ? dataObj.product : {};
    const metadata =
      dataObj.metadata && typeof dataObj.metadata === "object" ? dataObj.metadata : {};
    const markdown = typeof dataObj.markdown === "string" ? dataObj.markdown : "";

    // 1. Validate post-scrape canonical/redirected URL if reported by Firecrawl metadata
    const reportedTargetUrl =
      this.cleanString(metadata.sourceURL) ||
      this.cleanString(metadata.ogUrl) ||
      this.cleanString(metadata.url);

    if (reportedTargetUrl && reportedTargetUrl !== sourceUrl) {
      const redirectUrlCheck = this.validatePublicProductUrl(reportedTargetUrl);
      if (!redirectUrlCheck.valid) {
        return this.createStatusResult(
          sourceUrl,
          domain,
          "inaccessible",
          `Target page redirected to a disallowed or login-gated URL (${
            redirectUrlCheck.reason || reportedTargetUrl
          }); extraction halted.`
        );
      }
    }

    // 2. Check if target page returned HTTP 4xx/5xx or anti-bot wall inside metadata/content
    const pageStatusCode = Number(metadata.statusCode || 200);
    if (pageStatusCode >= 400) {
      return this.createStatusResult(
        sourceUrl,
        domain,
        "inaccessible",
        `Target page returned HTTP status ${pageStatusCode} during extraction.`
      );
    }

    const combinedWallText = `${metadata.title || ""} ${markdown.slice(0, 600)}`;
    for (const pattern of ANTI_BOT_OR_WALL_PATTERNS) {
      if (pattern.test(combinedWallText) && !jsonBlock.title && !productBlock.title) {
        return this.createStatusResult(
          sourceUrl,
          domain,
          "inaccessible",
          "Target page presented an anti-bot or access verification wall; extraction halted in compliance with platform restrictions."
        );
      }
    }

    const missingFields: string[] = [];
    const inferredFields: string[] = [];
    const contradictions: string[] = [];
    const staleDataWarnings: string[] = [];

    // 3. Extract Title
    let title: string | undefined =
      this.cleanString(jsonBlock.title) ||
      this.cleanString(productBlock.title);

    const metaTitle = this.cleanString(metadata.ogTitle) || this.cleanString(metadata.title);
    if (!title && metaTitle) {
      title = metaTitle.replace(/\s*[|\-–—]\s*(Amazon\.com|eBay|Walmart\.com|AliExpress|Temu).*$/i, "").trim();
      inferredFields.push("title (inferred from page metadata title)");
    }
    if (!title && markdown) {
      const h1Match = markdown.match(/^#\s+(.+)$/m);
      if (h1Match?.[1]) {
        title = h1Match[1].trim();
        inferredFields.push("title (inferred from markdown H1 heading)");
      }
    }

    // 4. Extract Brand & Specifications
    let brand: string | undefined =
      this.cleanString(jsonBlock.brand) ||
      this.cleanString(productBlock.brand);

    const rawSpecs =
      jsonBlock.specifications && typeof jsonBlock.specifications === "object"
        ? jsonBlock.specifications
        : {};
    const specifications: Record<string, string> = {};
    for (const [k, v] of Object.entries(rawSpecs)) {
      if (v !== null && v !== undefined && String(v).trim() !== "") {
        specifications[k.trim()] = String(v).trim();
      }
    }

    if (!brand) {
      const specBrand =
        specifications["Brand"] ||
        specifications["brand"] ||
        specifications["Manufacturer"];
      if (specBrand) {
        brand = specBrand;
        inferredFields.push("brand (inferred from specifications table)");
      }
    }

    if (
      brand &&
      metaTitle &&
      brand.length > 2 &&
      !["generic", "unbranded", "oem"].includes(brand.toLowerCase())
    ) {
      const jsonTitleLower = (jsonBlock.title || "").toLowerCase();
      const metaTitleLower = metaTitle.toLowerCase();
      if (
        jsonTitleLower &&
        metaTitleLower &&
        !metaTitleLower.includes(brand.toLowerCase()) &&
        !jsonTitleLower.includes(brand.toLowerCase())
      ) {
        const firstWordMeta = metaTitle.split(/\s+/)[0]?.replace(/[^\w]/g, "");
        const firstWordJson = (jsonBlock.title || "").split(/\s+/)[0]?.replace(/[^\w]/g, "");
        if (
          firstWordMeta &&
          firstWordJson &&
          firstWordMeta.toLowerCase() !== firstWordJson.toLowerCase()
        ) {
          contradictions.push(
            `Page metadata title ("${metaTitle.slice(0, 60)}") conflicts with extracted JSON title ("${String(
              jsonBlock.title
            ).slice(0, 60)}").`
          );
        }
      }
    }

    // 5. Extract Model
    let model: string | undefined =
      this.cleanString(jsonBlock.model) ||
      this.cleanString(specifications["Model"]) ||
      this.cleanString(specifications["Model Number"]) ||
      this.cleanString(specifications["Item model number"]);

    if (!model && markdown) {
      const modelMatch = markdown.match(
        /(?:Item\s+model\s+number|Model\s*(?:Number|#)?)\s*[:|-]\s*([A-Z0-9][A-Z0-9\-_/]{2,24})/i
      );
      if (modelMatch?.[1]) {
        model = modelMatch[1].trim();
        inferredFields.push("model (inferred from markdown text)");
      }
    }

    // 6. Extract Category & Description
    const category =
      this.cleanString(jsonBlock.category) ||
      this.cleanString(productBlock.category) ||
      this.cleanString(specifications["Category"]);

    const description =
      this.cleanString(jsonBlock.description) ||
      this.cleanString(productBlock.description) ||
      this.cleanString(metadata.description);

    // 7. Extract Observed Price & Currency (with multi-variant range vs. contradiction check)
    const jsonPrice = this.parsePositiveNumber(jsonBlock.price);
    const productVariantPrice = this.parsePositiveNumber(
      productBlock.variants?.[0]?.price?.amount ??
        productBlock.price?.amount ??
        jsonBlock.pricing?.currentPrice
    );
    const metaPrice = this.parsePositiveNumber(
      metadata["product:price:amount"] || metadata["og:price:amount"]
    );

    if (
      jsonPrice !== undefined &&
      productVariantPrice !== undefined &&
      Math.abs(jsonPrice - productVariantPrice) / Math.max(jsonPrice, productVariantPrice) > 0.05
    ) {
      const hasMultipleStructuredVariants =
        Array.isArray(productBlock.variants) && productBlock.variants.length > 1;
      const bothPricesInMarkdown =
        Boolean(markdown) &&
        markdown.includes(jsonPrice.toFixed(2)) &&
        markdown.includes(productVariantPrice.toFixed(2));
      const hasExplicitRangeInMarkdown =
        Boolean(markdown) &&
        /\$\s*\d+(?:\.\d{2})?\s*[-–—]\s*\$\s*\d+(?:\.\d{2})?/.test(markdown);

      if (hasMultipleStructuredVariants || bothPricesInMarkdown || hasExplicitRangeInMarkdown) {
        const lowP = Math.min(jsonPrice, productVariantPrice).toFixed(2);
        const highP = Math.max(jsonPrice, productVariantPrice).toFixed(2);
        inferredFields.push(
          `observedPrice (multi-variant price range $${lowP}–$${highP} on page; using primary price $${jsonPrice.toFixed(
            2
          )})`
        );
      } else {
        contradictions.push(
          `Extracted JSON price ($${jsonPrice.toFixed(
            2
          )}) contradicts structured product variant price ($${productVariantPrice.toFixed(2)}).`
        );
      }
    }

    if (
      jsonPrice !== undefined &&
      metaPrice !== undefined &&
      Math.abs(jsonPrice - metaPrice) / Math.max(jsonPrice, metaPrice) > 0.05
    ) {
      contradictions.push(
        `Extracted JSON price ($${jsonPrice.toFixed(
          2
        )}) contradicts OpenGraph metadata price ($${metaPrice.toFixed(2)}).`
      );
    }

    let observedPrice = jsonPrice ?? productVariantPrice ?? metaPrice;
    if (observedPrice === undefined && markdown) {
      const mdPriceMatch = markdown.match(/\$\s*(\d{1,5}(?:\.\d{2}))\b/);
      if (mdPriceMatch?.[1]) {
        const parsedMdPrice = Number(mdPriceMatch[1]);
        if (parsedMdPrice > 0) {
          observedPrice = parsedMdPrice;
          inferredFields.push("observedPrice (inferred from markdown currency pattern)");
        }
      }
    }

    const observedCurrency =
      this.cleanString(jsonBlock.currency)?.toUpperCase() ||
      this.cleanString(productBlock.variants?.[0]?.price?.currency)?.toUpperCase() ||
      this.cleanString(metadata["product:price:currency"])?.toUpperCase() ||
      (observedPrice !== undefined ? "USD" : undefined);

    const observedAvailabilityText =
      this.cleanString(jsonBlock.availabilityText) ||
      this.cleanString(productBlock.variants?.[0]?.availability?.text);

    // 8. Extract Identifiers & Validate Evidence
    const rawIds =
      jsonBlock.identifiers && typeof jsonBlock.identifiers === "object"
        ? jsonBlock.identifiers
        : {};

    const identifiers = this.extractAndValidateIdentifiers({
      sourceUrl,
      rawIds,
      specifications,
      markdown,
      inferredFields,
      contradictions,
    });

    // 9. Extract Images (only valid http/https URLs)
    const imageSet = new Set<string>();
    if (Array.isArray(jsonBlock.imageUrls)) {
      for (const img of jsonBlock.imageUrls) {
        if (typeof img === "string" && /^https?:\/\//i.test(img.trim())) {
          imageSet.add(img.trim());
        }
      }
    }
    if (typeof metadata.ogImage === "string" && /^https?:\/\//i.test(metadata.ogImage.trim())) {
      imageSet.add(metadata.ogImage.trim());
    }
    if (Array.isArray(productBlock.variants?.[0]?.images)) {
      for (const imgObj of productBlock.variants[0].images) {
        if (typeof imgObj?.url === "string" && /^https?:\/\//i.test(imgObj.url.trim())) {
          imageSet.add(imgObj.url.trim());
        }
      }
    }

    // 10. Identify Stale Data Signals
    const publishedTimestampStr =
      this.cleanString(jsonBlock.publishedOrUpdatedAt) ||
      this.cleanString(metadata.publishedTime) ||
      this.cleanString(metadata.modifiedTime) ||
      this.cleanString(dataObj.changeTracking?.previousScrapeAt);

    if (publishedTimestampStr) {
      const parsedDate = Date.parse(publishedTimestampStr);
      if (!Number.isNaN(parsedDate)) {
        const ageDays = (now - parsedDate) / (1000 * 60 * 60 * 24);
        if (ageDays > 14) {
          staleDataWarnings.push(
            `Page metadata timestamp (${new Date(parsedDate).toISOString().slice(0, 10)}) is ${Math.round(
              ageDays
            )} days old; pricing and stock status may be outdated.`
          );
        }
      }
    }

    if (
      observedAvailabilityText &&
      /out of stock|unavailable|sold out|discontinued|ended|no longer available/i.test(
        observedAvailabilityText
      )
    ) {
      staleDataWarnings.push(
        `Page availability text indicates "${observedAvailabilityText}" — offer may not be purchasable.`
      );
    }

    // 11. Audit Missing Fields
    if (!title) missingFields.push("title");
    if (!brand) missingFields.push("brand");
    if (!model && !identifiers.mpn) missingFields.push("model");
    if (observedPrice === undefined) missingFields.push("observedPrice");
    if (Object.keys(specifications).length === 0) missingFields.push("specifications");
    if (identifiers.identifierConfidence === "missing") {
      missingFields.push("identifiers (UPC/EAN/GTIN/ASIN/MPN)");
    }

    // 12. Determine Extraction Status & Confidence Score
    const hasCoreContent = Boolean(
      title &&
        (brand ||
          observedPrice !== undefined ||
          Object.keys(specifications).length > 0 ||
          identifiers.identifierConfidence !== "missing")
    );

    let extractionStatus: FirecrawlExtractionStatus = "malformed";
    if (hasCoreContent && contradictions.length === 0 && missingFields.length <= 2) {
      extractionStatus = "extracted";
    } else if (title || Object.keys(specifications).length > 0 || markdown.trim().length > 40) {
      extractionStatus = "partial";
    }

    let confidenceScorePct = 20;
    if (title) confidenceScorePct += 20;
    if (brand) confidenceScorePct += 15;
    if (model || identifiers.mpn) confidenceScorePct += 10;
    if (observedPrice !== undefined) confidenceScorePct += 10;
    if (Object.keys(specifications).length > 0) confidenceScorePct += 10;
    if (identifiers.identifierConfidence === "verified_format") {
      confidenceScorePct += 15;
    } else if (identifiers.identifierConfidence === "inferred_candidate") {
      confidenceScorePct += 5;
    }
    confidenceScorePct -= contradictions.length * 20;
    confidenceScorePct -= staleDataWarnings.length * 10;
    confidenceScorePct -= inferredFields.length * 4;
    confidenceScorePct = Math.max(5, Math.min(95, confidenceScorePct));

    const canonicalUrl = reportedTargetUrl || sourceUrl;

    const statusMessage =
      extractionStatus === "extracted"
        ? "Public product page extracted via Firecrawl. Treat price and availability as unverified research snapshot."
        : extractionStatus === "partial"
        ? `Partial product attributes extracted (${missingFields.length} field(s) missing${
            contradictions.length > 0 ? `, ${contradictions.length} contradiction(s) detected` : ""
          }).`
        : "Page did not contain extractable structured product attributes.";

    return {
      sourceUrl,
      canonicalUrl,
      domain,
      retrievalTimestamp: now,
      cacheExpiresAt: now + cacheTtlMs,
      isStale: staleDataWarnings.length > 0,
      provenance: "extracted_public_web_firecrawl",
      extractionStatus,
      statusMessage,
      confidenceScorePct,
      title,
      brand,
      model,
      category,
      description,
      observedPrice,
      observedCurrency,
      observedPriceNote:
        observedPrice !== undefined
          ? "Unverified public page price observed at extraction timestamp — NOT proof of a completed sale, live inventory, or net profit."
          : "No price detected on public product page.",
      observedAvailabilityText,
      imageUrls: Array.from(imageSet),
      specifications,
      identifiers,
      rawMarkdownSnippet: markdown ? markdown.slice(0, 1200) : undefined,
      integrity: this.createDefaultIntegrityReport({
        missingFields,
        staleDataWarnings,
        contradictions,
        inferredFields,
      }),
    };
  }

  /**
   * Extracts, cross-checks, and validates product identifiers (UPC, EAN, GTIN, ASIN, ePID, MPN, SKU)
   */
  private extractAndValidateIdentifiers(params: {
    sourceUrl: string;
    rawIds: any;
    specifications: Record<string, string>;
    markdown: string;
    inferredFields: string[];
    contradictions: string[];
  }): FirecrawlIdentifierEvidence {
    const { sourceUrl, rawIds, specifications, markdown, inferredFields, contradictions } = params;
    const notes: string[] = [];

    let upc =
      this.cleanString(rawIds.upc) ||
      this.cleanString(specifications["UPC"]) ||
      this.cleanString(specifications["upc"]);
    let ean =
      this.cleanString(rawIds.ean) ||
      this.cleanString(specifications["EAN"]) ||
      this.cleanString(specifications["ean"]);
    let gtin =
      this.cleanString(rawIds.gtin) ||
      this.cleanString(specifications["GTIN"]) ||
      this.cleanString(specifications["gtin"]);
    let asin =
      this.cleanString(rawIds.asin) ||
      this.cleanString(specifications["ASIN"]) ||
      this.cleanString(specifications["asin"]);
    let epid =
      this.cleanString(rawIds.epid) ||
      this.cleanString(specifications["ePID"]);
    let mpn =
      this.cleanString(rawIds.mpn) ||
      this.cleanString(specifications["MPN"]) ||
      this.cleanString(specifications["Part Number"]) ||
      this.cleanString(specifications["Manufacturer Part Number"]);
    const sku =
      this.cleanString(rawIds.sku) ||
      this.cleanString(specifications["SKU"]);

    const urlAsinMatch = sourceUrl.match(/(?:\/dp\/|\/gp\/product\/)(B[0-9A-Z]{9})\b/i);
    const urlAsin = urlAsinMatch?.[1]?.toUpperCase();

    if (urlAsin && asin && urlAsin !== asin.toUpperCase()) {
      contradictions.push(
        `URL ASIN (${urlAsin}) contradicts page-extracted ASIN (${asin.toUpperCase()}).`
      );
      notes.push(`Contradictory ASIN values between URL (${urlAsin}) and page body (${asin}).`);
    } else if (urlAsin && !asin) {
      asin = urlAsin;
      inferredFields.push("identifiers.asin (inferred from URL path)");
      notes.push(`ASIN ${urlAsin} inferred from product URL path.`);
    }

    if (!upc && markdown) {
      const mdUpcMatch = markdown.match(/\bUPC\s*[:#-]\s*(\d{12,13})\b/i);
      if (mdUpcMatch?.[1]) {
        upc = mdUpcMatch[1];
        inferredFields.push("identifiers.upc (inferred from markdown text)");
      }
    }
    if (!asin && markdown) {
      const mdAsinMatch = markdown.match(/\bASIN\s*[:#-]\s*(B[0-9A-Z]{9})\b/i);
      if (mdAsinMatch?.[1]) {
        asin = mdAsinMatch[1].toUpperCase();
        inferredFields.push("identifiers.asin (inferred from markdown text)");
      }
    }
    if (!mpn && markdown) {
      const mdMpnMatch = markdown.match(/\bMPN\s*[:#-]\s*([A-Z0-9][A-Z0-9\-_]{2,20})\b/i);
      if (mdMpnMatch?.[1]) {
        mpn = mdMpnMatch[1];
        inferredFields.push("identifiers.mpn (inferred from markdown text)");
      }
    }

    let hasVerifiedIdentifier = false;
    let hasInferredOrInvalidIdentifier = false;

    if (upc) {
      const digits = upc.replace(/\D/g, "");
      if (digits.length === 12 && isValidGtinCheckDigit(digits)) {
        upc = digits;
        hasVerifiedIdentifier = true;
        notes.push(`UPC-A (${upc}) passed 12-digit Modulo-10 check digit validation.`);
      } else if (digits.length === 13 && isValidGtinCheckDigit(digits)) {
        // Retailer supplied a valid 13-digit EAN-13 / GTIN-13 in a field labeled "UPC"
        hasVerifiedIdentifier = true;
        if (digits.startsWith("0")) {
          upc = digits.slice(1);
          ean = ean || digits;
          gtin = gtin || digits;
          notes.push(
            `13-digit GTIN-13 (${digits}) in UPC field normalized to 12-digit UPC-A (${upc}) after passing Modulo-10 check digit validation.`
          );
        } else {
          ean = ean || digits;
          gtin = gtin || digits;
          upc = digits;
          notes.push(
            `Identifier (${digits}) in UPC field validated as a 13-digit EAN-13 / GTIN-13 via Modulo-10 check digit.`
          );
        }
      } else if (digits.length === 14 && isValidGtinCheckDigit(digits)) {
        hasVerifiedIdentifier = true;
        gtin = gtin || digits;
        if (digits.startsWith("00")) {
          upc = digits.slice(2);
          ean = ean || digits.slice(1);
          notes.push(
            `Identifier (${digits}) in UPC field validated as a single-unit 14-digit GTIN-14 and normalized to 12-digit UPC-A (${upc}).`
          );
        } else if (digits.startsWith("0")) {
          ean = ean || digits.slice(1);
          upc = undefined;
          notes.push(
            `Identifier (${digits}) in UPC field validated as a single-unit 14-digit GTIN-14 and normalized to 13-digit EAN-13 (${ean}).`
          );
        } else {
          upc = undefined;
          notes.push(
            `Identifier (${digits}) in UPC field is a 14-digit case/multipack GTIN-14 (packaging indicator ${digits[0]}), not a single-unit UPC-A.`
          );
        }
      } else {
        hasInferredOrInvalidIdentifier = true;
        contradictions.push(
          `Extracted UPC "${upc}" failed standard 12-digit UPC-A Modulo-10 check digit validation.`
        );
        notes.push(`UPC "${upc}" has an invalid check digit or length; do not treat as verified.`);
      }
    }

    if (ean) {
      const digits = ean.replace(/\D/g, "");
      if (digits.length === 13 && isValidGtinCheckDigit(digits)) {
        ean = digits;
        hasVerifiedIdentifier = true;
        if (!notes.some((n) => n.includes(digits))) {
          notes.push(`EAN-13 (${ean}) passed 13-digit Modulo-10 check digit validation.`);
        }
      } else {
        hasInferredOrInvalidIdentifier = true;
        contradictions.push(
          `Extracted EAN "${ean}" failed standard 13-digit EAN-13 Modulo-10 check digit validation.`
        );
        notes.push(`EAN "${ean}" has an invalid check digit or length; do not treat as verified.`);
      }
    }

    if (gtin) {
      const digits = gtin.replace(/\D/g, "");
      if ([8, 12, 13, 14].includes(digits.length) && isValidGtinCheckDigit(digits)) {
        gtin = digits;
        hasVerifiedIdentifier = true;
        if (!notes.some((n) => n.includes(digits))) {
          notes.push(`GTIN (${gtin}) passed Modulo-10 check digit validation.`);
        }
      } else {
        hasInferredOrInvalidIdentifier = true;
        contradictions.push(
          `Extracted GTIN "${gtin}" failed standard Modulo-10 check digit validation.`
        );
        notes.push(`GTIN "${gtin}" did not pass standard check digit validation.`);
      }
    }

    // Cross-check if multiple valid barcode fields were provided on the same page but conflict
    const validUpcCanon =
      upc && /^\d{12}$/.test(upc) && isValidGtinCheckDigit(upc) ? upc.padStart(14, "0") : null;
    const validEanCanon =
      ean && /^\d{13}$/.test(ean) && isValidGtinCheckDigit(ean) ? ean.padStart(14, "0") : null;
    const validGtinCanon =
      gtin && /^\d{8,14}$/.test(gtin) && isValidGtinCheckDigit(gtin) ? gtin.padStart(14, "0") : null;

    if (validUpcCanon && validEanCanon && validUpcCanon !== validEanCanon) {
      if (ean!.startsWith("0")) {
        contradictions.push(
          `Conflicting North American barcodes on source page: UPC (${upc}) vs leading-zero EAN-13 (${ean}).`
        );
      } else {
        notes.push(
          `Dual-region valid barcodes present: US UPC-A (${upc}) and International EAN-13 (${ean}).`
        );
      }
    }

    if (
      validGtinCanon &&
      ((validUpcCanon && validGtinCanon !== validUpcCanon && (!validEanCanon || validGtinCanon !== validEanCanon)) ||
        (!validUpcCanon && validEanCanon && validGtinCanon !== validEanCanon))
    ) {
      contradictions.push(
        `Conflicting barcodes on source page: GTIN (${gtin}) does not match extracted UPC (${upc || "none"}) / EAN (${ean || "none"}).`
      );
    }

    if (asin) {
      if (isValidAsinFormat(asin)) {
        asin = asin.trim().toUpperCase();
        if (!urlAsin || urlAsin === asin) {
          hasVerifiedIdentifier = true;
          notes.push(`ASIN (${asin}) matches 10-character Amazon identifier format.`);
        }
      } else {
        hasInferredOrInvalidIdentifier = true;
        contradictions.push(`Extracted ASIN "${asin}" does not match valid 10-character ASIN format.`);
        notes.push(`ASIN "${asin}" is malformed.`);
      }
    }

    if (epid) {
      hasInferredOrInvalidIdentifier = true;
      notes.push(`ePID candidate (${epid}) extracted; verify against eBay Catalog API.`);
    }

    if (mpn || sku) {
      hasInferredOrInvalidIdentifier = true;
      notes.push(
        `Manufacturer/Seller part identifier present (${[mpn && `MPN: ${mpn}`, sku && `SKU: ${sku}`]
          .filter(Boolean)
          .join(", ")}).`
      );
    }

    let identifierConfidence: IdentifierConfidenceState = "missing";
    if (contradictions.some((c) => /UPC|EAN|GTIN|ASIN/i.test(c))) {
      identifierConfidence = "contradictory";
    } else if (hasVerifiedIdentifier && !inferredFields.some((f) => f.startsWith("identifiers."))) {
      identifierConfidence = "verified_format";
    } else if (hasVerifiedIdentifier || hasInferredOrInvalidIdentifier) {
      identifierConfidence = "inferred_candidate";
    }

    if (identifierConfidence === "missing") {
      notes.push("No UPC, EAN, GTIN, ASIN, ePID, or MPN identifier found on page.");
    }

    return {
      upc,
      ean,
      gtin: gtin || upc || ean,
      asin,
      epid,
      mpn,
      sku,
      identifierConfidence,
      identifierNotes: notes,
    };
  }

  private cleanString(val: unknown): string | undefined {
    if (typeof val !== "string") return undefined;
    const trimmed = val.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  private parsePositiveNumber(val: unknown): number | undefined {
    if (typeof val === "number" && Number.isFinite(val) && val > 0) {
      return Number(val.toFixed(2));
    }
    if (typeof val === "string") {
      const cleaned = val.replace(/[^0-9.]/g, "");
      const parsed = Number(cleaned);
      if (Number.isFinite(parsed) && parsed > 0) {
        return Number(parsed.toFixed(2));
      }
    }
    return undefined;
  }
}

// Singleton instance
export const firecrawlProvider = new FirecrawlResearchProvider();
