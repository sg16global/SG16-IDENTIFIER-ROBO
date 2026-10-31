import { GatewayError, type ChatCompletion, type ChatRequest } from "@/lib/universal/types";
import type { CustomProtocol, ProviderSpec, Route } from "@/lib/universal/providers";
import {
  chunk,
  completionId,
  maxTokens,
  nowSeconds,
  postJson,
  providerUrl,
  stopList,
  textOf,
  usageChunk,
  usageOf,
  type Adapter,
} from "@/lib/universal/adapters/common";

/**
 * Any company's model API that follows none of the standard protocols,
 * described in VITEX_PROVIDERS:
 *
 *   { "id": "acme", "protocol": "custom", "baseUrl": "https://ml.acme.com", "path": "/v2/generate",
 *     "apiKeyEnv": "ACME_KEY",
 *     "requestTemplate": { "input": "{{prompt}}", "params": { "max_new_tokens": "{{max_tokens}}" } },
 *     "responseMap": { "content": "result.text", "promptTokens": "usage.in", "completionTokens": "usage.out" } }
 *
 * A template string that is exactly "{{name}}" becomes that value with its own
 * JSON type (messages stays an array); placeholders inside longer strings are
 * filled in as text; a field whose value is absent is left out. Without a
 * responseMap.content, the usual reply fields are tried in turn. Streaming
 * requests receive the finished text as a stream.
 */

const WHOLE = /^\{\{\s*(\w+)\s*\}\}$/;
const PART = /\{\{\s*(\w+)\s*\}\}/g;
const CONTENT_GUESSES = [
  "choices.0.message.content", "choices.0.text", "output", "output.text", "text", "content",
  "response", "result", "result.text", "generated_text", "0.generated_text", "data.text", "message.content",
];

function variables(route: Route, request: ChatRequest): Record<string, unknown> {
  const messages = request.messages.map((m) => ({ role: m.role, content: textOf(m.content) }));
  const system = messages.filter((m) => m.role === "system" || m.role === "developer").map((m) => m.content).join("\n\n");
  const lastUser = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
  const transcript = messages.filter((m) => m.role !== "system" && m.role !== "developer").map((m) => `${m.role}: ${m.content}`);
  return {
    model: route.model,
    messages,
    prompt: [system, ...transcript, "assistant:"].filter(Boolean).join("\n"),
    system: system || undefined,
    last_user: lastUser,
    max_tokens: maxTokens(request),
    temperature: request.temperature,
    top_p: request.top_p,
    stop: stopList(request.stop),
  };
}

export function fillTemplate(template: unknown, vars: Record<string, unknown>): unknown {
  if (typeof template === "string") {
    const whole = WHOLE.exec(template);
    if (whole) return vars[whole[1]];
    return template.replace(PART, (_m, name: string) => {
      const value = vars[name];
      return value === undefined || value === null ? "" : typeof value === "string" ? value : JSON.stringify(value);
    });
  }
  if (Array.isArray(template)) return template.map((item) => fillTemplate(item, vars)).filter((item) => item !== undefined);
  if (template && typeof template === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(template)) {
      const filled = fillTemplate(value, vars);
      if (filled !== undefined) out[key] = filled;
    }
    return out;
  }
  return template;
}

/** Value at a dot path ("choices.0.text"); undefined when any step is missing. */
export function pick(data: unknown, path: string): unknown {
  return path
    .split(".")
    .filter(Boolean)
    .reduce<unknown>((value, key) => (value === null || value === undefined ? undefined : (value as Record<string, unknown>)[key]), data);
}

function spec(provider: ProviderSpec): CustomProtocol {
  if (!provider.custom) throw new GatewayError(`${provider.label} has no custom protocol description.`, 500, "provider_misconfigured");
  return provider.custom;
}

async function call(route: Route, request: ChatRequest, signal: AbortSignal): Promise<ChatCompletion> {
  const custom = spec(route.provider);
  const body = fillTemplate(custom.requestTemplate, variables(route, request));
  const res = await postJson(route.provider, providerUrl(route.provider, custom.path), body, signal);
  const text = await res.text();
  let data: unknown = text;
  try {
    data = JSON.parse(text);
  } catch {
    // A plain-text reply is the content itself.
  }

  let content: unknown = typeof data === "string" ? data : undefined;
  if (content === undefined) {
    content = custom.responseMap.content
      ? pick(data, custom.responseMap.content)
      : CONTENT_GUESSES.map((path) => pick(data, path)).find((value) => typeof value === "string");
  }
  if (content === undefined) {
    throw new GatewayError(
      `${route.provider.label} replied without content at "${custom.responseMap.content ?? "any usual field"}"; set responseMap.content.`,
      502,
      "upstream_unexpected_reply",
    );
  }
  const prompt = custom.responseMap.promptTokens ? pick(data, custom.responseMap.promptTokens) : undefined;
  const completion = custom.responseMap.completionTokens ? pick(data, custom.responseMap.completionTokens) : undefined;
  return {
    id: completionId(),
    object: "chat.completion",
    created: nowSeconds(),
    model: route.id,
    choices: [{ index: 0, message: { role: "assistant", content: typeof content === "string" ? content : JSON.stringify(content) }, finish_reason: "stop" }],
    usage: typeof prompt === "number" && typeof completion === "number" ? usageOf(prompt, completion) : undefined,
  };
}

export const customAdapter: Adapter = {
  complete: call,

  async *stream(route, request, signal) {
    const done = await call(route, request, signal);
    const text = done.choices[0].message.content ?? "";
    yield chunk(done.id, route, { role: "assistant", content: "" });
    if (text) yield chunk(done.id, route, { content: text });
    yield chunk(done.id, route, {}, "stop");
    if (done.usage) yield usageChunk(done.id, route, done.usage);
  },

  async listModels() {
    // A custom API has no standard model list; its declared models are listed instead.
    return [];
  },
};
