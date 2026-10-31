/**
 * Vitex universal gateway — shared contract.
 *
 * Every model call, internal or external, is expressed in the OpenAI Chat
 * Completions shape: it is the de-facto lingua franca that existing SDKs and
 * tools already speak. Protocol adapters translate it to each provider's wire
 * format and back, so callers never special-case a provider.
 */

export type ChatRole = "system" | "developer" | "user" | "assistant" | "tool";

export type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string; detail?: string } };

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface ChatMessage {
  role: ChatRole;
  content?: string | ContentPart[] | null;
  name?: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface ToolDefinition {
  type: "function";
  function: { name: string; description?: string; parameters?: Record<string, unknown> };
}

export type ToolChoice = "none" | "auto" | "required" | { type: "function"; function: { name: string } };

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  max_completion_tokens?: number;
  stop?: string | string[];
  stream?: boolean;
  stream_options?: { include_usage?: boolean };
  tools?: ToolDefinition[];
  tool_choice?: ToolChoice;
  response_format?: { type: "text" | "json_object" | "json_schema"; json_schema?: { name?: string; schema?: unknown } };
  user?: string;
  /** Any other field reaches OpenAI-compatible providers unchanged. */
  [field: string]: unknown;
}

export type FinishReason = "stop" | "length" | "tool_calls" | "content_filter";

export interface Usage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface ChatCompletion {
  id: string;
  object: "chat.completion";
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: { role: "assistant"; content: string | null; tool_calls?: ToolCall[] };
    finish_reason: FinishReason | null;
  }>;
  usage?: Usage;
}

export interface ToolCallDelta {
  index: number;
  id?: string;
  type?: "function";
  function?: { name?: string; arguments?: string };
}

export interface ChatChunk {
  id: string;
  object: "chat.completion.chunk";
  created: number;
  model: string;
  /** Empty on the final usage-only chunk. */
  choices: Array<{
    index: number;
    delta: { role?: "assistant"; content?: string; tool_calls?: ToolCallDelta[] };
    finish_reason: FinishReason | null;
  }>;
  usage?: Usage | null;
}

/**
 * A failure that reaches the gateway's caller as an OpenAI-style error.
 * `status` is what the caller receives; `retryable` says whether another
 * model in the fallback chain may succeed where this one did not.
 */
export class GatewayError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly type = "upstream_error",
    readonly retryable = false,
  ) {
    super(message);
    this.name = "GatewayError";
  }
}
