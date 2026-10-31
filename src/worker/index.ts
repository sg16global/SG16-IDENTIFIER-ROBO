import { runInRequestScope } from "@/lib/request-scope";
import { preflight } from "@/lib/universal/gateway";
import { renderPage } from "@/worker/html";
import { passthrough } from "@/worker/passthrough";
import * as admin from "@/worker/routes/admin";
import * as catalog from "@/worker/routes/catalog";
import * as certificate from "@/worker/routes/certificate";
import * as engage from "@/worker/routes/engage";
import * as health from "@/worker/routes/health";
import * as image from "@/worker/routes/image";
import * as meta from "@/worker/routes/meta";
import * as pioneers from "@/worker/routes/pioneers";
import * as report from "@/worker/routes/report";
import * as stats from "@/worker/routes/stats";
import * as verify from "@/worker/routes/verify";
import * as v1Catalog from "@/worker/routes/v1/catalog";
import * as v1Chat from "@/worker/routes/v1/chat";
import * as v1Discovery from "@/worker/routes/v1/discovery";
import * as v1Forward from "@/worker/routes/v1/forward";
import * as v1Models from "@/worker/routes/v1/models";
import * as v1Proxy from "@/worker/routes/v1/proxy";
import * as v1Reports from "@/worker/routes/v1/reports";
import * as v1Verify from "@/worker/routes/v1/verify";
import { compileRoute, dispatch, type Route } from "@/worker/router";

export { GuardState } from "@/worker/guard";

/** Every API endpoint. Handlers take (request, { params }), as App Router route modules did. */
const API: Route[] = [
  compileRoute("/api/health", health),
  compileRoute("/api/meta", meta),
  compileRoute("/api/stats", stats),
  compileRoute("/api/catalog", catalog),
  compileRoute("/api/pioneers", pioneers),
  compileRoute("/api/verify", verify),
  compileRoute("/api/engage", engage),
  compileRoute("/api/admin", admin),
  compileRoute("/api/report/:id", report),
  compileRoute("/api/legal/certificate", certificate),
  compileRoute("/api/image", image),
  compileRoute("/api/v1", v1Discovery),
  compileRoute("/api/v1/models", v1Models),
  compileRoute("/api/v1/chat/completions", v1Chat),
  compileRoute("/api/v1/verify", v1Verify),
  compileRoute("/api/v1/reports/:id", v1Reports),
  compileRoute("/api/v1/catalog/:brand/:model", v1Catalog),
  compileRoute("/api/v1/proxy/:upstream/*path", v1Proxy),
  compileRoute("/api/v1/forward", v1Forward),
];

export default {
  fetch(request, _env, ctx) {
    return runInRequestScope(ctx, async () => {
      const url = new URL(request.url);
      // OpenAI-style base URL for the universal API: <origin>/v1 is /api/v1.
      const path = url.pathname === "/v1" || url.pathname.startsWith("/v1/") ? `/api${url.pathname}` : url.pathname;
      const gatewayPath = path === "/api/v1" || path.startsWith("/api/v1/");
      // The caller names its own server: forward the request untouched, any path, any payload.
      if (gatewayPath && request.headers.has("x-vitex-base-url")) return passthrough(request, path);
      // Browser preflights carry no x-vitex-* values; answer them for every /v1 path.
      if (gatewayPath && request.method === "OPTIONS") return preflight(request);
      if (path === "/api" || path.startsWith("/api/")) return dispatch(API, request, path);
      return renderPage(request, url);
    });
  },
} satisfies ExportedHandler<Env>;
