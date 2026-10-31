import { env } from "cloudflare:workers";
import { GatewayError } from "@/lib/universal/types";
import { setting } from "@/lib/settings";

/**
 * Vitex provider registry — any company's model API, addressed one way.
 *
 * A model is named `<provider>/<model>` (e.g. `anthropic/claude-haiku-5-5`,
 * `workers-ai/@cf/meta/llama-3.1-8b-instruct`, `acme/risk-large`). Providers
 * come from three places:
 *
 *  1. Presets: setting a provider's usual key (ANTHROPIC_API_KEY, GROQ_API_KEY,
 *     …) enables it. `<ID>_BASE_URL` points a preset elsewhere, e.g. at a
 *     Cloudflare AI Gateway or a regional endpoint.
 *  2. VITEX_PROVIDERS: a JSON list describing any other server — one speaking
 *     the OpenAI, Anthropic or Gemini protocol, or any other JSON API through
 *     the "custom" protocol (request template + response paths). An entry whose
 *     id matches a preset extends it. Secrets are referenced by env-var name
 *     (`apiKeyEnv`, `${NAME}` in header, query and URL values).
 *  3. Legacy SG16_AI_* settings, which keep working exactly as before.
 *
 * A caller that names its own server (x-vitex-base-url) bypasses this registry:
 * the request is forwarded untouched (src/worker/passthrough.ts).
 */

export type Protocol = "openai" | "anthropic" | "gemini" | "workers-ai" | "custom";

/** How to talk to a JSON API that follows none of the standard protocols. */
export interface CustomProtocol {
  /** Appended to baseUrl; the request is a POST with a JSON body. */
  path: string;
  /** The JSON body, with {{model}}, {{messages}}, {{prompt}}, {{system}}, {{last_user}}, {{max_tokens}}, {{temperature}}, {{top_p}}, {{stop}}. */
  requestTemplate: unknown;
  /** Dot paths into the JSON reply (e.g. "result.text", "choices.0.text"). */
  responseMap: { content?: string; promptTokens?: string; completionTokens?: string };
}

export interface ModelSpec {
  id: string;
  inputPerM?: number;
  outputPerM?: number;
}

export interface ProviderSpec {
  id: string;
  label: string;
  protocol: Protocol;
  baseUrl: string;
  apiKey?: string;
  authHeader: string;
  authScheme: string;
  headers: Record<string, string>;
  query: Record<string, string>;
  models: ModelSpec[];
  defaultModel?: string;
  /** Metering rates in USD per million tokens. */
  inputPerM: number;
  outputPerM: number;
  /** OpenAI protocol: send response_format json_object for structured internal calls. */
  jsonMode: boolean;
  /** OpenAI protocol: ask for stream_options.include_usage so streams can be metered exactly. */
  streamUsage: boolean;
  /** Anthropic protocol: forward temperature/top_p (current Claude models reject them). */
  sampling: boolean;
  /** Ask the provider for its live model list in /v1/models. */
  listModels: boolean;
  timeoutMs: number;
  docsUrl?: string;
  /** Set when protocol is "custom". */
  custom?: CustomProtocol;
  source: "preset" | "custom" | "legacy";
}

export interface ProviderStatus {
  id: string;
  label: string;
  protocol: Protocol;
  enabled: boolean;
  reason: string | null;
  source: ProviderSpec["source"];
  defaultModel: string | null;
  docsUrl: string | null;
}

export interface Route {
  provider: ProviderSpec;
  /** The provider's own model id. */
  model: string;
  /** `<provider>/<model>`, as clients address it. */
  id: string;
  inputPerM: number;
  outputPerM: number;
}

interface Preset {
  id: string;
  label: string;
  protocol: Protocol;
  baseUrl?: string;
  keyEnv: string[];
  authHeader?: string;
  authScheme?: string;
  headers?: Record<string, string>;
  defaultModel?: string;
  streamUsage?: boolean;
  docsUrl?: string;
}

const OPENAI_BASE_URL = "https://api.openai.com/v1";

// Order is the default-provider priority when VITEX_DEFAULT_PROVIDER is unset.
const PRESETS: Preset[] = [
  { id: "openai", label: "OpenAI", protocol: "openai", baseUrl: OPENAI_BASE_URL, keyEnv: ["OPENAI_API_KEY", "SG16_AI_API_KEY"], defaultModel: "gpt-4o-mini", streamUsage: true, docsUrl: "https://openai.com/api/pricing/" },
  { id: "anthropic", label: "Anthropic Claude", protocol: "anthropic", baseUrl: "https://api.anthropic.com/v1", keyEnv: ["ANTHROPIC_API_KEY"], authHeader: "x-api-key", authScheme: "", headers: { "anthropic-version": "2023-06-01" }, defaultModel: "claude-haiku-5-5", docsUrl: "https://platform.claude.com/docs/en/about-claude/pricing" },
  { id: "gemini", label: "Google Gemini", protocol: "gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta", keyEnv: ["GEMINI_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY"], authHeader: "x-goog-api-key", authScheme: "", defaultModel: "gemini-2.5-flash", docsUrl: "https://ai.google.dev/gemini-api/docs/pricing" },
  { id: "workers-ai", label: "Cloudflare Workers AI", protocol: "workers-ai", keyEnv: ["CLOUDFLARE_API_TOKEN"], defaultModel: "@cf/meta/llama-3.1-8b-instruct", docsUrl: "https://developers.cloudflare.com/workers-ai/platform/pricing/" },
  { id: "azure-openai", label: "Azure OpenAI", protocol: "openai", keyEnv: ["AZURE_OPENAI_API_KEY"], authHeader: "api-key", authScheme: "", streamUsage: true },
  { id: "mistral", label: "Mistral AI", protocol: "openai", baseUrl: "https://api.mistral.ai/v1", keyEnv: ["MISTRAL_API_KEY"], defaultModel: "mistral-small-latest" },
  { id: "groq", label: "Groq", protocol: "openai", baseUrl: "https://api.groq.com/openai/v1", keyEnv: ["GROQ_API_KEY"], defaultModel: "llama-3.1-8b-instant", streamUsage: true },
  { id: "deepseek", label: "DeepSeek", protocol: "openai", baseUrl: "https://api.deepseek.com/v1", keyEnv: ["DEEPSEEK_API_KEY"], defaultModel: "deepseek-chat", streamUsage: true },
  { id: "qwen", label: "Alibaba Qwen (DashScope)", protocol: "openai", baseUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1", keyEnv: ["DASHSCOPE_API_KEY"], defaultModel: "qwen-plus" },
  { id: "xai", label: "xAI Grok", protocol: "openai", baseUrl: "https://api.x.ai/v1", keyEnv: ["XAI_API_KEY"] },
  { id: "openrouter", label: "OpenRouter", protocol: "openai", baseUrl: "https://openrouter.ai/api/v1", keyEnv: ["OPENROUTER_API_KEY"], defaultModel: "openrouter/auto", streamUsage: true },
  { id: "together", label: "Together AI", protocol: "openai", baseUrl: "https://api.together.xyz/v1", keyEnv: ["TOGETHER_API_KEY"] },
  { id: "fireworks", label: "Fireworks AI", protocol: "openai", baseUrl: "https://api.fireworks.ai/inference/v1", keyEnv: ["FIREWORKS_API_KEY"] },
  { id: "perplexity", label: "Perplexity", protocol: "openai", baseUrl: "https://api.perplexity.ai", keyEnv: ["PERPLEXITY_API_KEY"], defaultModel: "sonar" },
  { id: "cerebras", label: "Cerebras", protocol: "openai", baseUrl: "https://api.cerebras.ai/v1", keyEnv: ["CEREBRAS_API_KEY"] },
  { id: "cohere", label: "Cohere", protocol: "openai", baseUrl: "https://api.cohere.ai/compatibility/v1", keyEnv: ["COHERE_API_KEY"] },
  { id: "nvidia", label: "NVIDIA NIM", protocol: "openai", baseUrl: "https://integrate.api.nvidia.com/v1", keyEnv: ["NVIDIA_API_KEY"] },
  { id: "huggingface", label: "Hugging Face Inference", protocol: "openai", baseUrl: "https://router.huggingface.co/v1", keyEnv: ["HF_TOKEN"] },
];

const PROTOCOLS = new Set<Protocol>(["openai", "anthropic", "gemini", "workers-ai", "custom"]);
const ID_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;
const DEFAULT_TIMEOUT_MS = 60_000;

function envValue(name: string): string | undefined {
  const value = setting(name)?.trim();
  return value ? value : undefined;
}

function firstEnv(names: string[]): { name: string; value: string } | undefined {
  for (const name of names) {
    const value = envValue(name);
    if (value) return { name, value };
  }
  return undefined;
}

function envPrefix(id: string) {
  return id.toUpperCase().replace(/-/g, "_");
}

function rate(name: string, fallback: number): number {
  const raw = envValue(name);
  const n = Number(raw);
  return raw !== undefined && Number.isFinite(n) && n >= 0 ? n : fallback;
}

/** `${NAME}` placeholders resolve from the environment; a missing one is an error, not an empty string. */
function interpolate(value: string, missing: Set<string>): string {
  return value.replace(/\$\{([A-Z0-9_]+)\}/g, (_match, name: string) => {
    const resolved = envValue(name);
    if (resolved === undefined) missing.add(name);
    return resolved ?? "";
  });
}

function trimBase(url: string) {
  return url.replace(/\/+$/, "");
}

/**
 * Operator-configured URLs are trusted as given — public, internal or local
 * (localhost model servers in development, private hosts reached through a
 * tunnel). They only need to be absolute http(s) URLs without embedded credentials.
 */
export function checkProviderUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return `"${raw}" is not an absolute URL`;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return `${url.protocol} URLs are not supported`;
  if (url.username || url.password) return "credentials belong in apiKeyEnv, not in the URL";
  return null;
}

type CustomEntry = {
  id?: unknown;
  label?: unknown;
  protocol?: unknown;
  baseUrl?: unknown;
  apiKeyEnv?: unknown;
  authHeader?: unknown;
  authScheme?: unknown;
  headers?: unknown;
  query?: unknown;
  models?: unknown;
  defaultModel?: unknown;
  inputPerM?: unknown;
  outputPerM?: unknown;
  jsonMode?: unknown;
  streamUsage?: unknown;
  sampling?: unknown;
  listModels?: unknown;
  timeoutMs?: unknown;
  enabled?: unknown;
  path?: unknown;
  requestTemplate?: unknown;
  responseMap?: unknown;
};

function customProtocol(entry: CustomEntry): CustomProtocol {
  const map = entry.responseMap && typeof entry.responseMap === "object" ? (entry.responseMap as Record<string, unknown>) : {};
  const path = (key: string) => (typeof map[key] === "string" ? (map[key] as string) : undefined);
  return {
    path: typeof entry.path === "string" ? entry.path : "",
    requestTemplate: entry.requestTemplate,
    responseMap: { content: path("content"), promptTokens: path("promptTokens"), completionTokens: path("completionTokens") },
  };
}

function stringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value)) if (typeof v === "string" || typeof v === "number") out[k] = String(v);
  return out;
}

function modelList(value: unknown): ModelSpec[] {
  if (!Array.isArray(value)) return [];
  const out: ModelSpec[] = [];
  for (const item of value) {
    if (typeof item === "string" && item.trim()) out.push({ id: item.trim() });
    else if (item && typeof item === "object" && typeof (item as { id?: unknown }).id === "string") {
      const spec = item as { id: string; inputPerM?: unknown; outputPerM?: unknown };
      out.push({
        id: spec.id.trim(),
        inputPerM: typeof spec.inputPerM === "number" ? spec.inputPerM : undefined,
        outputPerM: typeof spec.outputPerM === "number" ? spec.outputPerM : undefined,
      });
    }
  }
  return out;
}

function customEntries(): { entries: CustomEntry[]; error?: string } {
  const raw = envValue("VITEX_PROVIDERS");
  if (!raw) return { entries: [] };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) return { entries: parsed.filter((e) => e && typeof e === "object") as CustomEntry[] };
    if (parsed && typeof parsed === "object") {
      return { entries: Object.entries(parsed).map(([id, e]) => ({ ...(e as CustomEntry), id })) };
    }
    return { entries: [], error: "VITEX_PROVIDERS must be a JSON array or object" };
  } catch (error) {
    return { entries: [], error: `VITEX_PROVIDERS is not valid JSON (${(error as Error).message})` };
  }
}

interface Registry {
  enabled: ProviderSpec[];
  statuses: ProviderStatus[];
  defaultProvider: ProviderSpec | null;
  defaultModel: string | null;
  configError: string | null;
}

let registry: Registry | null = null;

function buildRegistry(): Registry {
  const statuses: ProviderStatus[] = [];
  const enabled: ProviderSpec[] = [];
  const inputPerM = rate("SG16_AI_INPUT_PRICE_PER_M", 0.05);
  const outputPerM = rate("SG16_AI_OUTPUT_PRICE_PER_M", 0.25);
  const { entries, error: configError } = customEntries();
  const overrides = new Map<string, CustomEntry>();
  for (const entry of entries) if (typeof entry.id === "string") overrides.set(entry.id, entry);

  const accept = (spec: ProviderSpec, reason: string | null) => {
    statuses.push({
      id: spec.id,
      label: spec.label,
      protocol: spec.protocol,
      enabled: reason === null,
      reason,
      source: spec.source,
      defaultModel: spec.defaultModel ?? null,
      docsUrl: spec.docsUrl ?? null,
    });
    if (reason === null) enabled.push(spec);
  };

  // Legacy: SG16_AI_BASE_URL pointing anywhere but OpenAI becomes its own provider.
  const legacyBase = envValue("SG16_AI_BASE_URL");
  const legacyCustom = legacyBase && trimBase(legacyBase) !== OPENAI_BASE_URL ? trimBase(legacyBase) : null;
  // Same precedence the original adapter used.
  const legacyKey = firstEnv(["OPENAI_API_KEY", "SG16_AI_API_KEY"]);
  if (legacyCustom) {
    const urlProblem = checkProviderUrl(legacyCustom);
    accept(
      {
        id: "sg16",
        label: "SG16 AI endpoint",
        protocol: "openai",
        baseUrl: legacyCustom,
        apiKey: legacyKey?.value,
        authHeader: "authorization",
        authScheme: "Bearer",
        headers: {},
        query: {},
        models: [],
        defaultModel: envValue("SG16_AI_MODEL") ?? "gpt-4o-mini",
        inputPerM,
        outputPerM,
        jsonMode: true,
        streamUsage: false,
        sampling: true,
        listModels: true,
        timeoutMs: DEFAULT_TIMEOUT_MS,
        source: "legacy",
      },
      urlProblem ?? (legacyKey ? null : "SG16_AI_API_KEY / OPENAI_API_KEY not configured"),
    );
  }

  for (const preset of PRESETS) {
    const override = overrides.get(preset.id);
    overrides.delete(preset.id);
    const prefix = envPrefix(preset.id);
    let key = firstEnv(preset.keyEnv);
    let reason: string | null = null;
    let protocol = preset.protocol;
    let baseUrl = envValue(`${prefix}_BASE_URL`) ?? preset.baseUrl ?? "";

    if (preset.id === "openai" && legacyCustom && typeof override?.apiKeyEnv !== "string") {
      // The legacy endpoint ("sg16") already uses this key; it was never meant for api.openai.com.
      key = undefined;
      reason = 'Its key is used by SG16_AI_BASE_URL (provider "sg16")';
    }

    if (preset.id === "workers-ai") {
      const account = envValue("CLOUDFLARE_ACCOUNT_ID");
      if ((env as unknown as { AI?: unknown }).AI) {
        // The binding needs no key and no URL.
        baseUrl = "binding:AI";
        key = { name: "AI", value: "" };
      } else if (account && key) {
        protocol = "openai";
        baseUrl = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}/ai/v1`;
      } else {
        reason = 'Bind Workers AI ("ai" in wrangler.jsonc) or set CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN';
      }
    }

    if (override?.apiKeyEnv && typeof override.apiKeyEnv === "string") key = firstEnv([override.apiKeyEnv]);
    const missing = new Set<string>();
    if (typeof override?.baseUrl === "string") baseUrl = interpolate(override.baseUrl, missing);

    const spec: ProviderSpec = {
      id: preset.id,
      label: typeof override?.label === "string" ? override.label : preset.label,
      protocol: typeof override?.protocol === "string" && PROTOCOLS.has(override.protocol as Protocol) ? (override.protocol as Protocol) : protocol,
      baseUrl: trimBase(baseUrl),
      apiKey: key?.value,
      authHeader: typeof override?.authHeader === "string" ? override.authHeader.toLowerCase() : preset.authHeader ?? "authorization",
      authScheme: typeof override?.authScheme === "string" ? override.authScheme : preset.authScheme ?? "Bearer",
      headers: { ...preset.headers, ...mapValues(stringRecord(override?.headers), (v) => interpolate(v, missing)) },
      query: mapValues(stringRecord(override?.query), (v) => interpolate(v, missing)),
      models: modelList(override?.models),
      defaultModel: typeof override?.defaultModel === "string" ? override.defaultModel : preset.id === "openai" ? envValue("SG16_AI_MODEL") ?? preset.defaultModel : preset.defaultModel,
      inputPerM: typeof override?.inputPerM === "number" ? override.inputPerM : inputPerM,
      outputPerM: typeof override?.outputPerM === "number" ? override.outputPerM : outputPerM,
      jsonMode: typeof override?.jsonMode === "boolean" ? override.jsonMode : true,
      streamUsage: typeof override?.streamUsage === "boolean" ? override.streamUsage : preset.streamUsage ?? false,
      sampling: typeof override?.sampling === "boolean" ? override.sampling : false,
      listModels: typeof override?.listModels === "boolean" ? override.listModels : baseUrl !== "binding:AI",
      timeoutMs: typeof override?.timeoutMs === "number" && override.timeoutMs > 0 ? override.timeoutMs : DEFAULT_TIMEOUT_MS,
      docsUrl: preset.docsUrl,
      source: override ? "custom" : "preset",
    };

    if (!reason && override?.enabled === false) reason = "Disabled in VITEX_PROVIDERS";
    if (!reason && missing.size) reason = `Missing environment variables: ${[...missing].join(", ")}`;
    if (!reason && !key) reason = `${preset.keyEnv[0]} not configured`;
    if (!reason && !spec.baseUrl) reason = `${prefix}_BASE_URL not configured`;
    if (!reason && spec.baseUrl !== "binding:AI") reason = checkProviderUrl(spec.baseUrl);
    accept(spec, reason);
  }

  // Remaining VITEX_PROVIDERS entries describe servers no preset covers.
  for (const entry of overrides.values()) {
    const id = String(entry.id);
    const missing = new Set<string>();
    const baseUrl = typeof entry.baseUrl === "string" ? trimBase(interpolate(entry.baseUrl, missing)) : "";
    const protocol = typeof entry.protocol === "string" && PROTOCOLS.has(entry.protocol as Protocol) ? (entry.protocol as Protocol) : "openai";
    const key = typeof entry.apiKeyEnv === "string" ? firstEnv([entry.apiKeyEnv]) : undefined;
    const spec: ProviderSpec = {
      id,
      label: typeof entry.label === "string" ? entry.label : id,
      protocol,
      baseUrl,
      apiKey: key?.value,
      authHeader: typeof entry.authHeader === "string" ? entry.authHeader.toLowerCase() : protocol === "anthropic" ? "x-api-key" : protocol === "gemini" ? "x-goog-api-key" : "authorization",
      authScheme: typeof entry.authScheme === "string" ? entry.authScheme : protocol === "openai" || protocol === "custom" ? "Bearer" : "",
      headers: {
        ...(protocol === "anthropic" ? { "anthropic-version": "2023-06-01" } : {}),
        ...mapValues(stringRecord(entry.headers), (v) => interpolate(v, missing)),
      },
      query: mapValues(stringRecord(entry.query), (v) => interpolate(v, missing)),
      models: modelList(entry.models),
      defaultModel: typeof entry.defaultModel === "string" ? entry.defaultModel : modelList(entry.models)[0]?.id,
      inputPerM: typeof entry.inputPerM === "number" ? entry.inputPerM : inputPerM,
      outputPerM: typeof entry.outputPerM === "number" ? entry.outputPerM : outputPerM,
      jsonMode: typeof entry.jsonMode === "boolean" ? entry.jsonMode : false,
      streamUsage: typeof entry.streamUsage === "boolean" ? entry.streamUsage : false,
      sampling: typeof entry.sampling === "boolean" ? entry.sampling : protocol !== "anthropic",
      listModels: typeof entry.listModels === "boolean" ? entry.listModels : true,
      timeoutMs: typeof entry.timeoutMs === "number" && entry.timeoutMs > 0 ? entry.timeoutMs : DEFAULT_TIMEOUT_MS,
      custom: protocol === "custom" ? customProtocol(entry) : undefined,
      source: "custom",
    };
    let reason: string | null = null;
    if (!ID_RE.test(id)) reason = "id must be lowercase letters, digits and dashes";
    else if (statuses.some((s) => s.id === id)) reason = `Duplicate provider id "${id}"`;
    else if (entry.enabled === false) reason = "Disabled in VITEX_PROVIDERS";
    else if (protocol === "workers-ai") reason = 'Workers AI is configured through the "workers-ai" preset';
    else if (protocol === "custom" && (!entry.requestTemplate || typeof entry.requestTemplate !== "object")) {
      reason = 'The "custom" protocol needs a requestTemplate object';
    }
    else if (missing.size) reason = `Missing environment variables: ${[...missing].join(", ")}`;
    else if (typeof entry.apiKeyEnv === "string" && !key) reason = `${entry.apiKeyEnv} not configured`;
    else if (!baseUrl) reason = "baseUrl is required";
    else reason = checkProviderUrl(baseUrl);
    accept(spec, reason);
  }

  const preferred = envValue("VITEX_DEFAULT_PROVIDER");
  const defaultProvider = (preferred ? enabled.find((p) => p.id === preferred) : undefined) ?? enabled.find((p) => p.defaultModel) ?? enabled[0] ?? null;
  const explicitDefault = envValue("VITEX_DEFAULT_MODEL");
  const defaultModel = explicitDefault ?? (defaultProvider?.defaultModel ? `${defaultProvider.id}/${defaultProvider.defaultModel}` : null);

  return { enabled, statuses, defaultProvider, defaultModel, configError: configError ?? null };
}

function mapValues(record: Record<string, string>, fn: (value: string) => string): Record<string, string> {
  return Object.fromEntries(Object.entries(record).map(([k, v]) => [k, fn(v)]));
}

function current(): Registry {
  // Secrets and bindings are fixed for the life of an isolate.
  return (registry ??= buildRegistry());
}

export function enabledProviders(): ProviderSpec[] {
  return current().enabled;
}

export function providerStatuses(): ProviderStatus[] {
  return current().statuses;
}

export function providersConfigError(): string | null {
  return current().configError;
}

function route(provider: ProviderSpec, model: string): Route {
  const spec = provider.models.find((m) => m.id === model);
  return {
    provider,
    model,
    id: `${provider.id}/${model}`,
    inputPerM: spec?.inputPerM ?? provider.inputPerM,
    outputPerM: spec?.outputPerM ?? provider.outputPerM,
  };
}

/** The model internal features use when no model is named, or null when no provider is configured. */
export function defaultRoute(): Route | null {
  const { defaultModel } = current();
  if (!defaultModel) return null;
  try {
    return resolveModel(defaultModel);
  } catch {
    return null;
  }
}

/**
 * Maps a client's model name to a provider. `<provider>/<model>` is exact;
 * a bare name goes to the provider that declares it, then to the default
 * provider. Model ids may themselves contain slashes (OpenRouter, Workers AI).
 */
export function resolveModel(requested?: string): Route {
  const { enabled, statuses, defaultProvider, defaultModel } = current();
  const name = requested?.trim() || defaultModel;
  if (!name) {
    throw new GatewayError(
      "No model provider is configured. Send the request to your own server with the x-vitex-base-url header, or have the operator set a provider key (OPENAI_API_KEY, ANTHROPIC_API_KEY, …) or describe a server in VITEX_PROVIDERS.",
      503,
      "provider_not_configured",
    );
  }

  const slash = name.indexOf("/");
  if (slash > 0) {
    const prefix = name.slice(0, slash);
    const rest = name.slice(slash + 1);
    const provider = enabled.find((p) => p.id === prefix);
    if (provider && rest) return route(provider, rest);
    const known = statuses.find((s) => s.id === prefix);
    if (known && !known.enabled) {
      throw new GatewayError(`Provider "${prefix}" is not available: ${known.reason}.`, 503, "provider_not_configured");
    }
  }

  const declaring = enabled.find((p) => p.models.some((m) => m.id === name));
  if (declaring) return route(declaring, name);
  if (!defaultProvider) {
    throw new GatewayError("No model provider is configured.", 503, "provider_not_configured");
  }
  return route(defaultProvider, name);
}

