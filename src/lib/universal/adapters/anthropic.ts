import { readSse } from "@/lib/universal/sse";
import { GatewayError, type ChatCompletion, type ChatMessage, type ChatRequest, type FinishReason, type ToolCall } from "@/lib/universal/types";
import type { ProviderSpec, Route } from "@/lib/universal/providers";
import {
  chunk,
  getJson,
  jsonInstruction,
  maxTokens,
  nowSeconds,
  parseArguments,
  parseDataUrl,
  postJson,
  providerUrl,
  stopList,
  textOf,
  usageChunk,
  usageOf,
  wantsJson,
  type Adapter,
} from "@/lib/universal/adapters/common";

/**
 * Anthropic Messages API (POST /v1/messages, anthropic-version 2023-06-01).
 *
 * Translation notes:
 *  - system/developer turns become the top-level `system` string; tool turns
 *    become `tool_result` blocks; consecutive same-role turns are merged.
 *  - `max_tokens` is required; current models also spend it on adaptive
 *    thinking, so the default is generous.
 *  - temperature/top_p are dropped unless the provider opts in (`sampling`):
 *    current Claude models reject them with a 400.
 *  - Forced tool choice ("required" / a named function) maps to any/tool; the
 *    newest models reject that, so the call is retried once with auto.
 *  - thinking blocks are not part of the OpenAI shape and are skipped.
 */

const DEFAULT_MAX_TOKENS = 16_000;

type Block =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } | { type: "url"; url: string } }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string };

type Turn = { role: "user" | "assistant"; content: Block[] };

function userBlocks(content: ChatMessage["content"]): Block[] {
  if (typeof content === "string") return content ? [{ type: "text", text: content }] : [];
  if (!Array.isArray(content)) return [];
  const blocks: Block[] = [];
  for (const part of content) {
    if (part?.type === "text" && part.text) blocks.push({ type: "text", text: part.text });
    else if (part?.type === "image_url" && part.image_url?.url) {
      const inline = parseDataUrl(part.image_url.url);
      blocks.push({
        type: "image",
        source: inline ? { type: "base64", media_type: inline.mimeType, data: inline.data } : { type: "url", url: part.image_url.url },
      });
    }
  }
  return blocks;
}

function convertMessages(messages: ChatMessage[]): { system: string[]; turns: Turn[] } {
  const system: string[] = [];
  const turns: Turn[] = [];
  const push = (role: Turn["role"], blocks: Block[]) => {
    if (!blocks.length) return;
    const last = turns[turns.length - 1];
    if (last?.role === role) last.content.push(...blocks);
    else turns.push({ role, content: blocks });
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
        push("user", userBlocks(message.content));
        break;
      case "assistant": {
        const blocks: Block[] = [];
        const text = textOf(message.content);
        if (text) blocks.push({ type: "text", text });
        for (const call of message.tool_calls ?? []) {
          blocks.push({ type: "tool_use", id: call.id, name: call.function.name, input: parseArguments(call.function.arguments) });
        }
        push("assistant", blocks);
        break;
      }
      case "tool":
        push("user", [{ type: "tool_result", tool_use_id: message.tool_call_id ?? "", content: textOf(message.content) }]);
        break;
    }
  }
  return { system, turns };
}

function toolChoice(choice: ChatRequest["tool_choice"]): Record<string, unknown> | undefined {
  if (!choice) return undefined;
  if (choice === "auto") return { type: "auto" };
  if (choice === "none") return { type: "none" };
  if (choice === "required") return { type: "any" };
  if (typeof choice === "object" && choice.function?.name) return { type: "tool", name: choice.function.name };
  return undefined;
}

function payload(route: Route, request: ChatRequest, stream: boolean): Record<string, unknown> {
  const { system, turns } = convertMessages(request.messages);
  if (wantsJson(request)) system.push(jsonInstruction(request));
  const body: Record<string, unknown> = {
    model: route.model,
    max_tokens: maxTokens(request) ?? DEFAULT_MAX_TOKENS,
    messages: turns,
  };
  if (system.length) body.system = system.join("\n\n");
  const stop = stopList(request.stop);
  if (stop) body.stop_sequences = stop;
  if (route.provider.sampling) {
    if (typeof request.temperature === "number") body.temperature = request.temperature;
    if (typeof request.top_p === "number") body.top_p = request.top_p;
  }
  if (request.tools?.length) {
    body.tools = request.tools.map((tool) => ({
      name: tool.function.name,
      ...(tool.function.description ? { description: tool.function.description } : {}),
      input_schema: tool.function.parameters ?? { type: "object", properties: {} },
    }));
    const choice = toolChoice(request.tool_choice);
    if (choice) body.tool_choice = choice;
  }
  if (typeof request.user === "string" && request.user) body.metadata = { user_id: request.user.slice(0, 256) };
  if (stream) body.stream = true;
  return body;
}

async function send(route: Route, body: Record<string, unknown>, signal: AbortSignal): Promise<Response> {
  const url = providerUrl(route.provider, "/messages");
  try {
    return await postJson(route.provider, url, body, signal);
  } catch (error) {
    const forced = (body.tool_choice as { type?: string } | undefined)?.type;
    if (error instanceof GatewayError && error.status === 400 && (forced === "any" || forced === "tool") && /tool_choice/i.test(error.message)) {
      return postJson(route.provider, url, { ...body, tool_choice: { type: "auto" } }, signal);
    }
    throw error;
  }
}

function finishReason(stop: string | null | undefined, hasTools: boolean): FinishReason {
  if (stop === "tool_use" || (hasTools && stop !== "max_tokens")) return "tool_calls";
  if (stop === "max_tokens") return "length";
  if (stop === "refusal") return "content_filter";
  return "stop";
}

interface AnthropicUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

function promptTokens(usage: AnthropicUsage | undefined): number {
  return (usage?.input_tokens ?? 0) + (usage?.cache_creation_input_tokens ?? 0) + (usage?.cache_read_input_tokens ?? 0);
}

export const anthropicAdapter: Adapter = {
  async complete(route, request, signal) {
    const res = await send(route, payload(route, request, false), signal);
    const data = (await res.json()) as {
      id?: string;
      content?: Array<{ type: string; text?: string; id?: string; name?: string; input?: unknown }>;
      stop_reason?: string | null;
      usage?: AnthropicUsage;
    };
    const blocks = data.content ?? [];
    const text = blocks.filter((b) => b.type === "text").map((b) => b.text ?? "").join("");
    const toolCalls: ToolCall[] = blocks
      .filter((b) => b.type === "tool_use")
      .map((b) => ({ id: b.id ?? "", type: "function", function: { name: b.name ?? "", arguments: JSON.stringify(b.input ?? {}) } }));
    const completion: ChatCompletion = {
      id: data.id ?? "",
      object: "chat.completion",
      created: nowSeconds(),
      model: route.id,
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: text || (toolCalls.length ? null : ""), ...(toolCalls.length ? { tool_calls: toolCalls } : {}) },
          finish_reason: finishReason(data.stop_reason, toolCalls.length > 0),
        },
      ],
      usage: usageOf(promptTokens(data.usage), data.usage?.output_tokens ?? 0),
    };
    return completion;
  },

  async *stream(route, request, signal) {
    const res = await send(route, payload(route, request, true), signal);
    if (!res.body) throw new GatewayError(`${route.provider.label} returned an empty stream.`, 502);
    let id = "";
    let prompt = 0;
    let completion = 0;
    let stop: string | null = null;
    const toolIndex = new Map<number, number>();

    for await (const event of readSse(res.body)) {
      let data: {
        type?: string;
        index?: number;
        message?: { id?: string; usage?: AnthropicUsage };
        content_block?: { type?: string; id?: string; name?: string; text?: string };
        delta?: { type?: string; text?: string; partial_json?: string; stop_reason?: string | null };
        usage?: AnthropicUsage;
        error?: { message?: string };
      };
      try {
        data = JSON.parse(event.data);
      } catch {
        continue;
      }
      switch (data.type) {
        case "message_start":
          id = data.message?.id ?? id;
          prompt = promptTokens(data.message?.usage);
          completion = data.message?.usage?.output_tokens ?? 0;
          yield chunk(id, route, { role: "assistant", content: "" });
          break;
        case "content_block_start":
          if (data.content_block?.type === "tool_use" && typeof data.index === "number") {
            const index = toolIndex.size;
            toolIndex.set(data.index, index);
            yield chunk(id, route, {
              tool_calls: [{ index, id: data.content_block.id, type: "function", function: { name: data.content_block.name, arguments: "" } }],
            });
          } else if (data.content_block?.type === "text" && data.content_block.text) {
            yield chunk(id, route, { content: data.content_block.text });
          }
          break;
        case "content_block_delta":
          if (data.delta?.type === "text_delta" && data.delta.text) {
            yield chunk(id, route, { content: data.delta.text });
          } else if (data.delta?.type === "input_json_delta" && typeof data.index === "number" && toolIndex.has(data.index)) {
            yield chunk(id, route, { tool_calls: [{ index: toolIndex.get(data.index)!, function: { arguments: data.delta.partial_json ?? "" } }] });
          }
          break;
        case "message_delta":
          if (data.delta?.stop_reason) stop = data.delta.stop_reason;
          if (typeof data.usage?.output_tokens === "number") completion = data.usage.output_tokens;
          if (data.usage?.input_tokens !== undefined) prompt = promptTokens(data.usage);
          break;
        case "error":
          throw new GatewayError(`${route.provider.label} stream error: ${data.error?.message ?? "unknown"}`, 502);
      }
    }
    yield chunk(id, route, {}, finishReason(stop, toolIndex.size > 0));
    yield usageChunk(id, route, usageOf(prompt, completion));
  },

  async listModels(provider: ProviderSpec, signal) {
    const ids: string[] = [];
    let after: string | undefined;
    for (let page = 0; page < 5; page += 1) {
      const query: Record<string, string> = { limit: "1000" };
      if (after) query.after_id = after;
      const data = await getJson<{ data?: Array<{ id?: string }>; has_more?: boolean; last_id?: string }>(provider, providerUrl(provider, "/models", query), signal);
      for (const model of data.data ?? []) if (model.id) ids.push(model.id);
      if (!data.has_more || !data.last_id) break;
      after = data.last_id;
    }
    return ids;
  },
};
