import { db, json } from "@/db";
import { checkAdminAuth, storeAdminCodeHash, storedAdminCodeHash, temporaryAdminCode } from "@/lib/security/admin-access";
import {
  FLAG_KEYS,
  adminStats,
  ensureFlagsSeeded,
  listFeedback,
  listRecentAudit,
  purgeExpiredReports,
  setFlag,
} from "@/lib/db/reports";
import { ensureCatalogSeeded } from "@/lib/verification/modules/product";
import { budgetState, DAILY_BUDGET_USD } from "@/lib/security/rate-limit";
import { newId, sha256Hex } from "@/lib/utils";
import { setting } from "@/lib/settings";

// No default code, ever: without the ADMIN_ACCESS_CODE secret the console is
// closed to everyone. A default would be public (this repo is on GitHub).

// The console runs without Postgres: auth, code rotation and the budget live
// in the GUARD Durable Object. Only the report/queue tables need the database,
// so those degrade to empty instead of taking the whole console down with a 500.
function degradedStats() {
  return {
    totals: { count: 0, cost: 0 },
    byCategory: [] as Array<{ category: string; count: number }>,
    byStatus: [] as Array<{ status: string; count: number }>,
    usage: [] as Array<{ provider: string; calls: number; cost: number; errors: number; avgLatency: number }>,
    feedback: [] as Array<{ status: string; count: number }>,
    catalogCount: 0,
    businesses: 0,
    subscribers: 0,
    flags: (Object.values(FLAG_KEYS) as string[]).map((key) => ({ key, enabled: true, detail: null as string | null, updatedAt: new Date() })),
  };
}

function dbUnavailable(error: unknown) {
  console.error("[admin] database unavailable, action rejected:", error);
  return Response.json(
    { ok: false, error: "Database unavailable (D1 binding DB). This action needs D1; unlock and code rotation do not." },
    { status: 503 },
  );
}

async function auditBestEffort(action: string, meta: Record<string, unknown>) {
  try {
    await db.run("insert into audit_events (id, actor, action, meta) values (?, ?, ?, ?)", newId(), "admin", action, json(meta));
  } catch {
    /* the audit trail needs the database; the action itself already happened */
  }
}

export async function GET(request: Request) {
  const auth = await checkAdminAuth(request);
  if (!auth.ok) {
    return Response.json({ ok: false, error: "Administrator access code required." }, { status: 401 });
  }
  await ensureFlagsSeeded();
  const customHash = await storedAdminCodeHash();

  const base = {
    ok: true as const,
    budget: { dailyUsd: DAILY_BUDGET_USD, ...(await budgetState()) },
    retentionDays: Number(setting("SG16_RETENTION_DAYS") ?? "30"),
    flags: Object.values(FLAG_KEYS),
    // First login with the temporary dashboard code is flagged so the console
    // forces setting a permanent one (stored hashed in the GUARD object).
    mustChangePassword: auth.mustChange,
    hasCustomCode: customHash != null,
    adminEmail: setting("ADMIN_EMAIL") || null,
  };
  const headers = { "cache-control": "no-store" };

  try {
    // Thunks + Promise.resolve().then: a missing DB binding throws synchronously
    // inside d1(), and a sync throw while evaluating the array would leave the
    // earlier promises unhandled.
    const settle = <T>(fn: () => T | Promise<T>) => Promise.resolve().then(fn);
    const [stats, fb, audit, recentUsage] = await Promise.all([
      settle(() => adminStats()),
      settle(() => listFeedback()),
      settle(() => listRecentAudit(30)),
      settle(() =>
        db.all(
          `select id, provider, operation, status, latency_ms as latencyMs, cost_usd as costUsd,
                  tokens_in as tokensIn, tokens_out as tokensOut, error, created_at as createdAt
           from provider_usage order by created_at desc limit 40`,
        ),
      ),
    ]);
    const spend = await db.first<{ total: number; calls: number; errors: number }>(
      `select coalesce(sum(cost_usd), 0) as total, count(*) as calls,
              coalesce(sum(case when status = 'error' then 1 else 0 end), 0) as errors
       from provider_usage`,
    );
    return Response.json({ ...base, dbAvailable: true, stats, feedback: fb, audit, recentUsage, spend: spend ?? { total: 0, calls: 0, errors: 0 } }, { headers });
  } catch (error) {
    console.error("[admin] database unavailable, serving degraded console:", error);
    return Response.json(
      { ...base, dbAvailable: false, stats: degradedStats(), feedback: [], audit: [], recentUsage: [], spend: { total: 0, calls: 0, errors: 0 } },
      { headers },
    );
  }
}

export async function POST(request: Request) {
  const auth = await checkAdminAuth(request);
  if (!auth.ok) {
    return Response.json({ ok: false, error: "Administrator access code required." }, { status: 401 });
  }
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }
  const action = String(body.action ?? "");
  const allowedKeys = Object.values(FLAG_KEYS) as string[];

  if (action === "set-flag") {
    const key = String(body.key ?? "");
    if (!allowedKeys.includes(key)) {
      return Response.json({ ok: false, error: `Unknown flag "${key}".` }, { status: 400 });
    }
    try {
      await setFlag(key, Boolean(body.enabled));
    } catch (error) {
      return dbUnavailable(error);
    }
    return Response.json({ ok: true, key, enabled: Boolean(body.enabled) });
  }

  if (action === "set-access-code") {
    const next = String(body.newCode ?? "");
    if (next.length < 12) {
      return Response.json({ ok: false, error: "Choose a new code of at least 12 characters." }, { status: 400 });
    }
    if (next === temporaryAdminCode()) {
      return Response.json({ ok: false, error: "The new code must differ from the temporary code." }, { status: 400 });
    }
    try {
      // Permanent code goes to the GUARD object only — no database needed.
      await storeAdminCodeHash(await sha256Hex(next));
    } catch (error) {
      console.error("[admin] could not store permanent code:", error);
      return Response.json({ ok: false, error: "GuardState Durable Object unavailable; cannot store the code." }, { status: 503 });
    }
    await auditBestEffort("set-access-code", {});
    return Response.json({ ok: true });
  }

  if (action === "seed-catalog") {
    try {
      const inserted = await ensureCatalogSeeded();
      return Response.json({ ok: true, inserted });
    } catch (error) {
      return dbUnavailable(error);
    }
  }

  if (action === "purge-expired") {
    try {
      const removed = await purgeExpiredReports();
      await auditBestEffort("purge-expired", { removed });
      return Response.json({ ok: true, removed });
    } catch (error) {
      return dbUnavailable(error);
    }
  }

  if (action === "resolve-feedback") {
    const id = String(body.id ?? "");
    const status = String(body.status ?? "resolved");
    try {
      await db.run("update feedback set status = ? where id = ?", status, id);
    } catch (error) {
      return dbUnavailable(error);
    }
    return Response.json({ ok: true, id, status });
  }

  return Response.json({ ok: false, error: `Unknown action "${action}".` }, { status: 400 });
}
