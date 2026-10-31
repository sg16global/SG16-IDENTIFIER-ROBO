import { db } from "@/db";
import { checkAdminAuth, storeAdminCodeHash, storedAdminCodeHash, temporaryAdminCode } from "@/lib/security/admin-access";
import { sql } from "drizzle-orm";
import { auditEvents, feedback, providerUsage } from "@/db/schema";
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

export async function GET(request: Request) {
  const auth = await checkAdminAuth(request);
  if (!auth.ok) {
    return Response.json({ ok: false, error: "Administrator access code required." }, { status: 401 });
  }
  await ensureFlagsSeeded();
  const customHash = await storedAdminCodeHash();

  const [stats, fb, audit, recentUsage] = await Promise.all([
    adminStats(),
    listFeedback(),
    listRecentAudit(30),
    db.select().from(providerUsage).orderBy(sql`created_at desc`).limit(40),
  ]);

  const spend = await db
    .select({
      total: sql<number>`coalesce(sum(cost_usd),0)::float`,
      calls: sql<number>`count(*)::int`,
      errors: sql<number>`coalesce(sum(case when status = 'error' then 1 else 0 end),0)::int`,
    })
    .from(providerUsage);

  return Response.json({
    ok: true,
    stats,
    feedback: fb,
    audit,
    recentUsage,
    spend: spend[0],
    budget: { dailyUsd: DAILY_BUDGET_USD, ...(await budgetState()) },
    retentionDays: Number(setting("SG16_RETENTION_DAYS") ?? "30"),
    flags: Object.values(FLAG_KEYS),
    // First login with the temporary dashboard code is flagged so the console
    // forces setting a permanent one (stored hashed in the GUARD object).
    mustChangePassword: auth.mustChange,
    hasCustomCode: customHash != null,
    adminEmail: setting("ADMIN_EMAIL") || null,
  }, { headers: { "cache-control": "no-store" } });
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
    await setFlag(key, Boolean(body.enabled));
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
    await storeAdminCodeHash(await sha256Hex(next));
    await db.insert(auditEvents).values({ id: newId(), actor: "admin", action: "set-access-code", meta: {} });
    return Response.json({ ok: true });
  }

  if (action === "seed-catalog") {
    const inserted = await ensureCatalogSeeded();
    return Response.json({ ok: true, inserted });
  }

  if (action === "purge-expired") {
    const removed = await purgeExpiredReports();
    await db.insert(auditEvents).values({ id: newId(), actor: "admin", action: "purge-expired", meta: { removed } });
    return Response.json({ ok: true, removed });
  }

  if (action === "resolve-feedback") {
    const id = String(body.id ?? "");
    const status = String(body.status ?? "resolved");
    await db.update(feedback).set({ status }).where(sql`${feedback.id} = ${id}`);
    return Response.json({ ok: true, id, status });
  }

  return Response.json({ ok: false, error: `Unknown action "${action}".` }, { status: 400 });
}
