import { env } from "cloudflare:workers";
import { setting } from "@/lib/settings";
import type { BudgetSnapshot, GuardState, WindowResult } from "@/worker/guard";

/**
 * Per-fingerprint sliding-window limiter + daily variable-cost budget
 * (blueprint §8), shared by every Worker instance through the GuardState
 * Durable Object (binding GUARD in wrangler.jsonc).
 *
 * If the binding is missing or unreachable, the same limits apply per
 * isolate from memory instead — weaker (each instance counts alone) but never
 * an outage. The fallback is logged so it does not go unnoticed.
 */

export interface RateLimitPolicy {
  windowMs: number;
  maxRequests: number;
}

const GATEWAY_RPM = Number(setting("VITEX_GATEWAY_RPM") ?? "120");

export const POLICIES: Record<string, RateLimitPolicy> = {
  verify: { windowMs: 60_000, maxRequests: 6 },
  feedback: { windowMs: 60_000, maxRequests: 10 },
  newsletter: { windowMs: 3_600_000, maxRequests: 3 },
  affiliate: { windowMs: 60_000, maxRequests: 30 },
  certificate: { windowMs: 60_000, maxRequests: 10 },
  // Per API key on the Vitex universal API (/v1/*).
  gateway: { windowMs: 60_000, maxRequests: Number.isFinite(GATEWAY_RPM) && GATEWAY_RPM > 0 ? GATEWAY_RPM : 120 },
};

export type RateLimitResult = WindowResult;

export const DAILY_BUDGET_USD = Number(setting("SG16_DAILY_BUDGET_USD") ?? "12");

function guard(): DurableObjectNamespace<GuardState> | undefined {
  return (env as { GUARD?: DurableObjectNamespace<GuardState> }).GUARD;
}

let warned = false;
function fallback(reason: unknown) {
  if (warned) return;
  warned = true;
  console.error("[rate-limit] GuardState Durable Object unavailable; limits are per instance until it recovers:", reason);
}

const today = () => new Date().toISOString().slice(0, 10);

/* --------------------------- per-isolate fallback --------------------------- */

const windows = new Map<string, number[]>();
const localBudget: BudgetSnapshot = { date: "", spentUsd: 0, blocked: 0 };

function localHit(key: string, policy: RateLimitPolicy): RateLimitResult {
  const now = Date.now();
  const hits = (windows.get(key) ?? []).filter((t) => now - t < policy.windowMs);
  if (hits.length >= policy.maxRequests) {
    windows.set(key, hits);
    const oldest = hits[0] ?? now;
    return { allowed: false, remaining: 0, retryAfterMs: Math.max(1000, policy.windowMs - (now - oldest)), limit: policy.maxRequests };
  }
  hits.push(now);
  windows.set(key, hits);
  if (windows.size > 5000) {
    for (const [k, v] of windows) {
      if (v.every((t) => now - t > policy.windowMs)) windows.delete(k);
      if (windows.size < 3000) break;
    }
  }
  return { allowed: true, remaining: policy.maxRequests - hits.length, retryAfterMs: 0, limit: policy.maxRequests };
}

function localBudgetToday(): BudgetSnapshot {
  if (localBudget.date !== today()) Object.assign(localBudget, { date: today(), spentUsd: 0, blocked: 0 });
  return localBudget;
}

/* --------------------------------- limits --------------------------------- */

export async function consumeRateLimit(fingerprint: string, policy: RateLimitPolicy = POLICIES.verify): Promise<RateLimitResult> {
  const key = `${fingerprint}:${policy.windowMs}:${policy.maxRequests}`;
  const namespace = guard();
  if (namespace) {
    try {
      return await namespace.get(namespace.idFromName(`rate:${key}`)).hit(policy.windowMs, policy.maxRequests);
    } catch (error) {
      fallback(error);
    }
  }
  return localHit(key, policy);
}

/* --------------------------------- budget --------------------------------- */

function budgetStub() {
  const namespace = guard();
  return namespace?.get(namespace.idFromName("budget"));
}

export async function recordSpend(amountUsd: number): Promise<void> {
  // Free calls do not move the budget; skipping them saves a round trip.
  if (!(amountUsd > 0)) return;
  const stub = budgetStub();
  if (stub) {
    try {
      await stub.spend(today(), amountUsd);
      return;
    } catch (error) {
      fallback(error);
    }
  }
  localBudgetToday().spentUsd += amountUsd;
}

export async function budgetState(): Promise<BudgetSnapshot> {
  const stub = budgetStub();
  if (stub) {
    try {
      return await stub.budget(today());
    } catch (error) {
      fallback(error);
    }
  }
  return { ...localBudgetToday() };
}

export async function budgetExhausted(): Promise<boolean> {
  return (await budgetState()).spentUsd >= DAILY_BUDGET_USD;
}

export async function noteBudgetBlock(): Promise<void> {
  const stub = budgetStub();
  if (stub) {
    try {
      await stub.block(today());
      return;
    } catch (error) {
      fallback(error);
    }
  }
  localBudgetToday().blocked += 1;
}

export function requestFingerprint(headers: Headers): string {
  // Cloudflare sets cf-connecting-ip itself; x-forwarded-for can be supplied by the client.
  const forwarded = headers.get("x-forwarded-for");
  const ip = headers.get("cf-connecting-ip") ?? forwarded?.split(",")[0]?.trim() ?? headers.get("x-real-ip") ?? "unknown";
  const agent = headers.get("user-agent") ?? "no-agent";
  // Hash, never store raw IP + agent (privacy default, blueprint §7)
  let h1 = 0x811c9dc5;
  const input = `${ip}|${agent.slice(0, 120)}`;
  for (let i = 0; i < input.length; i += 1) {
    h1 ^= input.charCodeAt(i);
    h1 = Math.imul(h1, 0x01000193) >>> 0;
  }
  return `fp_${h1.toString(36)}`;
}
