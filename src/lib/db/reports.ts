import { db, json, parseJson } from "@/db";
import type { EngineFlags } from "@/lib/verification/module";
import type { VerificationReport } from "@/lib/types";
import { newId, round } from "@/lib/utils";
import { setting } from "@/lib/settings";

/*
 * Report/queue persistence on D1 (SQLite). Same exports as before, now raw SQL
 * through the helper in src/db/index.ts — no ORM. JSON columns are TEXT.
 */

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
    const rows = await db.all<{ key: string; enabled: number }>("select key, enabled from service_flags");
    for (const row of rows) out[row.key] = row.enabled === 1;
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
  const now = new Date().toISOString();
  await db.run(
    `insert into service_flags (key, enabled, detail, updated_at) values (?, ?, ?, ?)
     on conflict(key) do update set enabled = excluded.enabled, detail = excluded.detail, updated_at = excluded.updated_at`,
    key,
    enabled,
    DEFAULTS[key]?.detail ?? null,
    now,
  );
  await db.run("insert into audit_events (id, actor, action, meta) values (?, ?, ?, ?)", newId(), actor, `flag:${key}`, json({ enabled }));
}

export async function ensureFlagsSeeded(): Promise<void> {
  try {
    for (const [key, value] of Object.entries(DEFAULTS)) {
      await db.run("insert or ignore into service_flags (key, enabled, detail) values (?, ?, ?)", key, value.enabled, value.detail);
    }
  } catch {
    /* non-fatal */
  }
}

const RETENTION_DAYS = Number(setting("SG16_RETENTION_DAYS") ?? "30");

export async function persistReport(report: VerificationReport, ipFingerprint?: string): Promise<void> {
  const expires = new Date(Date.now() + RETENTION_DAYS * 86400000).toISOString();
  try {
    await db.run(
      `insert into verification_reports
        (id, public_id, category, status, confidence, summary, input_text, input_url, input_kind,
         payload, workflow, limitations, next_steps, shareable, latency_ms, cost_usd, providers_used,
         ip_fingerprint, checked_at, retention_expires_at)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)`,
      report.reportId,
      report.publicId,
      report.category,
      report.status,
      report.confidence,
      report.summary,
      report.input.text ? report.input.text.slice(0, 4000) : null,
      report.input.url ?? null,
      report.input.kind,
      json(report.payload ?? {}),
      json(report.workflow),
      json(report.limitations),
      json(report.nextSteps),
      report.latencyMs,
      round(report.costUsd, 6),
      json(report.providers),
      ipFingerprint ?? null,
      new Date(report.checkedAt).toISOString(),
      expires,
    );

    for (const s of report.sources) {
      await db.run(
        `insert into evidence_sources
          (id, report_id, provider, url, title, publisher, excerpt, stance, published_at, retrieved_at, trust_tier, meta)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        newId(),
        report.reportId,
        s.provider,
        s.url ?? null,
        s.title ?? null,
        s.publisher ?? null,
        s.excerpt ? s.excerpt.slice(0, 4000) : null,
        s.stance,
        s.publishedAt ? new Date(s.publishedAt).toISOString() : null,
        new Date(s.retrievedAt).toISOString(),
        s.trustTier ?? null,
        json(s.meta ?? null),
      );
    }
    for (let i = 0; i < report.findings.length; i++) {
      const f = report.findings[i];
      await db.run(
        `insert into report_findings
          (id, report_id, kind, title, detail, severity, weight, source_refs, position)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        newId(),
        report.reportId,
        f.kind,
        f.title,
        f.detail.slice(0, 4000),
        f.severity,
        f.weight,
        json(f.sourceRefs ?? []),
        i,
      );
    }
  } catch {
    /* persistence must never turn a successful verification into a 500 */
  }
}

interface ReportRow {
  id: string;
  public_id: string;
  category: string;
  status: string;
  confidence: number | null;
  summary: string;
  input_text: string | null;
  input_url: string | null;
  input_kind: string | null;
  payload: string | null;
  workflow: string | null;
  limitations: string | null;
  next_steps: string | null;
  flagged: number;
  latency_ms: number | null;
  cost_usd: number;
  providers_used: string | null;
  checked_at: string;
}

interface SourceRow {
  provider: string;
  url: string | null;
  title: string | null;
  publisher: string | null;
  excerpt: string | null;
  stance: string;
  published_at: string | null;
  retrieved_at: string;
  trust_tier: string | null;
  meta: string | null;
}

interface FindingRow {
  kind: string;
  title: string;
  detail: string;
  severity: string;
  weight: number;
  source_refs: string | null;
  position: number;
}

export async function loadReport(publicId: string): Promise<VerificationReport | null> {
  const row = await db.first<ReportRow>("select * from verification_reports where public_id = ? limit 1", publicId.toUpperCase());
  if (!row) return null;

  const [srcRows, fndRows] = await Promise.all([
    db.all<SourceRow>("select * from evidence_sources where report_id = ?", row.id),
    db.all<FindingRow>("select * from report_findings where report_id = ?", row.id),
  ]);

  return {
    reportId: row.id,
    publicId: row.public_id,
    category: row.category as VerificationReport["category"],
    status: row.status as VerificationReport["status"],
    confidence: row.confidence,
    summary: row.summary,
    headline: parseJson<{ headline?: string }>(row.payload)?.headline ?? row.summary.split(".")[0],
    input: {
      kind: row.input_kind ?? "text",
      text: row.input_text ?? undefined,
      url: row.input_url ?? undefined,
    },
    findings: fndRows
      .sort((a, b) => a.position - b.position)
      .map((f) => ({
        kind: f.kind,
        title: f.title,
        detail: f.detail,
        severity: f.severity as "info",
        weight: f.weight,
        sourceRefs: parseJson<number[]>(f.source_refs) ?? [],
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
        publishedAt: s.published_at,
        retrievedAt: s.retrieved_at,
        trustTier: (s.trust_tier as "official") ?? undefined,
        meta: parseJson<Record<string, unknown>>(s.meta) ?? undefined,
      })),
    limitations: parseJson<string[]>(row.limitations) ?? [],
    nextSteps: parseJson<string[]>(row.next_steps) ?? [],
    payload: parseJson<Record<string, unknown>>(row.payload) ?? {},
    workflow: parseJson<VerificationReport["workflow"]>(row.workflow) ?? [],
    providers: parseJson<VerificationReport["providers"]>(row.providers_used) ?? [],
    checkedAt: row.checked_at,
    latencyMs: row.latency_ms ?? 0,
    costUsd: row.cost_usd ?? 0,
  };
}

export async function listRecentReports(limit = 12) {
  return db.all<{
    publicId: string;
    category: string;
    status: string;
    confidence: number | null;
    summary: string;
    inputKind: string | null;
    checkedAt: string;
  }>(
    `select public_id as publicId, category, status, confidence, summary, input_kind as inputKind, checked_at as checkedAt
     from verification_reports order by checked_at desc limit ?`,
    limit,
  );
}

export async function adminStats() {
  const [totals, byCategory, byStatus, usage, fb, catalogCount, businesses, subs, flags] = await Promise.all([
    db.first<{ count: number; cost: number }>("select count(*) as count, coalesce(sum(cost_usd), 0) as cost from verification_reports"),
    db.all<{ category: string; count: number }>("select category, count(*) as count from verification_reports group by category"),
    db.all<{ status: string; count: number }>("select status, count(*) as count from verification_reports group by status"),
    db.all<{ provider: string; calls: number; cost: number; errors: number; avgLatency: number }>(
      `select provider, count(*) as calls, coalesce(sum(cost_usd), 0) as cost,
              coalesce(sum(case when status = 'error' then 1 else 0 end), 0) as errors,
              coalesce(avg(latency_ms), 0) as avgLatency
       from provider_usage group by provider`,
    ),
    db.all<{ status: string; count: number }>("select status, count(*) as count from feedback group by status"),
    db.first<{ count: number }>("select count(*) as count from product_catalog"),
    db.first<{ count: number }>("select count(*) as count from business_accounts"),
    db.first<{ count: number }>("select count(*) as count from newsletter_subscribers"),
    db.all<{ key: string; enabled: number; detail: string | null; updated_at: string }>("select * from service_flags"),
  ]);

  return {
    totals: totals ?? { count: 0, cost: 0 },
    byCategory,
    byStatus,
    usage,
    feedback: fb,
    catalogCount: catalogCount?.count ?? 0,
    businesses: businesses?.count ?? 0,
    subscribers: subs?.count ?? 0,
    flags: flags.map((f) => ({ key: f.key, enabled: f.enabled === 1, detail: f.detail, updatedAt: f.updated_at })),
  };
}

const FEEDBACK_COLS = "id, report_id as reportId, public_id as publicId, kind, message, contact, status, created_at as createdAt";

export async function listFeedback(status?: string) {
  return status
    ? db.all(`select ${FEEDBACK_COLS} from feedback where status = ? order by created_at desc limit 100`, status)
    : db.all(`select ${FEEDBACK_COLS} from feedback order by created_at desc limit 100`);
}

export async function listRecentAudit(limit = 40) {
  return db.all(`select id, actor, action, meta, created_at as createdAt from audit_events order by created_at desc limit ?`, limit);
}

export async function recordFeedback(values: {
  reportId?: string | null;
  publicId?: string | null;
  kind: string;
  message?: string | null;
  contact?: string | null;
}) {
  await db.run(
    "insert into feedback (id, report_id, public_id, kind, message, contact, status) values (?, ?, ?, ?, ?, ?, 'new')",
    newId(),
    values.reportId ?? null,
    values.publicId ?? null,
    values.kind,
    values.message ? values.message.slice(0, 2000) : null,
    values.contact ?? null,
  );
  if (values.reportId) {
    await db.run("update verification_reports set flagged = 1 where id = ?", values.reportId);
  }
}

export async function purgeExpiredReports(): Promise<number> {
  const now = new Date().toISOString();
  const expired = await db.all<{ id: string }>(
    "select id from verification_reports where retention_expires_at is not null and retention_expires_at < ?",
    now,
  );
  if (!expired.length) return 0;
  const ids = expired.map((r) => r.id);
  const placeholders = ids.map(() => "?").join(", ");
  // Children first, then the reports (FK cascade is not relied on).
  await db.run(`delete from evidence_sources where report_id in (${placeholders})`, ...ids);
  await db.run(`delete from report_findings where report_id in (${placeholders})`, ...ids);
  const res = await db.run(`delete from verification_reports where id in (${placeholders})`, ...ids);
  return res.changes;
}
