import { FLAG_KEYS } from "@/lib/db/reports";
import { gatewayComplete, gatewayStream } from "@/lib/universal/chat";
import { admit, corsHeaders, errorResponse, jsonResponse, preflight } from "@/lib/universal/gateway";
import { resolveModel, type Route } from "@/lib/universal/providers";
import { GatewayError, type ChatMessage, type ChatRequest } from "@/lib/universal/types";

const MAX_BODY_BYTES = 4 * 1024 * 1024;
const MAX_FALLBACKS = 4;
const ROLES = new Set<ChatMessage["role"]>(["system", "developer", "user", "assistant", "tool"]);

function problem(body: unknown): string | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return "Request body must be a JSON object.";
  const b = body as Record<string, unknown>;
  if (b.model !== undefined && (typeof b.model !== "string" || b.model.length > 256)) return "'model' must be a string.";
  if (!Array.isArray(b.messages) || b.messages.length === 0) return "'messages' must be a non-empty array.";
  for (const [i, m] of b.messages.entries()) {
    if (!m || typeof m !== "object") return `messages[${i}] must be an object.`;
    const message = m as Record<string, unknown>;
    if (!ROLES.has(message.role as ChatMessage["role"])) return `messages[${i}].role must be one of ${[...ROLES].join(", ")}.`;
    const content = message.content;
    if (content !== undefined && content !== null && typeof content !== "string" && !Array.isArray(content)) {
      return `messages[${i}].content must be a string, an array of parts, or null.`;
    }
  }
  if (b.tools !== undefined && !Array.isArray(b.tools)) return "'tools' must be an array.";
  if (b.fallbacks !== undefined && (!Array.isArray(b.fallbacks) || b.fallbacks.some((f) => typeof f !== "string"))) {
    return "'fallbacks' must be an array of model names.";
  }
  return null;
}

/**
 * OpenAI-compatible chat completions on any configured provider.
 *
 * Model: `<provider>/<model>`, a bare model name, or omitted for the default.
 * Extension: `fallbacks: ["<provider>/<model>", ...]` — tried in order when
 * the previous model is rate-limited, failing or unreachable (before any
 * streamed byte). Responses carry x-vitex-provider / x-vitex-model headers.
 */
export async function POST(request: Request) {
  const admission = await admit(request, { flag: FLAG_KEYS.expensive });
  if (admission instanceof Response) return admission;

  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) {
    return errorResponse(request, 413, "Request body exceeds 4 MB.", "request_too_large");
  }
  let raw: string;
  let body: unknown;
  try {
    raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) return errorResponse(request, 413, "Request body exceeds 4 MB.", "request_too_large");
    body = JSON.parse(raw);
  } catch {
    return errorResponse(request, 400, "Request body must be valid JSON.", "invalid_request_error");
  }
  const invalid = problem(body);
  if (invalid) return errorResponse(request, 400, invalid, "invalid_request_error");

  const { fallbacks, ...fields } = body as ChatRequest & { fallbacks?: string[] };
  let routes: Route[];
  try {
    routes = [fields.model, ...(fallbacks ?? []).slice(0, MAX_FALLBACKS)].map((name) => resolveModel(name));
  } catch (error) {
    const e = error as GatewayError;
    return errorResponse(request, e.status ?? 400, e.message, e.type ?? "invalid_request_error");
  }
  const chat: ChatRequest = { ...fields, model: routes[0].id };

  try {
    if (chat.stream === true) {
      const { route, body: stream } = await gatewayStream(chat, routes);
      return new Response(stream, {
        headers: {
          "content-type": "text/event-stream; charset=utf-8",
          "cache-control": "no-cache, no-transform",
          "x-accel-buffering": "no",
          "x-vitex-provider": route.provider.id,
          "x-vitex-model": route.id,
          ...corsHeaders(request),
        },
      });
    }
    const { route, completion } = await gatewayComplete(chat, routes);
    return jsonResponse(request, completion, {
      headers: { "x-request-id": completion.id, "x-vitex-provider": route.provider.id, "x-vitex-model": route.id },
    });
  } catch (error) {
    if (error instanceof GatewayError) {
      return errorResponse(request, error.status, error.message, error.type, error.status === 429 ? { "retry-after": "10" } : {});
    }
    return errorResponse(request, 500, (error as Error).message ?? "Gateway failure.", "server_error");
  }
}

export function OPTIONS(request: Request) {
  return preflight(request);
}
