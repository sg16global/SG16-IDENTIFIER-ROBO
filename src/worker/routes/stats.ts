import { sql } from "drizzle-orm";
import { db } from "@/db";
import { productCatalog, providerUsage, verificationReports } from "@/db/schema";
import { getProviderConfigs } from "@/lib/providers/registry";
import type { EngineStats } from "@/lib/types";

async function readStats(): Promise<EngineStats> {
  try {
    const [reports, catalog, usage] = await Promise.all([
      db.select({
        count: sql<number>`count(*)::int`,
        cost: sql<number>`coalesce(sum(cost_usd),0)::float`,
        latency: sql<number | null>`percentile_cont(0.5) within group (order by latency_ms)::float`,
        confidence: sql<number | null>`percentile_cont(0.5) within group (order by confidence)::float`,
        scored: sql<number>`count(confidence)::int`,
        last: sql<string>`to_char(max(checked_at), 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`,
      }).from(verificationReports),
      db.select({ count: sql<number>`count(*)::int` }).from(productCatalog),
      db.select({ calls: sql<number>`count(*)::int` }).from(providerUsage),
    ]);
    const r = reports[0];
    return {
      available: true,
      reports: r?.count ?? 0,
      cost: r?.cost ?? 0,
      latency: r?.latency == null ? null : Math.round(r.latency),
      confidence: r?.confidence ?? null,
      scored: r?.scored ?? 0,
      last: r?.last ?? null,
      catalog: catalog[0]?.count ?? 0,
      providerCalls: usage[0]?.calls ?? 0,
    };
  } catch {
    return { available: false, reports: 0, cost: 0, latency: null, confidence: null, scored: 0, last: null, catalog: 0, providerCalls: 0 };
  }
}

/** Live figures for the homepage engine panel, read from PostgreSQL on every request. */
export async function GET() {
  const stats = await readStats();
  const activeProviders = getProviderConfigs().filter((p) => p.enabled).length;
  return Response.json({ stats, activeProviders }, { headers: { "cache-control": "no-store" } });
}
