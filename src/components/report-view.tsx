import { useState } from "react";
import { Link } from "@/components/link";
import type {
  EvidenceSource,
  ReportFinding,
  VerificationReport,
} from "@/lib/types";
import { CATEGORY_LABEL, VERDICT_LABEL, VERDICT_TONE } from "@/lib/types";
import {
  ConfidenceMeter,
  DataLine,
  IconAlert,
  IconArrow,
  IconScale,
  IconSeal,
  Panel,
  Reveal,
  SectionLabel,
  TonalChip,
} from "@/components/ui";

const SEVERITY_META: Record<ReportFinding["severity"], { label: string; tone: "ok" | "warn" | "risk" | "unknown" | "info"; order: number }> = {
  risk: { label: "Risk signal", tone: "risk", order: 0 },
  warning: { label: "Warning", tone: "warn", order: 1 },
  unknown: { label: "Unknown", tone: "unknown", order: 2 },
  info: { label: "Observation", tone: "info", order: 3 },
  positive: { label: "Supports", tone: "ok", order: 4 },
};

const STANCE_META: Record<EvidenceSource["stance"], { label: string; tone: "ok" | "risk" | "info" | "neutral" }> = {
  supports: { label: "Supports", tone: "ok" },
  contradicts: { label: "Contradicts", tone: "risk" },
  context: { label: "Context", tone: "info" },
  neutral: { label: "Neutral", tone: "neutral" },
};

const TRUST_META: Record<string, { label: string; tone: "ok" | "info" | "warn" | "neutral" }> = {
  official: { label: "Official / authoritative", tone: "ok" },
  reputable: { label: "Reputable publisher", tone: "info" },
  mixed: { label: "Mixed / user-generated", tone: "warn" },
  unrated: { label: "Unrated source", tone: "neutral" },
};

function toneClass(tone: "ok" | "warn" | "risk" | "unknown") {
  return {
    ok: { text: "text-ok-400", border: "border-ok-400/35", bg: "bg-ok-400/6", glow: "shadow-[0_0_60px_-24px_rgba(53,214,163,0.55)]" },
    warn: { text: "text-warn-400", border: "border-warn-500/40", bg: "bg-warn-500/6", glow: "shadow-[0_0_60px_-24px_rgba(245,158,11,0.5)]" },
    risk: { text: "text-risk-400", border: "border-risk-500/45", bg: "bg-risk-500/8", glow: "shadow-[0_0_60px_-24px_rgba(255,70,85,0.6)]" },
    unknown: { text: "text-mist-300", border: "border-ink-500", bg: "bg-ink-800", glow: "shadow-none" },
  }[tone];
}

export function ReportView({ report, embedded = false }: { report: VerificationReport; embedded?: boolean }) {
  const tone = VERDICT_TONE[report.status];
  const t = toneClass(tone);
  const [tab, setTab] = useState<"findings" | "evidence" | "pipeline" | "data" | "json">("findings");
  const [flagOpen, setFlagOpen] = useState(false);
  const [flagState, setFlagState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [flagMessage, setFlagMessage] = useState("");

  const grouped = [...report.findings].sort(
    (a, b) => SEVERITY_META[a.severity].order - SEVERITY_META[b.severity].order,
  );
  const counts = {
    risk: grouped.filter((f) => f.severity === "risk").length,
    warning: grouped.filter((f) => f.severity === "warning").length,
    positive: grouped.filter((f) => f.severity === "positive").length,
    unknown: grouped.filter((f) => f.severity === "unknown").length,
    info: grouped.filter((f) => f.severity === "info").length,
  };
  const classification = (report.payload?.classification ?? {}) as {
    category?: string;
    confidence?: number;
    reasons?: string[];
    overridden?: boolean;
    requested?: string;
    alternatives?: Array<{ category: string; why: string }>;
  };
  const totalCost = report.providers.reduce((s, p) => s + (p.costUsd || 0), 0);

  async function submitFlag() {
    setFlagState("sending");
    const res = await fetch(`/api/report/${report.publicId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "correction", message: flagMessage }),
    });
    setFlagState(res.ok ? "sent" : "error");
  }

  return (
    <article className="space-y-6">
      {/* verdict header */}
      <Panel hover={false} className={`${t.border} ${t.bg} ${t.glow} p-0`}>
        <div className="grid-fine pointer-events-none absolute inset-0 opacity-25" />
        <div className="relative grid gap-8 p-6 sm:p-9 lg:grid-cols-[1.6fr_1fr]">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <SectionLabel tone={tone === "risk" ? "risk" : tone === "ok" ? "ok" : tone === "warn" ? "warn" : "mist"}>
                {CATEGORY_LABEL[report.category]}
              </SectionLabel>
              <span className="font-mono text-[11px] text-mist-600">{report.publicId}</span>
            </div>

            <h2 className={`mt-5 font-display text-[clamp(1.7rem,3.6vw,2.7rem)] font-semibold leading-[1.08] tracking-tight ${t.text}`}>
              {report.headline}
            </h2>
            <p className="mt-3 rule-label text-mist-500">{VERDICT_LABEL[report.status]}</p>

            <p className="mt-6 max-w-2xl text-[15px] leading-relaxed text-mist-300">{report.summary}</p>

            <div className="mt-7 flex flex-wrap gap-2">
              <TonalChip tone="risk">{counts.risk} risk</TonalChip>
              <TonalChip tone="warn">{counts.warning} warning</TonalChip>
              <TonalChip tone="unknown">{counts.unknown} unknown</TonalChip>
              <TonalChip tone="info">{counts.info} observation</TonalChip>
              <TonalChip tone="ok">{counts.positive} supporting</TonalChip>
              <TonalChip tone="neutral">{report.sources.length} source{report.sources.length === 1 ? "" : "s"}</TonalChip>
            </div>
          </div>

          <div className="space-y-5 border-t border-ink-600 pt-6 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
            <ConfidenceMeter value={report.confidence} tone={tone} />
            <div className="grid gap-x-6 sm:grid-cols-2">
              <DataLine label="Checked" value={new Date(report.checkedAt).toISOString().slice(0, 19).replace("T", " ")} />
              <DataLine label="Latency" value={`${report.latencyMs} ms`} />
              <DataLine label="Providers" value={`${report.providers.length}`} />
              <DataLine label="Variable cost" value={`$${totalCost.toFixed(4)}`} />
            </div>
            <div className="dash-accent rounded-sm bg-ink-950/70 p-4">
              <p className="rule-label text-mist-500">Input received</p>
              <p className="mt-2 font-mono text-xs leading-relaxed text-mist-400">
                kind: {report.input.kind}
                {report.input.bytes ? ` · ${report.input.bytes.toLocaleString()} bytes` : ""}
                {report.input.fileName ? ` · ${report.input.fileName}` : ""}
              </p>
              {(report.input.text || report.input.url) && (
                <p className="mt-2 line-clamp-3 border-l border-brand-500/40 pl-3 text-xs leading-relaxed text-mist-500">
                  {report.input.url ?? report.input.text}
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href="/identify"
                className="glow-accent inline-flex items-center gap-2 rounded-sm bg-brand-cta px-4 py-2.5 text-[13px] font-semibold text-white transition-[transform,background-color] hover:-translate-y-0.5 hover:bg-brand-cta-hover"
              >
                New check <IconArrow className="h-4 w-4" />
              </Link>
              <button
                type="button"
                onClick={() => setFlagOpen((v) => !v)}
                aria-expanded={flagOpen}
                className="inline-flex items-center gap-2 rounded-sm border border-ink-500 bg-ink-900/70 px-4 py-2.5 text-[13px] text-mist-300 transition-colors hover:border-risk-500/50 hover:text-risk-400"
              >
                <IconAlert className="h-4 w-4" /> Flag this result
              </button>
            </div>
          </div>
        </div>

        {flagOpen && (
          <div className="relative border-t border-mist-500/15 bg-ink-950/70 p-6 sm:p-9">
            <div className="flex items-start gap-3">
              <IconScale className="mt-0.5 h-5 w-5 text-brand-400" />
              <div className="flex-1">
                <h3 className="font-display text-lg text-paper-50">Dispute this result</h3>
                <p className="mt-1 max-w-2xl text-sm text-mist-500">
                  Corrections are reviewed by a human. Where the evidence was wrong we republish the
                  report with the correction attached — we do not quietly delete it.
                </p>
                {flagState === "sent" ? (
                  <p className="mt-4 rounded-sm border border-ok-400/35 bg-ok-400/10 p-3 text-sm text-ok-400">
                    Correction received and logged against {report.publicId}.
                  </p>
                ) : (
                  <>
                    <textarea
                      value={flagMessage}
                      onChange={(e) => setFlagMessage(e.target.value)}
                      rows={3}
                      placeholder="What is wrong with this conclusion, and what evidence should we look at?"
                      aria-label="Describe what is wrong with this result"
                      className="field mt-4 resize-y p-3 text-xs"
                    />
                    <button
                      type="button"
                      disabled={!flagMessage.trim() || flagState === "sending"}
                      onClick={submitFlag}
                      className="mt-3 rounded-sm border border-brand-500/70 bg-ink-900 px-4 py-2 text-[13px] font-semibold text-brand-400 transition-colors hover:bg-brand-cta hover:text-white disabled:opacity-40 disabled:hover:bg-ink-900 disabled:hover:text-brand-400"
                    >
                      {flagState === "sending" ? "Submitting…" : "Submit correction"}
                    </button>
                    {flagState === "error" && (
                      <p className="mt-2 text-xs text-risk-400">Submission failed. Please try again.</p>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </Panel>

      {/* routing explanation */}
      {classification.reasons?.length ? (
        <Reveal>
          <Panel hover={false} className="p-6">
            <SectionLabel tone="mist">Automatic routing</SectionLabel>
            <p className="mt-4 text-sm text-mist-400">
              Routed to <span className="text-paper-50">{CATEGORY_LABEL[report.category]}</span>
              {classification.overridden ? " (you overrode the automatic choice)" : ` with ${Math.round((classification.confidence ?? 0) * 100)}% routing confidence`}.
            </p>
            <ul className="mt-4 space-y-2">
              {classification.reasons.map((reason, i) => (
                <li key={i} className="flex gap-3 text-[13px] leading-relaxed text-mist-500">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-brand-500" />
                  {reason}
                </li>
              ))}
            </ul>
          </Panel>
        </Reveal>
      ) : null}

      {/* tabs */}
      <div role="tablist" aria-label="Report sections" className="flex flex-wrap gap-1 border-b border-ink-600">
        {([
          ["findings", `Findings (${report.findings.length})`],
          ["evidence", `Evidence (${report.sources.length})`],
          ["pipeline", `Pipeline (${report.workflow.length})`],
          ["data", "Module data"],
          ["json", "Report JSON"],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`relative px-4 py-2.5 text-[13px] transition-colors ${
              tab === key ? "text-brand-400" : "text-mist-400 hover:text-paper-50"
            }`}
          >
            {label}
            {tab === key && <span className="absolute inset-x-2 -bottom-px h-0.5 bg-brand-500" />}
          </button>
        ))}
      </div>

      {tab === "findings" && (
        <div className="space-y-3">
          {grouped.length === 0 && (
            <Panel hover={false} className="p-6 text-sm text-mist-500">
              No findings were produced for this input.
            </Panel>
          )}
          {grouped.map((finding, i) => {
            const meta = SEVERITY_META[finding.severity];
            const ft = toneClass(meta.tone === "risk" ? "risk" : meta.tone === "warn" ? "warn" : meta.tone === "ok" ? "ok" : "unknown");
            return (
              <Reveal key={`${finding.kind}-${i}`} delay={i * 25}>
                <Panel hover={false} className={`p-5 ${ft.border}`}>
                  <div className="flex flex-wrap items-center gap-3">
                    <TonalChip tone={meta.tone}>{meta.label}</TonalChip>
                    <span className="rule-label text-mist-600">{finding.kind}</span>
                    <span className="ml-auto font-mono text-[11px] text-mist-600">weight {finding.weight.toFixed(2)}</span>
                  </div>
                  <h3 className="mt-3 font-display text-[17px] font-medium text-paper-50">{finding.title}</h3>
                  <p className="mt-2 whitespace-pre-line text-[14px] leading-relaxed text-mist-400">{finding.detail}</p>
                </Panel>
              </Reveal>
            );
          })}
        </div>
      )}

      {tab === "evidence" && (
        <div className="space-y-3">
          {report.sources.length === 0 && (
            <Panel hover={false} className="p-6 text-sm text-mist-500">
              No external sources were retrieved for this check. The findings above come from the
              local SG16 rules engine only — treat the conclusion accordingly.
            </Panel>
          )}
          {report.sources.map((source, i) => {
            const stance = STANCE_META[source.stance] ?? STANCE_META.neutral;
            const trust = TRUST_META[source.trustTier ?? "unrated"] ?? TRUST_META.unrated;
            return (
              <Reveal key={`${source.url ?? source.title}-${i}`} delay={i * 25}>
                <Panel hover={false} className="p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <TonalChip tone={stance.tone}>{stance.label}</TonalChip>
                    <TonalChip tone={trust.tone}>{trust.label}</TonalChip>
                    <span className="rule-label text-mist-600">{source.provider}</span>
                    {source.publishedAt && (
                      <span className="ml-auto font-mono text-[11px] text-mist-600">
                        published {source.publishedAt.slice(0, 10)}
                      </span>
                    )}
                  </div>
                  <h3 className="mt-3 font-display text-[16px] font-medium text-paper-50">
                    {source.url ? (
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer nofollow"
                        className="underline decoration-mist-500/40 underline-offset-4 transition-colors hover:text-brand-400"
                      >
                        {source.title ?? source.url}
                      </a>
                    ) : (
                      source.title
                    )}
                  </h3>
                  {source.publisher && <p className="mt-1 text-xs text-mist-600">{source.publisher}</p>}
                  {source.excerpt && (
                    <p className="mt-3 line-clamp-6 whitespace-pre-line border-l border-mist-500/25 pl-4 text-[13px] leading-relaxed text-mist-400">
                      {source.excerpt}
                    </p>
                  )}
                  {source.url && (
                    <p className="mt-3 truncate font-mono text-[11px] text-mist-600">
                      {source.url} · retrieved {source.retrievedAt.slice(0, 19).replace("T", " ")} UTC
                    </p>
                  )}
                </Panel>
              </Reveal>
            );
          })}
        </div>
      )}

      {tab === "pipeline" && (
        <div className="space-y-6">
          <Panel hover={false} className="p-6">
            <SectionLabel tone="mist">Execution trace</SectionLabel>
            <ol className="mt-5 space-y-0">
              {report.workflow.map((step) => (
                <li key={step.index} className="relative flex gap-4 pb-5 last:pb-0">
                  <div className="flex flex-col items-center">
                    <span
                      className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border font-mono text-[10px] ${
                        step.status === "done"
                          ? "border-ok-400/50 bg-ok-400/10 text-ok-400"
                          : step.status === "skipped"
                            ? "border-mist-500/30 bg-mist-500/5 text-mist-500"
                            : "border-risk-500/50 bg-risk-500/10 text-risk-400"
                      }`}
                    >
                      {step.index}
                    </span>
                    <span className="mt-1 w-px flex-1 bg-mist-500/15" />
                  </div>
                  <div className="flex-1 pb-1">
                    <div className="flex flex-wrap items-baseline gap-3">
                      <h4 className="font-display text-[15px] text-paper-50">{step.label}</h4>
                      <span className="rule-label text-mist-600">{step.status}</span>
                      <span className="ml-auto font-mono text-[11px] text-mist-600">{step.ms} ms</span>
                    </div>
                    <p className="mt-1 text-[13px] leading-relaxed text-mist-500">{step.detail}</p>
                  </div>
                </li>
              ))}
            </ol>
          </Panel>

          <Panel hover={false} className="overflow-hidden">
            <div className="p-6 pb-3">
              <SectionLabel tone="mist">Provider calls &amp; metered cost</SectionLabel>
            </div>
            <div className="overflow-x-auto scrollbar-thin">
              <table className="w-full min-w-[640px] text-left text-[13px]">
                <thead className="border-y border-mist-500/15 bg-ink-900/60">
                  <tr className="rule-label text-mist-600">
                    <th className="px-6 py-3 font-normal">Provider</th>
                    <th className="px-4 py-3 font-normal">Operation</th>
                    <th className="px-4 py-3 font-normal">Status</th>
                    <th className="px-4 py-3 text-right font-normal">Cost</th>
                  </tr>
                </thead>
                <tbody className="font-mono text-xs">
                  {report.providers.map((p, i) => (
                    <tr key={`${p.provider}-${i}`} className="border-b border-mist-500/8 last:border-0">
                      <td className="px-6 py-2.5 text-mist-300">{p.provider}</td>
                      <td className="px-4 py-2.5 text-mist-500">{p.operation}</td>
                      <td className="px-4 py-2.5">
                        <span
                          className={
                            p.status === "ok" ? "text-ok-400"
                            : p.status === "error" ? "text-risk-400"
                            : p.status === "disabled" ? "text-warn-400"
                            : "text-mist-500"
                          }
                        >
                          {p.status}
                        </span>
                        {(p.detail || p.error) && (
                          <span className="mt-0.5 block max-w-[420px] font-sans text-[11px] leading-snug text-mist-600">
                            {p.error ?? p.detail}
                          </span>
                        )}
                        {p.tokensIn ? (
                          <span className="mt-0.5 block text-[11px] text-mist-600">
                            {p.tokensIn} in / {p.tokensOut ?? 0} out tokens
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-2.5 text-right text-mist-400">${(p.costUsd || 0).toFixed(5)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="px-6 py-4 text-xs text-mist-600">
              Total metered variable cost for this check:{" "}
              <span className="font-mono text-mist-300">${totalCost.toFixed(5)}</span>. Every call is
              recorded against this report ID in <span className="font-mono">provider_usage</span>.
            </p>
          </Panel>
        </div>
      )}

      {tab === "data" && <ModuleData report={report} />}

      {tab === "json" && (
        <Panel hover={false} className="p-0">
          <div className="flex items-center justify-between border-b border-mist-500/15 px-6 py-4">
            <SectionLabel tone="mist">Standard report schema</SectionLabel>
            <span className="rule-label text-mist-600">application/json</span>
          </div>
          <pre className="max-h-[560px] overflow-auto scrollbar-thin p-6 font-mono text-[11.5px] leading-relaxed text-mist-400">
{JSON.stringify(
  {
    report_id: report.reportId,
    public_id: report.publicId,
    category: report.category,
    status: report.status,
    confidence: report.confidence,
    headline: report.headline,
    summary: report.summary,
    findings: report.findings,
    sources: report.sources,
    limitations: report.limitations,
    next_steps: report.nextSteps,
    providers: report.providers,
    checked_at: report.checkedAt,
    latency_ms: report.latencyMs,
    cost_usd: report.costUsd,
  },
  null,
  2,
)}
          </pre>
        </Panel>
      )}

      {/* limitations + next steps */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Reveal>
          <Panel hover={false} className="h-full p-6">
            <div className="flex items-center gap-3">
              <IconAlert className="h-5 w-5 text-warn-400" />
              <SectionLabel tone="warn">What this report could not check</SectionLabel>
            </div>
            <ul className="mt-5 space-y-3">
              {report.limitations.map((limitation, i) => (
                <li key={i} className="flex gap-3 text-[13.5px] leading-relaxed text-mist-400">
                  <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-warn-500/70" />
                  {limitation}
                </li>
              ))}
            </ul>
          </Panel>
        </Reveal>
        <Reveal delay={80}>
          <Panel hover={false} className="h-full p-6">
            <div className="flex items-center gap-3">
              <IconSeal className="h-5 w-5 text-brand-400" />
              <SectionLabel>Recommended next steps</SectionLabel>
            </div>
            <ol className="mt-5 space-y-3">
              {report.nextSteps.map((step, i) => (
                <li key={i} className="flex gap-3 text-[13.5px] leading-relaxed text-mist-400">
                  <span className="mt-0.5 font-mono text-[11px] text-brand-400">{String(i + 1).padStart(2, "0")}</span>
                  {step}
                </li>
              ))}
            </ol>
          </Panel>
        </Reveal>
      </div>

      {/* disclosed commercial links */}
      {report.retailLinks?.length ? (
        <Reveal>
          <Panel hover={false} className="border-dashed border-brand-700 p-6">
            <div className="flex flex-wrap items-center gap-3">
              <SectionLabel tone="mist">Compare with official sources</SectionLabel>
              <TonalChip tone="neutral">commercial relationships disclosed</TonalChip>
            </div>
            <p className="mt-4 max-w-3xl text-xs leading-relaxed text-mist-600">
              Some links below are commercial. SG16 Identifier may earn a commission if you buy
              something after clicking one. Commissions are logged for audit and never influence a
              verification result, a confidence figure or a ranking.
            </p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {report.retailLinks.map((link) => (
                <RetailLinkCard key={link.destination} link={link} reportId={report.reportId} />
              ))}
            </div>
          </Panel>
        </Reveal>
      ) : null}

      {!embedded && (
        <p className="pt-2 text-center text-xs text-mist-600">
          Report {report.publicId} is stored for the configured retention window and then deleted.
          Nothing you submit is published, sold or used to train a model.
        </p>
      )}
    </article>
  );
}

function RetailLinkCard({ link, reportId }: { link: NonNullable<VerificationReport["retailLinks"]>[number]; reportId: string }) {
  const [state, setState] = useState<"idle" | "logging">("idle");
  async function go() {
    setState("logging");
    try {
      await fetch("/api/engage", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "affiliate-click", destination: link.destination, retailer: link.retailer, productRef: link.productRef, reportId }),
      });
    } catch {
      /* the click still opens; logging is best-effort */
    }
    window.open(link.destination, "_blank", "noopener,noreferrer");
    setState("idle");
  }
  return (
    <button
      type="button"
      onClick={go}
      className="group flex items-start gap-3 rounded-sm border border-ink-600 bg-ink-900/70 p-4 text-left transition-colors hover:border-brand-700 hover:bg-ink-700"
    >
      <span className="mt-0.5 text-brand-400">
        <IconArrow className="h-4 w-4 transition-transform group-hover:translate-x-1" />
      </span>
      <span className="flex-1">
        <span className="block text-[14px] text-paper-50">{link.label}</span>
        <span className="mt-1 block rule-label text-mist-600">
          {link.retailer} · {state === "logging" ? "logging referral…" : "referral logged on click"}
        </span>
      </span>
    </button>
  );
}

function ModuleData({ report }: { report: VerificationReport }) {
  const payload = report.payload ?? {};
  const entries = Object.entries(payload).filter(
    ([k]) => !["classification", "providersAvailable", "headline"].includes(k),
  );
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {entries.map(([key, value]) => (
        <Panel key={key} hover={false} className="p-5">
          <h4 className="rule-label text-brand-400">{key.replace(/([A-Z])/g, " $1").toLowerCase()}</h4>
          <pre className="mt-3 max-h-72 overflow-auto scrollbar-thin whitespace-pre-wrap font-mono text-[11.5px] leading-relaxed text-mist-400">
            {typeof value === "string" ? value : JSON.stringify(value, null, 2)}
          </pre>
        </Panel>
      ))}
      <Panel hover={false} className="p-5 lg:col-span-2">
        <h4 className="rule-label text-mist-500">Providers available in this deployment</h4>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {((payload.providersAvailable ?? []) as Array<{ id: string; enabled: boolean; reason?: string }>).map((p) => (
            <div key={p.id} className="flex items-start gap-2 rounded-sm border border-mist-500/12 bg-ink-900/50 p-3">
              <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${p.enabled ? "bg-ok-400" : "bg-warn-500"}`} />
              <span className="text-xs">
                <span className="block font-mono text-mist-300">{p.id}</span>
                <span className="mt-0.5 block text-mist-600">{p.enabled ? "active" : p.reason ?? "inactive"}</span>
              </span>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
