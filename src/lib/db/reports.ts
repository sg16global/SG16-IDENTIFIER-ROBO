import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  auditEvents,
  businessAccounts,
  evidenceSources,
  feedback,
  newsletterSubscribers,
  productCatalog,
  providerUsage,
  reportFindings,
  serviceFlags,
  verificationReports,
} from "@/db/schema";
import type { EngineFlags } from "@/lib/verification/module";
import type { VerificationReport } from "@/lib/types";
import { newId, round } from "@/lib/utils";
import { setting } from "@/lib/settings";

export const FLAG_KEYS = {
  expensive: "expensive_providers",
  outboundFetch: "outbound_fetch",
  dns: "dns_lookups",
  intake: "public_intake",
} as const;

const DEFAULTS: Record<string, { enabled: boolean; detail: string }> = {
  [FLAG_KEYS.expensive]: { enabled: true, detail: "Paid provider calls (fact-check, web risk, AI, search)." },
  [FLAG_KEYS.outboundFetch]: { enabled: true, detail: "Server-side fetching of user-submitted URLs through the SSRF guard." },
  [FLAG_KEYS.dns]: { enabled: true, detail: "DNS and TLS intelligence lookups." },
  [FLAG_KEYS.intake]: { enabled: true, detail: "Accept new public verification requests." },
};

export async function getFlagStates(): Promise<Record<string, boolean>> {
  const out: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(DEFAULTS)) out[k] = v.enabled;
  try {
    const rows = await db.select().from(serviceFlags);
    for (const row of rows) out[row.key] = row.enabled;
  } catch {
    /* database unavailable — safe defaults apply */
  }
  return out;
}

export async function getEngineFlags(): Promise<EngineFlags> {
  const f = await getFlagStates();
  return {
    expensiveEnabled: f[FLAG_KEYS.expensive] ?? true,
    outboundFetchEnabled: f[FLAG_KEYS.outboundFetch] ?? true,
    dnsEnabled: f[FLAG_KEYS.dns] ?? true,
  };
}

export async function setFlag(key: string, enabled: boolean, actor = "admin"): Promise<void> {
  await db
    .insert(serviceFlags)
    .values({ key, enabled, detail: DEFAULTS[key]?.detail ?? null, updatedAt: new Date() })
    .onConflictDoUpdate({ target: serviceFlags.key, set: { enabled, updatedAt: new Date() } });
  await db.insert(auditEvents).values({ id: newId(), actor, action: `flag:${key}`, meta: { enabled } });
}

export async function ensureFlagsSeeded(): Promise<void> {
  try {
    for (const [key, value] of Object.entries(DEFAULTS)) {
      await db
        .insert(serviceFlags)
        .values({ key, enabled: value.enabled, detail: value.detail })
        .onConflictDoNothing();
    }
  } catch {
    /* non-fatal */
  }
}

const RETENTION_DAYS = Number(setting("SG16_RETENTION_DAYS") ?? "30");

export async function persistReport(report: VerificationReport, ipFingerprint?: string): Promise<void> {
  const expires = new Date(Date.now() + RETENTION_DAYS * 86400000);
  try {
    await db.insert(verificationReports).values({
      id: report.reportId,
      publicId: report.publicId,
      category: report.category,
      status: report.status,
      confidence: report.confidence,
      summary: report.summary,
      inputText: report.input.text ? report.input.text.slice(0, 4000) : null,
      inputUrl: report.input.url ?? null,
      inputKind: report.input.kind,
      payload: report.payload ?? {},
      workflow: report.workflow,
      limitations: report.limitations,
      nextSteps: report.nextSteps,
      shareable: false,
      latencyMs: report.latencyMs,
      costUsd: round(report.costUsd, 6),
      providersUsed: report.providers,
      ipFingerprint: ipFingerprint ?? null,
      checkedAt: new Date(report.checkedAt),
      retentionExpiresAt: expires,
    });

    if (report.sources.length) {
      await db.insert(evidenceSources).values(
        report.sources.map((s) => ({
          id: newId(),
          reportId: report.reportId,
          provider: s.provider,
          url: s.url ?? null,
          title: s.title ?? null,
          publisher: s.publisher ?? null,
          excerpt: s.excerpt ? s.excerpt.slice(0, 4000) : null,
          stance: s.stance,
          publishedAt: s.publishedAt ? new Date(s.publishedAt) : null,
          retrievedAt: new Date(s.retrievedAt),
          trustTier: s.trustTier ?? null,
          meta: s.meta ?? null,
        })),
      );
    }
    if (report.findings.length) {
      await db.insert(reportFindings).values(
        report.findings.map((f, i) => ({
          id: newId(),
          reportId: report.reportId,
          kind: f.kind,
          title: f.title,
          detail: f.detail.slice(0, 4000),
          severity: f.severity,
          weight: f.weight,
          sourceRefs: f.sourceRefs ?? [],
          position: i,
        })),
      );
    }
  } catch {
    /* persistence must never turn a successful verification into a 500 */
  }
}

export async function loadReport(publicId: string): Promise<VerificationReport | null> {
  const rows = await db
    .select()
    .from(verificationReports)
    .where(eq(verificationReports.publicId, publicId.toUpperCase()))
    .limit(1);
  const row = rows[0];
  if (!row) return null;

  const [srcRows, fndRows] = await Promise.all([
    db.select().from(evidenceSources).where(eq(evidenceSources.reportId, row.id)),
    db.select().from(reportFindings).where(eq(reportFindings.reportId, row.id)),
  ]);

  return {
    reportId: row.id,
    publicId: row.publicId,
    category: row.category as VerificationReport["category"],
    status: row.status as VerificationReport["status"],
    confidence: row.confidence,
    summary: row.summary,
    headline: (row.payload as { headline?: string })?.headline ?? row.summary.split(".")[0],
    input: {
      kind: row.inputKind ?? "text",
      text: row.inputText ?? undefined,
      url: row.inputUrl ?? undefined,
    },
    findings: fndRows
      .sort((a, b) => a.position - b.position)
      .map((f) => ({
        kind: f.kind,
        title: f.title,
        detail: f.detail,
        severity: f.severity as "info",
        weight: f.weight,
        sourceRefs: (f.sourceRefs as number[]) ?? [],
      })),
    sources: srcRows
      .filter((s) => s.provider !== "_finding")
      .map((s) => ({
        provider: s.provider,
        url: s.url ?? undefined,
        title: s.title ?? undefined,
        publisher: s.publisher ?? undefined,
        excerpt: s.excerpt ?? undefined,
        stance: s.stance as "context",
        publishedAt: s.publishedAt?.toISOString() ?? null,
        retrievedAt: s.retrievedAt.toISOString(),
        trustTier: (s.trustTier as "official") ?? undefined,
        meta: (s.meta as Record<string, unknown>) ?? undefined,
      })),
    limitations: (row.limitations as string[]) ?? [],
    nextSteps: (row.nextSteps as string[]) ?? [],
    payload: (row.payload as Record<string, unknown>) ?? {},
    workflow: (row.workflow as VerificationReport["workflow"]) ?? [],
    providers: (row.providersUsed as VerificationReport["providers"]) ?? [],
    checkedAt: row.checkedAt.toISOString(),
    latencyMs: row.latencyMs ?? 0,
    costUsd: row.costUsd ?? 0,
  };
}

export async function listRecentReports(limit = 12) {
  return db
    .select({
      publicId: verificationReports.publicId,
      category: verificationReports.category,
      status: verificationReports.status,
      confidence: verificationReports.confidence,
      summary: verificationReports.summary,
      inputKind: verificationReports.inputKind,
      checkedAt: verificationReports.checkedAt,
    })
    .from(verificationReports)
    .orderBy(desc(verificationReports.checkedAt))
    .limit(limit);
}

export async function adminStats() {
  const [totals, byCategory, byStatus, usage, fb, catalogCount, businesses, subs, flags] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int`, cost: sql<number>`coalesce(sum(cost_usd),0)::float` }).from(verificationReports),
    db.select({ category: verificationReports.category, count: sql<number>`count(*)::int` })
      .from(verificationReports).groupBy(verificationReports.category),
    db.select({ status: verificationReports.status, count: sql<number>`count(*)::int` })
      .from(verificationReports).groupBy(verificationReports.status),
    db.select({
      provider: providerUsage.provider,
      calls: sql<number>`count(*)::int`,
      cost: sql<number>`coalesce(sum(cost_usd),0)::float`,
      errors: sql<number>`coalesce(sum(case when status = 'error' then 1 else 0 end),0)::int`,
      avgLatency: sql<number>`coalesce(avg(latency_ms),0)::float`,
    }).from(providerUsage).groupBy(providerUsage.provider),
    db.select({ status: feedback.status, count: sql<number>`count(*)::int` }).from(feedback).groupBy(feedback.status),
    db.select({ count: sql<number>`count(*)::int` }).from(productCatalog),
    db.select({ count: sql<number>`count(*)::int` }).from(businessAccounts),
    db.select({ count: sql<number>`count(*)::int` }).from(newsletterSubscribers),
    db.select().from(serviceFlags),
  ]);

  return { totals: totals[0], byCategory, byStatus, usage, feedback: fb, catalogCount: catalogCount[0]?.count ?? 0, businesses: businesses[0]?.count ?? 0, subscribers: subs[0]?.count ?? 0, flags };
}

export async function listFeedback(status?: string) {
  return db
    .select()
    .from(feedback)
    .where(status ? eq(feedback.status, status) : sql`true`)
    .orderBy(desc(feedback.createdAt))
    .limit(100);
}

export async function listRecentAudit(limit = 40) {
  return db.select().from(auditEvents).orderBy(desc(auditEvents.createdAt)).limit(limit);
}

export async function recordFeedback(values: {
  reportId?: string | null;
  publicId?: string | null;
  kind: string;
  message?: string | null;
  contact?: string | null;
}) {
  await db.insert(feedback).values({
    id: newId(),
    reportId: values.reportId ?? null,
    publicId: values.publicId ?? null,
    kind: values.kind,
    message: values.message ? values.message.slice(0, 2000) : null,
    contact: values.contact ?? null,
    status: "new",
  });
  if (values.reportId) {
    await db.update(verificationReports).set({ flagged: true }).where(eq(verificationReports.id, values.reportId));
  }
}

export async function purgeExpiredReports(): Promise<number> {
  const result = await db
    .delete(verificationReports)
    .where(and(sql`${verificationReports.retentionExpiresAt} is not null`, sql`${verificationReports.retentionExpiresAt} < now()`));
  return (result as unknown as { rowCount?: number })?.rowCount ?? 0;
}
