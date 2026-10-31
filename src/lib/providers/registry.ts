import { db } from "@/db";
import { providerUsage } from "@/db/schema";
import type { ProviderCall } from "@/lib/types";
import { newId, round } from "@/lib/utils";
import { recordSpend } from "@/lib/security/rate-limit";
import { defaultRoute, enabledProviders, providerStatuses } from "@/lib/universal/providers";
import { setting } from "@/lib/settings";

/**
 * Provider registry.
 *
 * Every external source is an adapter behind this registry so a provider can be
 * replaced without touching the verification modules. Secrets are read only on
 * the server, and every call is metered for cost + latency (blueprint §5, §9).
 */

export interface ProviderConfig {
  id: string;
  label: string;
  purpose: string;
  enabled: boolean;
  reason?: string;
  costPerCallUsd: number;
  docsUrl?: string;
}

function envFlag(name: string, fallback = true): boolean {
  const raw = setting(name);
  if (raw === undefined) return fallback;
  return ["1", "true", "yes", "on"].includes(raw.toLowerCase());
}

export function getProviderConfigs(): ProviderConfig[] {
  const factCheckKey = setting("GOOGLE_FACTCHECK_API_KEY");
  const webRiskKey = setting("WEB_RISK_API_KEY") ?? setting("SAFE_BROWSING_API_KEY");
  // Any model the Vitex universal layer can reach (src/lib/universal/providers.ts).
  const ai = defaultRoute();
  const searchKey = setting("TAVILY_API_KEY") ?? setting("SERPER_API_KEY") ?? setting("BING_SEARCH_KEY");

  return [
    {
      id: "heuristics",
      label: "SG16 rules engine",
      purpose: "Checksums, identifier normalisation, lexicons, pattern rules. Runs locally, always available, zero marginal cost.",
      enabled: true,
      costPerCallUsd: 0,
    },
    {
      id: "domain-intel",
      label: "Domain & DNS intelligence",
      purpose: "SOA, NS, MX, TXT/SPF/DMARC, CNAME, TLS certificate age and issuer, redirect chain.",
      enabled: envFlag("SG16_ENABLE_DNS", true),
      costPerCallUsd: 0,
      docsUrl: "https://datatracker.ietf.org/doc/html/rfc1035",
    },
    {
      id: "catalog",
      label: "Internal product catalogue",
      purpose: "Normalised brand/model records with specification ranges and known counterfeit signals.",
      enabled: true,
      costPerCallUsd: 0,
    },
    {
      id: "google-factcheck",
      label: "Google Fact Check Tools API",
      purpose: "Retrieves existing claim reviews published by fact-checking organisations.",
      enabled: Boolean(factCheckKey),
      reason: factCheckKey ? undefined : "GOOGLE_FACTCHECK_API_KEY not configured",
      costPerCallUsd: 0,
      docsUrl: "https://developers.google.com/fact-check/tools-api",
    },
    {
      id: "web-risk",
      label: "Google Web Risk / Safe Browsing",
      purpose: "Commercial malicious-URL lookup (phishing, malware, unwanted software).",
      enabled: Boolean(webRiskKey),
      reason: webRiskKey ? undefined : "WEB_RISK_API_KEY not configured",
      costPerCallUsd: 0.005,
      docsUrl: "https://cloud.google.com/web-risk/pricing",
    },
    {
      id: "ai-analysis",
      label: "AI claim extraction & reasoning",
      purpose: "Splits text into atomic claims, compares retrieved evidence, drafts the human summary.",
      enabled: Boolean(ai),
      reason: ai ? undefined : aiUnavailableReason(),
      costPerCallUsd: 0.0006,
      docsUrl: ai?.provider.docsUrl ?? "https://openai.com/api/pricing/",
    },
    {
      id: "web-search",
      label: "Licensed web search",
      purpose: "Discovers primary sources, official announcements and corroborating reporting.",
      enabled: Boolean(searchKey),
      reason: searchKey ? undefined : "No search API key configured (TAVILY_API_KEY / SERPER_API_KEY)",
      costPerCallUsd: 0.004,
      docsUrl: "https://developers.google.com/custom-search/v1/overview",
    },
  ];
}

function aiUnavailableReason(): string {
  if (enabledProviders().length) return "VITEX_DEFAULT_MODEL does not name an available model";
  const misconfigured = providerStatuses().find((p) => p.source !== "preset" && p.reason);
  if (misconfigured) return `${misconfigured.id}: ${misconfigured.reason}`;
  return "No AI provider configured (OPENAI_API_KEY, ANTHROPIC_API_KEY, GEMINI_API_KEY, Workers AI, or VITEX_PROVIDERS)";
}

export function providerEnabled(id: string): boolean {
  return getProviderConfigs().find((p) => p.id === id)?.enabled ?? false;
}

export function providerCost(id: string): number {
  return getProviderConfigs().find((p) => p.id === id)?.costPerCallUsd ?? 0;
}

export interface TimedResult<T> {
  data: T;
  call: ProviderCall;
}

export async function meter<T>(
  provider: string,
  operation: string,
  fn: () => Promise<T>,
  options: { reportId?: string; costOverride?: number; detail?: string } = {},
): Promise<TimedResult<T>> {
  const started = Date.now();
  try {
    const data = await fn();
    const call: ProviderCall = {
      provider,
      operation,
      status: "ok",
      latencyMs: Date.now() - started,
      costUsd: options.costOverride ?? providerCost(provider),
      detail: options.detail,
    };
    await persistUsage(call, options.reportId);
    return { data, call };
  } catch (error) {
    const call: ProviderCall = {
      provider,
      operation,
      status: "error",
      latencyMs: Date.now() - started,
      costUsd: 0,
      error: (error as Error).message ?? String(error),
      detail: options.detail,
    };
    await persistUsage(call, options.reportId);
    throw error;
  }
}

export function skipped(provider: string, operation: string, detail: string): ProviderCall {
  return { provider, operation, status: "skipped", latencyMs: 0, costUsd: 0, detail };
}

export function disabled(provider: string, operation: string, detail: string): ProviderCall {
  return { provider, operation, status: "disabled", latencyMs: 0, costUsd: 0, detail };
}

/** Meters a call made outside meter(): streams, the universal gateway, the upstream proxy. */
export function recordProviderCall(call: ProviderCall, reportId?: string): Promise<void> {
  return persistUsage(call, reportId);
}

async function persistUsage(call: ProviderCall, reportId?: string) {
  await recordSpend(call.costUsd);
  try {
    await db.insert(providerUsage).values({
      id: newId(),
      reportId: reportId ?? null,
      // Column widths (schema.ts); a longer model id must not drop the row.
      provider: call.provider.slice(0, 48),
      operation: call.operation.slice(0, 64),
      status: call.status === "ok" ? "ok" : call.status,
      latencyMs: call.latencyMs,
      tokensIn: call.tokensIn ?? null,
      tokensOut: call.tokensOut ?? null,
      costUsd: round(call.costUsd, 6),
      error: call.error ?? null,
    });
  } catch {
    // usage logging must never break a verification
  }
}
