import { db } from "@/db";
import { getProviderConfigs } from "@/lib/providers/registry";
import type { EngineStats } from "@/lib/types";

async function readStats(): Promise<EngineStats> {
  try {
    // SQLite has no percentile_cont; the median is picked with LIMIT/OFFSET.
    const [reports, catalog, usage] = await Promise.all([
      db.first<{
        count: number;
        cost: number;
        latency: number | null;
        confidence: number | null;
        scored: number;
        last: string | null;
      }>(
        `select count(*) as count, coalesce(sum(cost_usd), 0) as cost,
                (select latency_ms from verification_reports where latency_ms is not null
                 order by latency_ms limit 1 offset (select count(*) / 2 from verification_reports where latency_ms is not null)) as latency,
                (select confidence from verification_reports where confidence is not null
                 order by confidence limit 1 offset (select count(*) / 2 from verification_reports where confidence is not null)) as confidence,
                count(confidence) as scored,
                max(checked_at) as last
         from verification_reports`,
      ),
      db.first<{ count: number }>("select count(*) as count from product_catalog"),
      db.first<{ calls: number }>("select count(*) as calls from provider_usage"),
    ]);
    return {
      available: true,
      reports: reports?.count ?? 0,
      cost: reports?.cost ?? 0,
      latency: reports?.latency == null ? null : Math.round(reports.latency),
      confidence: reports?.confidence ?? null,
      scored: reports?.scored ?? 0,
      last: reports?.last ?? null,
      catalog: catalog?.count ?? 0,
      providerCalls: usage?.calls ?? 0,
    };
  } catch {
    return { available: false, reports: 0, cost: 0, latency: null, confidence: null, scored: 0, last: null, catalog: 0, providerCalls: 0 };
  }
}

/** Live figures for the homepage engine panel, read from D1 on every request. */
export async function GET() {
  const stats = await readStats();
  const activeProviders = getProviderConfigs().filter((p) => p.enabled).length;
  return Response.json({ stats, activeProviders }, { headers: { "cache-control": "no-store" } });
}
