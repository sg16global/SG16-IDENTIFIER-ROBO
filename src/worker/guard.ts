import { DurableObject } from "cloudflare:workers";

export interface WindowResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
  limit: number;
}

export interface BudgetSnapshot {
  date: string;
  spentUsd: number;
  blocked: number;
}

/**
 * Shared state behind rate limits and the daily variable-cost budget.
 *
 * One instance per rate-limit key (connection fingerprint or API key, plus
 * policy) and one named "budget". A Durable Object handles one request at a
 * time, so counts are exact across every Worker isolate and region — which an
 * in-memory Map (per isolate) and KV (eventually consistent) cannot give.
 * A rate-limit instance deletes its storage once its window has passed.
 */
export class GuardState extends DurableObject {
  private hits: number[] | null = null;

  /** Sliding window: records a hit if the key still has room. */
  async hit(windowMs: number, maxRequests: number): Promise<WindowResult> {
    const now = Date.now();
    this.hits ??= (await this.ctx.storage.get<number[]>("hits")) ?? [];
    const hits = this.hits.filter((t) => now - t < windowMs);
    this.hits = hits;
    if (hits.length >= maxRequests) {
      const oldest = hits[0] ?? now;
      return { allowed: false, remaining: 0, retryAfterMs: Math.max(1000, windowMs - (now - oldest)), limit: maxRequests };
    }
    hits.push(now);
    await this.ctx.storage.put("hits", hits);
    // Every hit has expired by then; nothing worth keeping remains.
    await this.ctx.storage.setAlarm(now + windowMs);
    return { allowed: true, remaining: maxRequests - hits.length, retryAfterMs: 0, limit: maxRequests };
  }

  async alarm(): Promise<void> {
    this.hits = null;
    await this.ctx.storage.deleteAll();
  }

  async budget(date: string): Promise<BudgetSnapshot> {
    const stored = await this.ctx.storage.get<BudgetSnapshot>("budget");
    return stored?.date === date ? stored : { date, spentUsd: 0, blocked: 0 };
  }

  async spend(date: string, amountUsd: number): Promise<BudgetSnapshot> {
    const current = await this.budget(date);
    const next = { ...current, spentUsd: current.spentUsd + amountUsd };
    await this.ctx.storage.put("budget", next);
    return next;
  }

  async block(date: string): Promise<BudgetSnapshot> {
    const current = await this.budget(date);
    const next = { ...current, blocked: current.blocked + 1 };
    await this.ctx.storage.put("budget", next);
    return next;
  }

  /** SHA-256 of the operator's permanent console code; null while only the temporary code exists. */
  async adminCodeHash(): Promise<string | null> {
    return (await this.ctx.storage.get<string>("adminCodeHash")) ?? null;
  }

  async setAdminCode(hash: string): Promise<void> {
    await this.ctx.storage.put("adminCodeHash", hash);
    await this.ctx.storage.put("adminCodeSetAt", new Date().toISOString());
  }

  async adminCodeSetAt(): Promise<string | null> {
    return (await this.ctx.storage.get<string>("adminCodeSetAt")) ?? null;
  }
}
