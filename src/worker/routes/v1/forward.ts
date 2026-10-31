import { admit, corsHeaders, errorResponse, gatewayKeyHeader, preflight } from "@/lib/universal/gateway";
import { checkCallerUrl } from "@/lib/universal/targets";
import { passThroughHeaders, relay } from "@/lib/universal/upstreams";

const TIMEOUT_MS = 60_000;

/**
 * ANY /v1/forward — calls any company's HTTP API for an API key holder, with
 * no configuration. Name the target with the x-vitex-target header or the
 * `url` query parameter (an absolute URL, its own query included).
 *
 * Method, body and headers pass through, including the caller's credentials
 * for the target (Authorization, x-api-key, …) — except the header that
 * carried the gateway key. Send the gateway key in x-vitex-key to keep
 * Authorization for the target. Cookies, client IP headers and x-vitex-*
 * headers are never forwarded; upstream cookies are not returned.
 */
async function handle(request: Request) {
  const admission = await admit(request);
  if (admission instanceof Response) return admission;

  const raw = request.headers.get("x-vitex-target") ?? new URL(request.url).searchParams.get("url");
  if (!raw) {
    return errorResponse(request, 400, "Name the target with the x-vitex-target header or the ?url= parameter.", "invalid_request_error");
  }
  const target = await checkCallerUrl(raw);
  if (!target.ok) return errorResponse(request, target.status, `Target refused: ${target.reason}.`, "target_refused");

  const keyHeader = gatewayKeyHeader(request);
  const headers = passThroughHeaders(request, new Set(keyHeader ? [keyHeader] : []));
  const res = await relay(request, target.url, {
    label: target.url.host,
    meterAs: `forward:${target.url.host}`.slice(0, 48),
    headers,
    timeoutMs: TIMEOUT_MS,
    costUsd: 0,
    tag: ["x-vitex-target", target.url.origin],
  });
  for (const [name, value] of Object.entries(corsHeaders(request))) res.headers.set(name, value);
  return res;
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
export const HEAD = handle;

export function OPTIONS(request: Request) {
  return preflight(request);
}
