import { recordProviderCall } from "@/lib/providers/registry";
import { checkProviderUrl } from "@/lib/universal/providers";
import { afterResponse } from "@/lib/request-scope";
import { setting } from "@/lib/settings";

/**
 * Vitex upstream proxy — any company's HTTP API behind one key.
 *
 * VITEX_UPSTREAMS (JSON) names each upstream an API key holder may reach:
 *
 *   { "crm": { "baseUrl": "https://api.acme.com/v2",
 *              "auth": { "type": "bearer", "secretEnv": "ACME_CRM_TOKEN" },
 *              "headers": { "x-tenant": "sg16" }, "methods": ["GET", "POST"] } }
 *
 * `/v1/proxy/crm/customers/42?expand=orders` then forwards to
 * `https://api.acme.com/v2/customers/42?expand=orders` with the upstream's own
 * credential attached here, on the server. Callers never see that credential,
 * and their own gateway key, cookies and client IP headers are never forwarded.
 * Paths cannot climb above baseUrl and redirects are returned rather than
 * followed. Any host the operator lists is reachable, public or internal.
 * For any API that is not configured here, see /v1/forward.
 */

type Auth =
  | { type: "none" }
  | { type: "bearer"; secretEnv: string }
  | { type: "header"; name: string; secretEnv: string }
  | { type: "query"; param: string; secretEnv: string }
  | { type: "basic"; usernameEnv: string; passwordEnv: string };

export interface UpstreamSpec {
  id: string;
  label: string;
  baseUrl: string;
  auth: Auth;
  headers: Record<string, string>;
  methods: Set<string>;
  timeoutMs: number;
  costPerCallUsd: number;
}

export interface UpstreamStatus {
  id: string;
  label: string;
  methods: string[];
  enabled: boolean;
  reason: string | null;
}

const ID_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;
const ALL_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"];

// Never forwarded: hop-by-hop headers, cookies for this site, and anything
// that would reveal or spoof the client.
const DROP_REQUEST_HEADERS = new Set([
  "host", "connection", "keep-alive", "proxy-authorization", "proxy-connection", "te", "trailer", "transfer-encoding", "upgrade",
  "content-length", "cookie", "origin", "referer",
  "x-forwarded-for", "x-forwarded-host", "x-forwarded-proto", "x-real-ip", "true-client-ip", "forwarded", "via",
]);
const DROP_REQUEST_PREFIXES = ["cf-", "sec-", "x-vitex-"];
/** Credential headers: dropped for configured upstreams (their own credential is attached instead). */
export const CREDENTIAL_HEADERS = new Set(["authorization", "x-api-key", "api-key", "x-goog-api-key"]);

// Never returned to the caller: hop-by-hop headers and upstream cookies, which
// would otherwise be set on this site's domain.
const DROP_RESPONSE_HEADERS = new Set([
  "connection", "keep-alive", "proxy-authenticate", "transfer-encoding", "upgrade", "content-length", "set-cookie", "set-cookie2",
]);

function env(name: string): string | undefined {
  const value = setting(name)?.trim();
  return value ? value : undefined;
}

function parseAuth(raw: unknown): Auth | string {
  if (raw === undefined || raw === null) return { type: "none" };
  if (typeof raw !== "object") return "auth must be an object";
  const a = raw as Record<string, unknown>;
  const str = (k: string) => (typeof a[k] === "string" ? (a[k] as string) : "");
  switch (a.type) {
    case "none":
      return { type: "none" };
    case "bearer":
      return str("secretEnv") ? { type: "bearer", secretEnv: str("secretEnv") } : "bearer auth needs secretEnv";
    case "header":
      return str("name") && str("secretEnv") ? { type: "header", name: str("name").toLowerCase(), secretEnv: str("secretEnv") } : "header auth needs name and secretEnv";
    case "query":
      return str("param") && str("secretEnv") ? { type: "query", param: str("param"), secretEnv: str("secretEnv") } : "query auth needs param and secretEnv";
    case "basic":
      return str("usernameEnv") && str("passwordEnv")
        ? { type: "basic", usernameEnv: str("usernameEnv"), passwordEnv: str("passwordEnv") }
        : "basic auth needs usernameEnv and passwordEnv";
    default:
      return `unknown auth type "${String(a.type)}"`;
  }
}

function authSecrets(auth: Auth): string[] {
  switch (auth.type) {
    case "none":
      return [];
    case "basic":
      return [auth.usernameEnv, auth.passwordEnv];
    default:
      return [auth.secretEnv];
  }
}

let cache: { specs: UpstreamSpec[]; statuses: UpstreamStatus[] } | null = null;

function build() {
  const specs: UpstreamSpec[] = [];
  const statuses: UpstreamStatus[] = [];
  const raw = env("VITEX_UPSTREAMS");
  if (!raw) return { specs, statuses };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    statuses.push({ id: "VITEX_UPSTREAMS", label: "configuration", methods: [], enabled: false, reason: `not valid JSON (${(error as Error).message})` });
    return { specs, statuses };
  }
  const entries: Array<[string, Record<string, unknown>]> = Array.isArray(parsed)
    ? parsed.filter((e) => e && typeof e === "object").map((e) => [String((e as { id?: unknown }).id ?? ""), e as Record<string, unknown>])
    : parsed && typeof parsed === "object"
      ? Object.entries(parsed as Record<string, Record<string, unknown>>)
      : [];

  for (const [id, entry] of entries) {
    const methods = Array.isArray(entry.methods)
      ? entry.methods.map((m) => String(m).toUpperCase()).filter((m) => ALL_METHODS.includes(m))
      : ALL_METHODS;
    const label = typeof entry.label === "string" ? entry.label : id;
    const missing = new Set<string>();
    const baseUrl = typeof entry.baseUrl === "string"
      ? entry.baseUrl.replace(/\$\{([A-Z0-9_]+)\}/g, (_m, name: string) => env(name) ?? (missing.add(name), ""))
      : "";
    const headers: Record<string, string> = {};
    if (entry.headers && typeof entry.headers === "object") {
      for (const [k, v] of Object.entries(entry.headers as Record<string, unknown>)) {
        if (typeof v === "string") headers[k.toLowerCase()] = v.replace(/\$\{([A-Z0-9_]+)\}/g, (_m, name: string) => env(name) ?? (missing.add(name), ""));
      }
    }
    const auth = parseAuth(entry.auth);
    let reason: string | null = null;
    if (!ID_RE.test(id)) reason = "id must be lowercase letters, digits and dashes";
    else if (statuses.some((s) => s.id === id)) reason = `duplicate upstream id "${id}"`;
    else if (typeof auth === "string") reason = auth;
    else if (!baseUrl) reason = "baseUrl is required";
    else if (missing.size) reason = `missing environment variables: ${[...missing].join(", ")}`;
    else if (authSecrets(auth).some((name) => !env(name))) reason = `missing secret: ${authSecrets(auth).filter((n) => !env(n)).join(", ")}`;
    else if (!methods.length) reason = "no supported methods listed";
    else reason = checkProviderUrl(baseUrl);
    statuses.push({ id, label, methods, enabled: reason === null, reason });
    if (reason === null && typeof auth !== "string") {
      specs.push({
        id,
        label,
        baseUrl: baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`,
        auth,
        headers,
        methods: new Set(methods),
        timeoutMs: typeof entry.timeoutMs === "number" && entry.timeoutMs > 0 ? entry.timeoutMs : 30_000,
        costPerCallUsd: typeof entry.costPerCallUsd === "number" && entry.costPerCallUsd >= 0 ? entry.costPerCallUsd : 0,
      });
    }
  }
  return { specs, statuses };
}

function current() {
  return (cache ??= build());
}

export function upstreams(): UpstreamSpec[] {
  return current().specs;
}

export function upstreamStatuses(): UpstreamStatus[] {
  return current().statuses;
}

export function findUpstream(id: string): UpstreamSpec | undefined {
  return current().specs.find((u) => u.id === id);
}

/** Builds the target URL, refusing any path that would leave baseUrl. */
export function targetUrl(upstream: UpstreamSpec, segments: string[], search: URLSearchParams): URL | null {
  if (segments.some((s) => s === "." || s === ".." || s.includes("/") || s.includes("\\"))) return null;
  const base = new URL(upstream.baseUrl);
  const target = new URL(segments.map(encodeURIComponent).join("/"), base);
  if (target.origin !== base.origin || !target.pathname.startsWith(base.pathname)) return null;
  for (const [k, v] of search) target.searchParams.append(k, v);
  if (upstream.auth.type === "query") target.searchParams.set(upstream.auth.param, env(upstream.auth.secretEnv) ?? "");
  return target;
}

/** The caller's headers minus hop-by-hop, client-identifying and gateway headers, and minus `drop`. */
export function passThroughHeaders(request: Request, drop: Set<string>): Headers {
  const headers = new Headers();
  for (const [name, value] of request.headers) {
    const lower = name.toLowerCase();
    if (DROP_REQUEST_HEADERS.has(lower) || drop.has(lower) || DROP_REQUEST_PREFIXES.some((p) => lower.startsWith(p))) continue;
    headers.set(lower, value);
  }
  return headers;
}

function upstreamHeaders(request: Request, upstream: UpstreamSpec): Headers {
  const headers = passThroughHeaders(request, CREDENTIAL_HEADERS);
  for (const [name, value] of Object.entries(upstream.headers)) headers.set(name, value);
  const auth = upstream.auth;
  if (auth.type === "bearer") headers.set("authorization", `Bearer ${env(auth.secretEnv)}`);
  else if (auth.type === "header") headers.set(auth.name, env(auth.secretEnv) ?? "");
  else if (auth.type === "basic") headers.set("authorization", `Basic ${btoa(`${env(auth.usernameEnv)}:${env(auth.passwordEnv)}`)}`);
  return headers;
}

export interface RelayOptions {
  /** Named in error messages. */
  label: string;
  /** provider_usage row: provider column. */
  meterAs: string;
  headers: Headers;
  timeoutMs: number;
  costUsd: number;
  /** Response header identifying where the answer came from. */
  tag: [name: string, value: string];
}

/**
 * Sends one request to `target` and streams the response back. The deadline
 * covers the target's response headers only, so long downloads are not cut
 * off. Redirects are returned to the caller, not followed.
 */
export async function relay(request: Request, target: URL, options: RelayOptions): Promise<Response> {
  const started = Date.now();
  const method = request.method.toUpperCase();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException("target timed out", "TimeoutError")), options.timeoutMs);
  const meter = (status: "ok" | "error", error?: string) => {
    const task = recordProviderCall({
      provider: options.meterAs,
      operation: `${method} ${target.pathname}`,
      status,
      latencyMs: Date.now() - started,
      costUsd: status === "ok" ? options.costUsd : 0,
      error,
    });
    afterResponse(task);
  };

  try {
    const res = await fetch(target, {
      method,
      headers: options.headers,
      body: method === "GET" || method === "HEAD" ? undefined : request.body,
      redirect: "manual",
      signal: controller.signal,
    });
    clearTimeout(timer);
    const headers = new Headers();
    for (const [name, value] of res.headers) if (!DROP_RESPONSE_HEADERS.has(name.toLowerCase())) headers.set(name, value);
    headers.set(...options.tag);
    meter(res.status >= 500 ? "error" : "ok", res.status >= 500 ? `HTTP ${res.status}` : undefined);
    return new Response(method === "HEAD" ? null : res.body, { status: res.status, statusText: res.statusText, headers });
  } catch (error) {
    clearTimeout(timer);
    const timedOut = (error as { name?: string })?.name === "TimeoutError" || controller.signal.aborted;
    const message = timedOut
      ? `${options.label} did not respond within ${Math.round(options.timeoutMs / 1000)}s.`
      : `${options.label} is unreachable: ${(error as Error).message}`;
    meter("error", message);
    return Response.json(
      { error: { message, type: timedOut ? "upstream_timeout" : "upstream_unreachable", code: null, param: null } },
      { status: timedOut ? 504 : 502 },
    );
  }
}

/** A configured upstream: the caller's credentials are replaced by the upstream's own. */
export function forward(request: Request, upstream: UpstreamSpec, target: URL): Promise<Response> {
  return relay(request, target, {
    label: upstream.label,
    meterAs: `upstream:${upstream.id}`,
    headers: upstreamHeaders(request, upstream),
    timeoutMs: upstream.timeoutMs,
    costUsd: upstream.costPerCallUsd,
    tag: ["x-vitex-upstream", upstream.id],
  });
}
