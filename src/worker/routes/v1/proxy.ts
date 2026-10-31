import { admit, corsHeaders, errorResponse, preflight } from "@/lib/universal/gateway";
import { findUpstream, forward, targetUrl, upstreamStatuses } from "@/lib/universal/upstreams";

type Ctx = { params: Promise<{ upstream: string; path?: string[] }> };

/** Any method to an operator-configured company API (see src/lib/universal/upstreams.ts). */
async function handle(request: Request, ctx: Ctx) {
  const admission = await admit(request);
  if (admission instanceof Response) return admission;

  const { upstream: id, path = [] } = await ctx.params;
  const upstream = findUpstream(id);
  if (!upstream) {
    const status = upstreamStatuses().find((u) => u.id === id);
    return status
      ? errorResponse(request, 503, `Upstream "${id}" is not available: ${status.reason}.`, "upstream_not_configured")
      : errorResponse(request, 404, `No upstream named "${id}" is configured.`, "upstream_not_found");
  }
  if (!upstream.methods.has(request.method.toUpperCase())) {
    return errorResponse(request, 405, `${request.method} is not allowed on upstream "${id}".`, "method_not_allowed", {
      allow: [...upstream.methods].join(", "),
    });
  }
  const target = targetUrl(upstream, path, new URL(request.url).searchParams);
  if (!target) return errorResponse(request, 400, "The path must stay within the upstream's base URL.", "invalid_request_error");

  const res = await forward(request, upstream, target);
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
