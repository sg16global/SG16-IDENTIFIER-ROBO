/**
 * A small path router for the API. Patterns use `:name` for one segment and a
 * trailing `*name` for the rest of the path (as an array of segments).
 */

type Params = Record<string, string | string[]>;
type Handler = (request: Request, ctx: { params: Promise<Params> }) => Response | Promise<Response>;

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const;
type Method = (typeof METHODS)[number];

export interface Route {
  pattern: string;
  match: (path: string) => Params | null;
  handlers: Partial<Record<Method, Handler>>;
}

/** `module` is a route module exporting handlers named after HTTP methods. */
export function compileRoute(pattern: string, module: object): Route {
  const parts = pattern.split("/").filter(Boolean);
  const handlers: Route["handlers"] = {};
  for (const method of METHODS) {
    const handler = (module as Record<string, unknown>)[method];
    if (typeof handler === "function") handlers[method] = handler as Handler;
  }
  const match = (path: string): Params | null => {
    const segments = path.split("/").filter(Boolean);
    const params: Params = {};
    for (let i = 0; i < parts.length; i += 1) {
      const part = parts[i];
      if (part.startsWith("*")) {
        params[part.slice(1)] = segments.slice(i).map(decodeURIComponent);
        return params;
      }
      const segment = segments[i];
      if (segment === undefined) return null;
      if (part.startsWith(":")) params[part.slice(1)] = decodeURIComponent(segment);
      else if (part !== segment) return null;
    }
    return segments.length === parts.length ? params : null;
  };
  return { pattern, match, handlers };
}

function json(status: number, error: string, headers: Record<string, string> = {}) {
  return Response.json({ ok: false, error }, { status, headers: { "cache-control": "no-store", ...headers } });
}

/** Runs the handler for `path`; HEAD falls back to GET, OPTIONS is answered with Allow. */
export async function dispatch(routes: Route[], request: Request, path: string): Promise<Response> {
  for (const route of routes) {
    let params: Params | null;
    try {
      params = route.match(path);
    } catch {
      return json(400, "Malformed path encoding.");
    }
    if (!params) continue;

    const method = request.method.toUpperCase() as Method;
    const allow = Object.keys(route.handlers).concat(route.handlers.GET && !route.handlers.HEAD ? ["HEAD"] : []).join(", ");
    let handler = route.handlers[method];
    if (!handler && method === "HEAD") handler = route.handlers.GET;
    if (!handler && method === "OPTIONS") return new Response(null, { status: 204, headers: { allow } });
    if (!handler) return json(405, `${request.method} is not allowed here.`, { allow });

    try {
      const response = await handler(request, { params: Promise.resolve(params) });
      return method === "HEAD" && !route.handlers.HEAD ? new Response(null, response) : response;
    } catch (error) {
      console.error(`[api] ${request.method} ${path} failed:`, error);
      return json(500, "Internal error.");
    }
  }
  return json(404, "Not found.");
}
