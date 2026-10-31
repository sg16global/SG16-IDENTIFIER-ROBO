import { recordProviderCall } from "@/lib/providers/registry";
import { afterResponse, requestScope, runInScope } from "@/lib/request-scope";
import type { ProviderCall } from "@/lib/types";
import { round } from "@/lib/utils";
import { anthropicAdapter } from "@/lib/universal/adapters/anthropic";
import { customAdapter } from "@/lib/universal/adapters/custom";
import type { Adapter } from "@/lib/universal/adapters/common";
import { geminiAdapter } from "@/lib/universal/adapters/gemini";
import { openaiAdapter } from "@/lib/universal/adapters/openai";
import { workersAiAdapter } from "@/lib/universal/adapters/workers-ai";
import type { ProviderSpec, Route } from "@/lib/universal/providers";
import { sseStream } from "@/lib/universal/sse";
import { GatewayError, type ChatChunk, type ChatCompletion, type ChatRequest, type Usage } from "@/lib/universal/types";

/**
 * Model calls through any provider: one non-streaming primitive for internal
 * features, and the metered, fallback-aware paths behind /v1/chat/completions.
 */

const ADAPTERS: Record<ProviderSpec["protocol"], Adapter> = {
  openai: openaiAdapter,
  anthropic: anthropicAdapter,
  gemini: geminiAdapter,
  "workers-ai": workersAiAdapter,
  custom: customAdapter,
};

export function adapterFor(provider: ProviderSpec): Adapter {
  return ADAPTERS[provider.protocol];
}

export function estimateTokens(text: string): number {
  return Math.max(1, Math.round(text.length / 4));
}

export function costOf(route: Route, usage: Usage): number {
  return round((usage.prompt_tokens / 1e6) * route.inputPerM + (usage.completion_tokens / 1e6) * route.outputPerM, 6);
}

function asGatewayError(error: unknown, route: Route, timeoutMs: number): GatewayError {
  if (error instanceof GatewayError) return error;
  const name = (error as { name?: string } | null)?.name;
  if (name === "TimeoutError" || name === "AbortError") {
    return new GatewayError(`${route.provider.label} did not answer within ${Math.round(timeoutMs / 1000)}s.`, 504, "upstream_timeout", true);
  }
  return new GatewayError(`${route.provider.label} is unreachable: ${(error as Error)?.message ?? String(error)}`, 502, "upstream_unreachable", true);
}

/** One non-streaming call with a deadline. Errors are always GatewayErrors. */
export async function callModel(route: Route, request: ChatRequest, timeoutMs = route.provider.timeoutMs): Promise<ChatCompletion> {
  try {
    return await adapterFor(route.provider).complete(route, request, AbortSignal.timeout(timeoutMs));
  } catch (error) {
    throw asGatewayError(error, route, timeoutMs);
  }
}

/* ------------------------------ gateway paths ------------------------------ */

function usageCall(route: Route, started: number, usage: Usage | undefined, error?: GatewayError): ProviderCall {
  return {
    provider: `gateway:${route.provider.id}`,
    operation: `chat:${route.model}`,
    status: error ? "error" : "ok",
    latencyMs: Date.now() - started,
    costUsd: usage ? costOf(route, usage) : 0,
    tokensIn: usage?.prompt_tokens,
    tokensOut: usage?.completion_tokens,
    error: error?.message,
  };
}

/** Persists metering after the response, inside the request's lifetime. */
function meterLater(call: ProviderCall, scope = requestScope()) {
  const task = scope ? runInScope(scope, () => recordProviderCall(call)) : recordProviderCall(call);
  afterResponse(task, scope);
}

function promptEstimate(request: ChatRequest): number {
  return estimateTokens(JSON.stringify(request.messages));
}

export interface GatewayResult {
  route: Route;
  completion: ChatCompletion;
}

/** Tries each route in order; moves on only when a failure is retryable. */
export async function gatewayComplete(request: ChatRequest, routes: Route[]): Promise<GatewayResult> {
  let lastError: GatewayError | null = null;
  for (const [i, route] of routes.entries()) {
    const started = Date.now();
    try {
      const completion = await callModel(route, request);
      const usage = completion.usage ?? {
        prompt_tokens: promptEstimate(request),
        completion_tokens: estimateTokens(JSON.stringify(completion.choices.map((c) => c.message))),
        total_tokens: 0,
      };
      usage.total_tokens ||= usage.prompt_tokens + usage.completion_tokens;
      meterLater(usageCall(route, started, usage));
      return { route, completion };
    } catch (error) {
      lastError = error as GatewayError;
      meterLater(usageCall(route, started, undefined, lastError));
      if (!lastError.retryable || i === routes.length - 1) throw lastError;
    }
  }
  throw lastError ?? new GatewayError("No model route was available.", 503, "provider_not_configured");
}

export interface GatewayStream {
  route: Route;
  body: ReadableStream<Uint8Array>;
}

/**
 * Streams from the first route that produces a first chunk in time; once
 * bytes flow, the provider is committed. The usage-only chunk adapters emit
 * is forwarded only when the client asked for it (stream_options.include_usage).
 */
export async function gatewayStream(request: ChatRequest, routes: Route[]): Promise<GatewayStream> {
  const includeUsage = request.stream_options?.include_usage === true;
  // Captured here: stream callbacks run outside the request's async context.
  const scope = requestScope();
  let lastError: GatewayError | null = null;

  for (const [i, route] of routes.entries()) {
    const started = Date.now();
    const timeoutMs = route.provider.timeoutMs;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new DOMException("first chunk timed out", "TimeoutError")), timeoutMs);
    const iterator = adapterFor(route.provider).stream(route, request, controller.signal);
    let first: IteratorResult<ChatChunk>;
    try {
      first = await iterator.next();
    } catch (error) {
      clearTimeout(timer);
      lastError = asGatewayError(error, route, timeoutMs);
      meterLater(usageCall(route, started, undefined, lastError), scope);
      if (!lastError.retryable || i === routes.length - 1) throw lastError;
      continue;
    }
    clearTimeout(timer);

    async function* metered(): AsyncGenerator<ChatChunk> {
      let usage: Usage | undefined;
      let outputChars = 0;
      let failure: GatewayError | undefined;
      try {
        for (let next = first; !next.done; next = await iterator.next()) {
          const value = next.value;
          if (value.usage) usage = value.usage;
          for (const choice of value.choices) {
            outputChars += choice.delta.content?.length ?? 0;
            for (const call of choice.delta.tool_calls ?? []) outputChars += call.function?.arguments?.length ?? 0;
          }
          if (value.choices.length || includeUsage) yield value;
        }
      } catch (error) {
        failure = asGatewayError(error, route, timeoutMs);
        throw failure;
      } finally {
        await iterator.return?.(undefined);
        const measured = usage ?? {
          prompt_tokens: promptEstimate(request),
          completion_tokens: Math.max(1, Math.round(outputChars / 4)),
          total_tokens: 0,
        };
        measured.total_tokens ||= measured.prompt_tokens + measured.completion_tokens;
        meterLater(usageCall(route, started, measured, failure), scope);
      }
    }

    return { route, body: sseStream(metered()) };
  }
  throw lastError ?? new GatewayError("No model route was available.", 503, "provider_not_configured");
}
