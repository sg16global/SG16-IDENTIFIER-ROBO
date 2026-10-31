import { randomBytes, toHex } from "@/lib/utils";
import type { ProviderSpec, Route } from "@/lib/universal/providers";
import {
  GatewayError,
  type ChatChunk,
  type ChatCompletion,
  type ChatMessage,
  type ChatRequest,
  type ContentPart,
  type FinishReason,
  type Usage,
} from "@/lib/universal/types";

/** One wire protocol. Every adapter returns OpenAI-shaped results. */
export interface Adapter {
  complete(route: Route, request: ChatRequest, signal: AbortSignal): Promise<ChatCompletion>;
  /** Yields content chunks, then one finish chunk, then (when known) one usage-only chunk. */
  stream(route: Route, request: ChatRequest, signal: AbortSignal): AsyncGenerator<ChatChunk>;
  listModels(provider: ProviderSpec, signal: AbortSignal): Promise<string[]>;
}

export function providerUrl(provider: ProviderSpec, path: string, extraQuery: Record<string, string> = {}): string {
  const url = new URL(`${provider.baseUrl}${path}`);
  for (const [k, v] of Object.entries({ ...provider.query, ...extraQuery })) url.searchParams.set(k, v);
  return url.toString();
}

export function providerHeaders(provider: ProviderSpec, json = true): Headers {
  const headers = new Headers(provider.headers);
  if (json) headers.set("content-type", "application/json");
  headers.set("accept", "application/json, text/event-stream");
  if (provider.apiKey) {
    headers.set(provider.authHeader, provider.authScheme ? `${provider.authScheme} ${provider.apiKey}` : provider.apiKey);
  }
  return headers;
}

function upstreamMessage(body: string): string {
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    const error = parsed.error as Record<string, unknown> | string | undefined;
    if (typeof error === "string") return error;
    if (error && typeof error.message === "string") return error.message;
    if (typeof parsed.message === "string") return parsed.message;
    if (Array.isArray(parsed) && typeof (parsed[0] as { error?: { message?: string } })?.error?.message === "string") {
      return (parsed[0] as { error: { message: string } }).error.message;
    }
  } catch {
    // not JSON
  }
  return body.slice(0, 300);
}

/**
 * Maps a provider's HTTP failure to what the gateway's caller should see. A
 * provider rejecting *our* credentials is a gateway fault (502), not the
 * caller's; request errors (400/404/413/422) pass through so the caller can
 * fix them.
 */
export async function upstreamError(provider: ProviderSpec, res: Response): Promise<GatewayError> {
  const body = await res.text().catch(() => "");
  const message = `${provider.label} responded ${res.status}: ${upstreamMessage(body) || res.statusText}`;
  const retryable = res.status === 408 || res.status === 409 || res.status === 429 || res.status >= 500;
  if (res.status === 401 || res.status === 403) return new GatewayError(message, 502, "upstream_auth_error", false);
  if (res.status === 429) return new GatewayError(message, 429, "upstream_rate_limited", true);
  if (res.status >= 500) return new GatewayError(message, 502, "upstream_error", retryable);
  return new GatewayError(message, res.status, "invalid_request_error", retryable);
}

export async function postJson(provider: ProviderSpec, url: string, body: unknown, signal: AbortSignal): Promise<Response> {
  const res = await fetch(url, { method: "POST", headers: providerHeaders(provider), body: JSON.stringify(body), signal });
  if (!res.ok) throw await upstreamError(provider, res);
  return res;
}

export async function getJson<T>(provider: ProviderSpec, url: string, signal: AbortSignal): Promise<T> {
  const res = await fetch(url, { headers: providerHeaders(provider, false), signal });
  if (!res.ok) throw await upstreamError(provider, res);
  return (await res.json()) as T;
}

export function completionId(): string {
  return `chatcmpl-${toHex(randomBytes(12))}`;
}

export function toolCallId(): string {
  return `call_${toHex(randomBytes(12))}`;
}

export function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

/** The plain text of a message's content (image parts are dropped). */
export function textOf(content: ChatMessage["content"]): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((p): p is Extract<ContentPart, { type: "text" }> => p?.type === "text" && typeof p.text === "string")
    .map((p) => p.text)
    .join("\n");
}

export function parseDataUrl(url: string): { mimeType: string; data: string } | null {
  const match = /^data:([^;,]+)(?:;[^,]*)?;base64,([\s\S]*)$/.exec(url);
  return match ? { mimeType: match[1], data: match[2] } : null;
}

export function guessImageType(url: string): string {
  const ext = /\.([a-z0-9]+)(?:[?#]|$)/i.exec(url)?.[1]?.toLowerCase();
  return ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : ext === "gif" ? "image/gif" : "image/jpeg";
}

export function parseArguments(raw: string | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : { value: parsed };
  } catch {
    return { raw };
  }
}

export function stopList(stop: ChatRequest["stop"]): string[] | undefined {
  if (typeof stop === "string") return stop ? [stop] : undefined;
  return Array.isArray(stop) && stop.length ? stop.filter((s) => typeof s === "string") : undefined;
}

export function maxTokens(request: ChatRequest): number | undefined {
  const value = request.max_completion_tokens ?? request.max_tokens;
  return typeof value === "number" && value > 0 ? Math.floor(value) : undefined;
}

export function wantsJson(request: ChatRequest): boolean {
  return request.response_format?.type === "json_object" || request.response_format?.type === "json_schema";
}

/** Instruction appended for protocols without a native JSON mode. */
export function jsonInstruction(request: ChatRequest): string {
  const schema = request.response_format?.json_schema?.schema;
  return schema
    ? `Respond with a single valid JSON object matching this JSON Schema, and nothing else:\n${JSON.stringify(schema)}`
    : "Respond with a single valid JSON object and nothing else.";
}

export function usageOf(prompt: number, completion: number): Usage {
  return { prompt_tokens: prompt, completion_tokens: completion, total_tokens: prompt + completion };
}

export function chunk(id: string, route: Route, delta: ChatChunk["choices"][number]["delta"], finish: FinishReason | null = null): ChatChunk {
  return { id, object: "chat.completion.chunk", created: nowSeconds(), model: route.id, choices: [{ index: 0, delta, finish_reason: finish }] };
}

export function usageChunk(id: string, route: Route, usage: Usage): ChatChunk {
  return { id, object: "chat.completion.chunk", created: nowSeconds(), model: route.id, choices: [], usage };
}
