import { constantTimeEqual } from "@/lib/security/compare";
import { sha256Hex } from "@/lib/utils";
import { getFlagStates } from "@/lib/db/reports";
import { POLICIES, budgetExhausted, consumeRateLimit, noteBudgetBlock } from "@/lib/security/rate-limit";
import { setting } from "@/lib/settings";

/**
 * HTTP edge of the Vitex universal API: who may call it, from which browser
 * origins, how often, and how its errors look.
 *
 * Closed by default. Without VITEX_GATEWAY_KEYS nobody can call it: an open
 * gateway would let anyone spend the operator's provider credit. Keys are
 * accepted in the header each client SDK already uses (OpenAI, Anthropic,
 * Azure, Google) and never in the URL, where they would reach access logs.
 */

export function gatewayKeys(): string[] {
  return (setting("VITEX_GATEWAY_KEYS") ?? "")
    .split(/[\s,]+/)
    .map((k) => k.trim())
    .filter((k) => k.length >= 16);
}

export function gatewayEnabled(): boolean {
  return gatewayKeys().length > 0;
}

/** Headers that may carry the gateway key, in order. x-vitex-key leaves Authorization free for the caller's own target credentials. */
const KEY_HEADERS = ["x-vitex-key", "authorization", "x-api-key", "api-key", "x-goog-api-key"] as const;

/** Which header carried the gateway key, or null when none did. */
export function gatewayKeyHeader(request: Request): (typeof KEY_HEADERS)[number] | null {
  return KEY_HEADERS.find((name) => request.headers.get(name)?.trim()) ?? null;
}

function presentedKey(request: Request): string {
  const header = gatewayKeyHeader(request);
  if (!header) return "";
  const value = request.headers.get(header)!.trim();
  return header === "authorization" ? (/^Bearer\s+(.+)$/i.exec(value)?.[1] ?? "").trim() : value;
}

/** Constant-time match against every configured key; returns a stable, non-secret principal id. */
async function matchKey(supplied: string): Promise<string | null> {
  if (!supplied) return null;
  let matched: string | null = null;
  for (const key of gatewayKeys()) {
    if (constantTimeEqual(supplied, key)) matched = key;
  }
  return matched ? `key_${(await sha256Hex(matched)).slice(0, 16)}` : null;
}

/* ---------------------------------- CORS ---------------------------------- */

const ALLOWED_HEADERS = [
  "authorization", "content-type", "accept", "x-api-key", "api-key", "x-goog-api-key", "anthropic-version", "x-request-id",
  "x-vitex-key", "x-vitex-base-url", "x-vitex-api-key", "x-vitex-auth-header", "x-vitex-auth-scheme", "x-vitex-target",
].join(", ");
const EXPOSED_HEADERS = "x-request-id, x-vitex-provider, x-vitex-model, x-vitex-upstream, x-vitex-target, retry-after";

/** CORS for browser clients, per VITEX_CORS_ORIGINS ("*" or a comma list). Unset: server-to-server only. */
export function corsHeaders(request: Request): Record<string, string> {
  const configured = (setting("VITEX_CORS_ORIGINS") ?? "").split(",").map((o) => o.trim()).filter(Boolean);
  const origin = request.headers.get("origin");
  if (!configured.length || !origin) return {};
  const allowAll = configured.includes("*");
  if (!allowAll && !configured.includes(origin)) return {};
  return {
    "access-control-allow-origin": allowAll ? "*" : origin,
    "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS",
    "access-control-allow-headers": ALLOWED_HEADERS,
    "access-control-expose-headers": EXPOSED_HEADERS,
    "access-control-max-age": "600",
    ...(allowAll ? {} : { vary: "origin" }),
  };
}

export function preflight(request: Request): Response {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

/* --------------------------------- errors --------------------------------- */

export function errorResponse(
  request: Request,
  status: number,
  message: string,
  type: string,
  extraHeaders: Record<string, string> = {},
): Response {
  return Response.json(
    { error: { message, type, code: type, param: null } },
    { status, headers: { "cache-control": "no-store", ...corsHeaders(request), ...extraHeaders } },
  );
}

export function jsonResponse(request: Request, body: unknown, init: { status?: number; headers?: Record<string, string> } = {}): Response {
  return Response.json(body, {
    status: init.status ?? 200,
    headers: { "cache-control": "no-store", ...corsHeaders(request), ...init.headers },
  });
}

/* -------------------------------- admission ------------------------------- */

export interface Admission {
  principal: string;
}

/**
 * Gate for every authenticated endpoint: key, per-key rate limit, the daily
 * variable-cost budget, and (optionally) an operator flag from the admin
 * console. Returns a ready error Response when the request may not proceed.
 */
export async function admit(request: Request, { flag }: { flag?: string } = {}): Promise<Admission | Response> {
  if (!gatewayEnabled()) {
    return errorResponse(request, 503, "The Vitex API is closed: the operator has not issued any keys (VITEX_GATEWAY_KEYS).", "gateway_disabled");
  }
  const principal = await matchKey(presentedKey(request));
  if (!principal) {
    return errorResponse(request, 401, "A valid API key is required (Authorization: Bearer <key>, or x-api-key).", "invalid_api_key", {
      "www-authenticate": 'Bearer realm="vitex"',
    });
  }
  const limit = await consumeRateLimit(principal, POLICIES.gateway);
  if (!limit.allowed) {
    const retry = String(Math.ceil(limit.retryAfterMs / 1000));
    return errorResponse(request, 429, `Rate limit reached (${limit.limit} requests per minute per key). Retry in ${retry}s.`, "rate_limit_exceeded", {
      "retry-after": retry,
    });
  }
  if (await budgetExhausted()) {
    await noteBudgetBlock();
    return errorResponse(request, 429, "Today's variable-cost budget is exhausted. Metered calls resume at 00:00 UTC.", "budget_exhausted");
  }
  if (flag) {
    const flags = await getFlagStates();
    if (flags[flag] === false) {
      return errorResponse(request, 503, `This capability is switched off by the operator (${flag}).`, "operator_disabled");
    }
  }
  return { principal };
}
