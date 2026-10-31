import { sql } from "drizzle-orm";
import { db } from "@/db";
import { productCatalog, verificationReports } from "@/db/schema";
import { listRecentReports } from "@/lib/db/reports";
import { getProviderConfigs } from "@/lib/providers/registry";
import { DAILY_BUDGET_USD, budgetState } from "@/lib/security/rate-limit";

/** Public read-only metadata: recent checks, catalogue browser, provider status. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const section = url.searchParams.get("section") ?? "all";
  const search = url.searchParams.get("q")?.slice(0, 80);

  const out: Record<string, unknown> = {};

  try {
    if (section === "all" || section === "recent") {
      out.recent = await listRecentReports(12);
    }
    if (section === "all" || section === "catalog") {
      const rows = search
        ? await db
            .select()
            .from(productCatalog)
            .where(sql`lower(${productCatalog.brand} || ' ' || ${productCatalog.model} || ' ' || ${productCatalog.category}) like ${`%${search.toLowerCase()}%`}`)
            .limit(60)
        : await db.select().from(productCatalog).limit(60);
      out.catalog = rows;
    }
    if (section === "all" || section === "stats") {
      const totals = await db
        .select({
          reports: sql<number>`count(*)::int`,
          cost: sql<number>`coalesce(sum(cost_usd),0)::float`,
          avgLatency: sql<number>`coalesce(avg(latency_ms),0)::float`,
        })
        .from(verificationReports);
      out.stats = {
        reports: totals[0]?.reports ?? 0,
        cost: totals[0]?.cost ?? 0,
        avgLatency: Math.round(totals[0]?.avgLatency ?? 0),
      };
    }
  } catch (error) {
    out.databaseError = (error as Error).message;
  }

  out.providers = getProviderConfigs().map((p) => ({
    id: p.id,
    label: p.label,
    purpose: p.purpose,
    enabled: p.enabled,
    reason: p.reason ?? null,
    docsUrl: p.docsUrl ?? null,
  }));
  out.budget = { dailyUsd: DAILY_BUDGET_USD, ...(await budgetState()) };

  return Response.json({ ok: true, ...out }, { headers: { "cache-control": "no-store" } });
}
