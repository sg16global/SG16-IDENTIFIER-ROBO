import { readSse } from "@/lib/universal/sse";
import { GatewayError, type ChatCompletion, type ChatMessage, type ChatRequest, type FinishReason, type ToolCall } from "@/lib/universal/types";
import type { ProviderSpec } from "@/lib/universal/providers";
import {
  chunk,
  completionId,
  getJson,
  guessImageType,
  maxTokens,
  nowSeconds,
  parseArguments,
  parseDataUrl,
  postJson,
  providerUrl,
  stopList,
  textOf,
  toolCallId,
  usageChunk,
  usageOf,
  wantsJson,
  type Adapter,
} from "@/lib/universal/adapters/common";

/**
 * Google Gemini API (models/{model}:generateContent, :streamGenerateContent?alt=sse).
 *
 * Translation notes:
 *  - system/developer turns become `systemInstruction`; assistant turns use
 *    role "model"; tool results become `functionResponse` parts, named by
 *    looking up the call they answer.
 *  - Tool schemas are reduced to the OpenAPI subset Gemini accepts.
 *  - JSON mode is `responseMimeType: application/json`, except alongside tools,
 *    where Gemini does not allow it.
 *  - Thought parts and thought tokens are not returned as content; thought
 *    tokens are counted as completion tokens, since they are billed as output.
 */

type Part =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } }
  | { fileData: { mimeType: string; fileUri: string } }
  | { functionCall: { name: string; args: Record<string, unknown> } }
  | { functionResponse: { name: string; response: Record<string, unknown> } };

type Content = { role: "user" | "model"; parts: Part[] };

function userParts(content: ChatMessage["content"]): Part[] {
  if (typeof content === "string") return content ? [{ text: content }] : [];
  if (!Array.isArray(content)) return [];
  const parts: Part[] = [];
  for (const part of content) {
    if (part?.type === "text" && part.text) parts.push({ text: part.text });
    else if (part?.type === "image_url" && part.image_url?.url) {
      const inline = parseDataUrl(part.image_url.url);
      parts.push(
        inline
          ? { inlineData: { mimeType: inline.mimeType, data: inline.data } }
          : { fileData: { mimeType: guessImageType(part.image_url.url), fileUri: part.image_url.url } },
      );
    }
  }
  return parts;
}

function convertMessages(messages: ChatMessage[]): { system: string[]; contents: Content[] } {
  const system: string[] = [];
  const contents: Content[] = [];
  const callNames = new Map<string, string>();
  const push = (role: Content["role"], parts: Part[]) => {
    if (!parts.length) return;
    const last = contents[contents.length - 1];
    if (last?.role === role) last.parts.push(...parts);
    else contents.push({ role, parts });
  };
  for (const message of messages) {
    switch (message.role) {
      case "system":
      case "developer": {
        const text = textOf(message.content);
        if (text) system.push(text);
        break;
      }
      case "user":
        push("user", userParts(message.content));
        break;
      case "assistant": {
        const parts: Part[] = [];
        const text = textOf(message.content);
        if (text) parts.push({ text });
        for (const call of message.tool_calls ?? []) {
          callNames.set(call.id, call.function.name);
          parts.push({ functionCall: { name: call.function.name, args: parseArguments(call.function.arguments) } });
        }
        push("model", parts);
        break;
      }
      case "tool": {
        const text = textOf(message.content);
        const parsed = parseArguments(text);
        const response = "raw" in parsed && Object.keys(parsed).length === 1 ? { content: text } : parsed;
        const name = callNames.get(message.tool_call_id ?? "") ?? message.name ?? "tool";
        push("user", [{ functionResponse: { name, response } }]);
        break;
      }
    }
  }
  return { system, contents };
}

const UNSUPPORTED_SCHEMA_KEYS = new Set([
  "$schema", "$id", "$ref", "$defs", "$comment", "definitions", "additionalProperties",
  "patternProperties", "unevaluatedProperties", "dependentSchemas", "examples", "strict",
]);

/** Reduces JSON Schema to the OpenAPI 3 subset Gemini function declarations accept. */
function sanitizeSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(sanitizeSchema);
  if (!schema || typeof schema !== "object") return schema;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schema)) {
    if (UNSUPPORTED_SCHEMA_KEYS.has(key)) continue;
    if (key === "const") out.enum = [value];
    else if (key === "type" && Array.isArray(value)) {
      const types = value.filter((t) => t !== "null");
      out.type = types[0] ?? "string";
      if (types.length < value.length) out.nullable = true;
    } else if (key === "properties" && value && typeof value === "object") {
      out.properties = Object.fromEntries(Object.entries(value).map(([k, v]) => [k, sanitizeSchema(v)]));
    } else out[key] = sanitizeSchema(value);
  }
  return out;
}

function functionParameters(parameters: Record<string, unknown> | undefined): unknown {
  if (!parameters) return undefined;
  const props = parameters.properties as Record<string, unknown> | undefined;
  // Gemini rejects an OBJECT schema with no properties; omit it instead.
  if (parameters.type === "object" && (!props || !Object.keys(props).length)) return undefined;
  return sanitizeSchema(parameters);
}

function toolConfig(choice: ChatRequest["tool_choice"]): Record<string, unknown> | undefined {
  if (!choice) return undefined;
  if (choice === "auto") return { functionCallingConfig: { mode: "AUTO" } };
  if (choice === "none") return { functionCallingConfig: { mode: "NONE" } };
  if (choice === "required") return { functionCallingConfig: { mode: "ANY" } };
  if (typeof choice === "object" && choice.function?.name) {
    return { functionCallingConfig: { mode: "ANY", allowedFunctionNames: [choice.function.name] } };
  }
  return undefined;
}

function payload(request: ChatRequest): Record<string, unknown> {
  const { system, contents } = convertMessages(request.messages);
  const body: Record<string, unknown> = { contents };
  if (system.length) body.systemInstruction = { parts: [{ text: system.join("\n\n") }] };
  const generationConfig: Record<string, unknown> = {};
  if (typeof request.temperature === "number") generationConfig.temperature = request.temperature;
  if (typeof request.top_p === "number") generationConfig.topP = request.top_p;
  const max = maxTokens(request);
  if (max) generationConfig.maxOutputTokens = max;
  const stop = stopList(request.stop);
  if (stop) generationConfig.stopSequences = stop.slice(0, 5);
  const hasTools = Boolean(request.tools?.length);
  if (wantsJson(request) && !hasTools) generationConfig.responseMimeType = "application/json";
  if (Object.keys(generationConfig).length) body.generationConfig = generationConfig;
  if (hasTools) {
    body.tools = [
      {
        functionDeclarations: request.tools!.map((tool) => {
          const parameters = functionParameters(tool.function.parameters);
          return {
            name: tool.function.name,
            ...(tool.function.description ? { description: tool.function.description } : {}),
            ...(parameters ? { parameters } : {}),
          };
        }),
      },
    ];
    const config = toolConfig(request.tool_choice);
    if (config) body.toolConfig = config;
  }
  return body;
}

function modelPath(model: string) {
  // "tunedModels/x" or "models/x" are already resource names.
  return model.includes("/") ? model : `models/${model}`;
}

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string; thought?: boolean; functionCall?: { id?: string; name?: string; args?: unknown } }> };
    finishReason?: string;
  }>;
  promptFeedback?: { blockReason?: string };
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number };
  error?: { message?: string };
}

function finishReason(reason: string | undefined, hasTools: boolean, blocked: boolean): FinishReason | null {
  if (blocked) return "content_filter";
  if (hasTools) return "tool_calls";
  if (!reason) return null;
  if (reason === "STOP") return "stop";
  if (reason === "MAX_TOKENS") return "length";
  if (["SAFETY", "RECITATION", "BLOCKLIST", "PROHIBITED_CONTENT", "SPII", "IMAGE_SAFETY"].includes(reason)) return "content_filter";
  return "stop";
}

function readParts(data: GeminiResponse): { text: string; calls: ToolCall[] } {
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  const text = parts.filter((p) => typeof p.text === "string" && !p.thought).map((p) => p.text).join("");
  const calls: ToolCall[] = parts
    .filter((p) => p.functionCall?.name)
    .map((p) => ({
      id: p.functionCall!.id ?? toolCallId(),
      type: "function",
      function: { name: p.functionCall!.name!, arguments: JSON.stringify(p.functionCall!.args ?? {}) },
    }));
  return { text, calls };
}

function usage(data: GeminiResponse) {
  const meta = data.usageMetadata;
  return usageOf(meta?.promptTokenCount ?? 0, (meta?.candidatesTokenCount ?? 0) + (meta?.thoughtsTokenCount ?? 0));
}

export const geminiAdapter: Adapter = {
  async complete(route, request, signal) {
    const url = providerUrl(route.provider, `/${modelPath(route.model)}:generateContent`);
    const res = await postJson(route.provider, url, payload(request), signal);
    const data = (await res.json()) as GeminiResponse;
    const { text, calls } = readParts(data);
    const blocked = !data.candidates?.length && Boolean(data.promptFeedback?.blockReason);
    const completion: ChatCompletion = {
      id: completionId(),
      object: "chat.completion",
      created: nowSeconds(),
      model: route.id,
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: text || (calls.length ? null : ""), ...(calls.length ? { tool_calls: calls } : {}) },
          finish_reason: finishReason(data.candidates?.[0]?.finishReason, calls.length > 0, blocked) ?? "stop",
        },
      ],
      usage: usage(data),
    };
    return completion;
  },

  async *stream(route, request, signal) {
    const url = providerUrl(route.provider, `/${modelPath(route.model)}:streamGenerateContent`, { alt: "sse" });
    const res = await postJson(route.provider, url, payload(request), signal);
    if (!res.body) throw new GatewayError(`${route.provider.label} returned an empty stream.`, 502);
    const id = completionId();
    let toolCount = 0;
    let reason: string | undefined;
    let blocked = false;
    let last: GeminiResponse = {};
    yield chunk(id, route, { role: "assistant", content: "" });
    for await (const event of readSse(res.body)) {
      let data: GeminiResponse;
      try {
        data = JSON.parse(event.data);
      } catch {
        continue;
      }
      if (data.error) throw new GatewayError(`${route.provider.label} stream error: ${data.error.message ?? "unknown"}`, 502);
      if (data.usageMetadata) last = data;
      if (data.promptFeedback?.blockReason && !data.candidates?.length) blocked = true;
      reason = data.candidates?.[0]?.finishReason ?? reason;
      const { text, calls } = readParts(data);
      if (text) yield chunk(id, route, { content: text });
      if (calls.length) {
        yield chunk(id, route, {
          tool_calls: calls.map((call) => ({ index: toolCount++, id: call.id, type: "function" as const, function: call.function })),
        });
      }
    }
    yield chunk(id, route, {}, finishReason(reason, toolCount > 0, blocked) ?? "stop");
    yield usageChunk(id, route, usage(last));
  },

  async listModels(provider: ProviderSpec, signal) {
    const data = await getJson<{ models?: Array<{ name?: string; supportedGenerationMethods?: string[] }> }>(
      provider,
      providerUrl(provider, "/models", { pageSize: "1000" }),
      signal,
    );
    return (data.models ?? [])
      .filter((m) => m.name && (m.supportedGenerationMethods ?? []).includes("generateContent"))
      .map((m) => m.name!.replace(/^models\//, ""));
  },
};
