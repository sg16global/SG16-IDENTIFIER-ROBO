import { db } from "@/db";
import { sql } from "drizzle-orm";
import { productCatalog, verificationReports } from "@/db/schema";
import { getProviderConfigs } from "@/lib/providers/registry";
import { getFlagStates } from "@/lib/db/reports";
import { budgetState, DAILY_BUDGET_USD } from "@/lib/security/rate-limit";
import { gatewayEnabled } from "@/lib/universal/gateway";
import { defaultRoute, enabledProviders } from "@/lib/universal/providers";
import { upstreams } from "@/lib/universal/upstreams";

/** Liveness probe used by the platform healthcheck and by the operator console. */
export async function GET() {
  const started = Date.now();
  let database = false;
  let reports = 0;
  let catalog = 0;

  try {
    await db.execute(sql`select 1`);
    database = true;
  } catch {
    database = false;
  }

  if (database) {
    try {
      const [r, c] = await Promise.all([
        db.select({ count: sql<number>`count(*)::int` }).from(verificationReports),
        db.select({ count: sql<number>`count(*)::int` }).from(productCatalog),
      ]);
      reports = r[0]?.count ?? 0;
      catalog = c[0]?.count ?? 0;
    } catch {
      // Tables not yet migrated — liveness still holds.
    }
  }

  const flags = await getFlagStates().catch(() => ({}) as Record<string, boolean>);
  const providers = getProviderConfigs();

  return Response.json(
    {
      ok: database,
      service: "sg16-identifier",
      version: "1.0.0",
      database,
      counts: { reports, catalog },
      flags,
      budget: { dailyUsd: DAILY_BUDGET_USD, ...(await budgetState()) },
      providers: providers.map((p) => ({ id: p.id, enabled: p.enabled, reason: p.reason ?? null })),
      gateway: {
        open: gatewayEnabled(),
        defaultModel: defaultRoute()?.id ?? null,
        modelProviders: enabledProviders().map((p) => p.id),
        upstreams: upstreams().length,
      },
      latencyMs: Date.now() - started,
      checkedAt: new Date().toISOString(),
    },
    { status: database ? 200 : 500, headers: { "cache-control": "no-store" } },
  );
}
