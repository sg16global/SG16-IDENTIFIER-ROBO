import { corsHeaders, gatewayEnabled, preflight } from "@/lib/universal/gateway";
import { defaultRoute, providerStatuses, providersConfigError } from "@/lib/universal/providers";
import { privateTargetsAllowed } from "@/lib/universal/targets";
import { upstreamStatuses } from "@/lib/universal/upstreams";

/**
 * Vitex universal API — discovery. Public and secret-free: which endpoints
 * exist, which providers this deployment can reach and why others cannot.
 * Upstream names are listed, never their URLs or credentials.
 */
export async function GET(request: Request) {
  const providers = providerStatuses();
  return Response.json(
    {
      object: "vitex.api",
      service: "sg16-identifier",
      version: "1.0.0",
      open: gatewayEnabled(),
      auth: "x-vitex-key: <key> (or Authorization: Bearer / x-api-key / api-key / x-goog-api-key)",
      compatibility: "OpenAI Chat Completions — point any OpenAI SDK at <origin>/v1",
      transparentPassthrough: {
        trigger: "any /v1/<path> request with x-vitex-base-url — forwarded untouched to <base-url>/<path>; response streamed back as sent",
        "x-vitex-base-url": "your server's API root (any company, any API)",
        "x-vitex-key": "this gateway's key, so Authorization stays yours for the server",
        "x-vitex-api-key": "optional: sent as Authorization: Bearer <key>",
        "x-vitex-auth-header": "optional: header for x-vitex-api-key instead",
        "x-vitex-auth-scheme": "optional: prefix for x-vitex-api-key (empty for none)",
      },
      privateTargetsAllowed: privateTargetsAllowed(),
      defaultModel: defaultRoute()?.id ?? null,
      endpoints: [
        { method: "ANY", path: "/v1/<path> + x-vitex-base-url", purpose: "Transparent pass-through to your own server: method, headers, body and streams untouched." },
        { method: "GET", path: "/v1", purpose: "This document." },
        { method: "GET", path: "/v1/models", purpose: "Every model reachable through this deployment's configured providers, as <provider>/<model>." },
        { method: "POST", path: "/v1/chat/completions", purpose: "Chat completions on the deployment's configured providers; streaming, tools, images, JSON mode, fallbacks." },
        { method: "ANY", path: "/v1/forward", purpose: "Call any company's HTTP API: target in x-vitex-target or ?url=; your own credentials pass through." },
        { method: "POST", path: "/v1/verify", purpose: "Run an SG16 verification (claim, website, product, media) and return the evidence report." },
        { method: "GET", path: "/v1/reports/{public_id}", purpose: "A stored report by its SG16-XXXX-XXXX reference." },
        { method: "GET", path: "/v1/catalog/{brand}/{model}", purpose: "The normalised catalogue record products are matched against." },
        { method: "ANY", path: "/v1/proxy/{upstream}/{path}", purpose: "Forward a call to an operator-configured company API with its credential attached server-side." },
      ],
      providers: providers.map((p) => ({
        id: p.id,
        label: p.label,
        protocol: p.protocol,
        enabled: p.enabled,
        defaultModel: p.enabled ? p.defaultModel : null,
        reason: p.reason,
      })),
      upstreams: upstreamStatuses().map((u) => ({ id: u.id, label: u.label, methods: u.methods, enabled: u.enabled, reason: u.reason })),
      configError: providersConfigError(),
    },
    { headers: { "cache-control": "no-store", ...corsHeaders(request) } },
  );
}

export function OPTIONS(request: Request) {
  return preflight(request);
}
