import { lookupAll } from "@/lib/security/doh";
import { isIP, isIPv4, isIPv6 } from "@/lib/security/ip";

/**
 * SSRF defence for the URL-fetching backend (blueprint §8, OWASP guidance).
 *
 * Rules enforced here:
 *  - only http/https schemes are ever considered
 *  - literal IPs, hostnames and *resolved* addresses must all be public
 *  - cloud metadata endpoints and internal TLDs are rejected by name
 *  - redirects are followed manually and every hop is re-validated
 */

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata",
  "metadata.google.internal",
  "instance-data",
  "ip6-localhost",
  "ip6-loopback",
]);

const BLOCKED_SUFFIXES = [
  ".local",
  ".internal",
  ".localhost",
  ".lan",
  ".home",
  ".corp",
  ".intranet",
  ".google.internal",
];

export function isPrivateAddress(ip: string): boolean {
  if (isIPv4(ip)) {
    const parts = ip.split(".").map((n) => Number.parseInt(n, 10));
    if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
    const [a, b] = parts;
    if (a === 0) return true; // 0.0.0.0/8 "this network"
    if (a === 10) return true; // RFC1918
    if (a === 127) return true; // loopback
    if (a === 169 && b === 254) return true; // link-local / cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true; // RFC1918
    if (a === 192 && b === 0) return true; // IETF protocol assignments + 192.168/16 below
    if (a === 192 && b === 168) return true; // RFC1918
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a >= 224) return true; // multicast + reserved
    return false;
  }
  if (isIPv6(ip)) {
    const lower = ip.toLowerCase();
    if (lower === "::" || lower === "::1") return true;
    if (lower.startsWith("fe80")) return true; // link-local
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // unique local
    if (lower.startsWith("ff")) return true; // multicast
    // IPv4-mapped ::ffff:10.0.0.1
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]);
    return false;
  }
  return true;
}

export function hostnameLooksInternal(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, "");
  if (BLOCKED_HOSTNAMES.has(h)) return true;
  if (BLOCKED_SUFFIXES.some((s) => h.endsWith(s))) return true;
  if (isIP(h) && isPrivateAddress(h)) return true;
  if (!h.includes(".") && !isIP(h)) return true; // bare label = internal host
  return false;
}

export interface UrlParseResult {
  ok: boolean;
  url?: URL;
  reason?: string;
}

export function parseUntrustedUrl(raw: string): UrlParseResult {
  let candidate = raw.trim();
  if (!candidate) return { ok: false, reason: "Empty input" };
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(candidate)) candidate = `https://${candidate}`;

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return { ok: false, reason: "Not a parseable URL" };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, reason: `Scheme "${parsed.protocol}" is not permitted (http/https only)` };
  }
  const host = parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!host) return { ok: false, reason: "URL has no hostname" };
  if (hostnameLooksInternal(host)) {
    return { ok: false, reason: "Host resolves to a private, loopback or internal address" };
  }
  if (parsed.username || parsed.password) {
    return { ok: false, reason: "Credentials embedded in URL are not permitted" };
  }
  return { ok: true, url: parsed };
}

/** Resolves a hostname and confirms every returned address is public. */
export async function assertPublicResolution(
  hostname: string,
): Promise<{ ok: boolean; addresses: string[]; reason?: string }> {
  if (isIP(hostname)) {
    return isPrivateAddress(hostname)
      ? { ok: false, addresses: [hostname], reason: "Literal private IP address" }
      : { ok: true, addresses: [hostname] };
  }
  try {
    const addresses = await lookupAll(hostname);
    if (!addresses.length) {
      return { ok: false, addresses: [], reason: "Hostname did not resolve" };
    }
    const bad = addresses.find((a) => isPrivateAddress(a));
    if (bad) {
      return {
        ok: false,
        addresses,
        reason: `DNS rebinding guard: ${hostname} resolved to private address ${bad}`,
      };
    }
    return { ok: true, addresses };
  } catch (error) {
    return {
      ok: false,
      addresses: [],
      reason: `DNS resolution failed (${(error as Error).message})`,
    };
  }
}

export interface SafeFetchOptions {
  maxRedirects?: number;
  timeoutMs?: number;
  maxBytes?: number;
  headers?: Record<string, string>;
}

export interface SafeFetchResult {
  ok: boolean;
  status?: number;
  body?: string;
  finalUrl?: string;
  headers?: Record<string, string>;
  reason?: string;
  bytes?: number;
  redirectChain?: string[];
}

/**
 * Fetches an untrusted URL with scheme, private-IP and redirect validation.
 * Returns a structured result instead of throwing so callers can log the
 * blocked attempt as evidence.
 */
export async function safeFetch(
  raw: string,
  options: SafeFetchOptions = {},
): Promise<SafeFetchResult> {
  const {
    maxRedirects = 3,
    timeoutMs = 8000,
    maxBytes = 512 * 1024,
    headers = {},
  } = options;

  const parsed = parseUntrustedUrl(raw);
  if (!parsed.ok || !parsed.url) return { ok: false, reason: parsed.reason };

  const chain: string[] = [];
  let current = parsed.url;

  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    const resolution = await assertPublicResolution(current.hostname);
    if (!resolution.ok) {
      return { ok: false, reason: resolution.reason, redirectChain: chain };
    }
    chain.push(current.toString());

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(current.toString(), {
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "user-agent":
            "Mozilla/5.0 (compatible; SG16-Identifier/1.0; +https://sg16identifier.com/bot)",
          accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.5",
          ...headers,
        },
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) {
          return { ok: true, status: response.status, finalUrl: current.toString(), redirectChain: chain };
        }
        const next = parseUntrustedUrl(new URL(location, current).toString());
        if (!next.ok || !next.url) {
          return {
            ok: false,
            status: response.status,
            reason: `Redirect to disallowed target: ${next.reason}`,
            redirectChain: chain,
          };
        }
        current = next.url;
        continue;
      }

      const buffer = await response.arrayBuffer();
      const slice = buffer.byteLength > maxBytes ? buffer.slice(0, maxBytes) : buffer;
      return {
        ok: true,
        status: response.status,
        finalUrl: current.toString(),
        redirectChain: chain,
        bytes: buffer.byteLength,
        body: new TextDecoder("utf-8").decode(slice),
        headers: Object.fromEntries(response.headers.entries()),
      };
    } catch (error) {
      const message = (error as Error).message ?? "network error";
      return {
        ok: false,
        reason: message.includes("aborted") ? `Timed out after ${timeoutMs}ms` : message,
        redirectChain: chain,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  return { ok: false, reason: `Too many redirects (>${maxRedirects})`, redirectChain: chain };
}
