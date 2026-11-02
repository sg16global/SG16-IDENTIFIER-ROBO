import { db, parseJson } from "@/db";
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
      const rows = await db.all<Record<string, unknown>>(
        search
          ? "select * from product_catalog where lower(brand || ' ' || model || ' ' || category) like ? limit 60"
          : "select * from product_catalog limit 60",
        ...(search ? [`%${search.toLowerCase()}%`] : []),
      );
      // JSON columns come back as TEXT; parse them for the client.
      out.catalog = rows.map((r) => ({
        ...r,
        identifiers: parseJson(r.identifiers),
        specs: parseJson(r.specs),
        known_counterfeit_signals: parseJson(r.known_counterfeit_signals),
      }));
    }
    if (section === "all" || section === "stats") {
      const totals = await db.first<{ reports: number; cost: number; avgLatency: number }>(
        "select count(*) as reports, coalesce(sum(cost_usd), 0) as cost, coalesce(avg(latency_ms), 0) as avgLatency from verification_reports",
      );
      out.stats = {
        reports: totals?.reports ?? 0,
        cost: totals?.cost ?? 0,
        avgLatency: Math.round(totals?.avgLatency ?? 0),
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
