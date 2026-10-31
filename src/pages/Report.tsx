import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router";
import { Link } from "@/components/link";
import { ReportView } from "@/components/report-view";
import { VerifyConsole } from "@/components/verify-console";
import { IconArrow, IconSeal, Panel, Reveal, SectionLabel, TonalChip } from "@/components/ui";
import { applyPageMeta } from "@/lib/document-meta";
import { DEFAULT_DESCRIPTION, REPORT_ID_RE, pageTitle } from "@/lib/seo";
import { VERDICT_LABEL, VERDICT_TONE, type VerificationReport } from "@/lib/types";

type Load =
  | { state: "loading" }
  | { state: "missing" }
  | { state: "unavailable" }
  | { state: "ready"; report: VerificationReport };

const NO_INDEX = "noindex, nofollow";

/** Reads a stored report from /api/report/:id; null when the request was abandoned. */
async function fetchReport(publicId: string, signal: AbortSignal): Promise<Load | null> {
  try {
    const res = await fetch(`/api/report/${publicId}`, { signal, headers: { accept: "application/json" } });
    if (res.status === 404) return { state: "missing" };
    const json = (await res.json()) as { ok?: boolean; report?: VerificationReport };
    return res.ok && json.report ? { state: "ready", report: json.report } : { state: "unavailable" };
  } catch (error) {
    return (error as Error).name === "AbortError" ? null : { state: "unavailable" };
  }
}

export default function ReportPage() {
  const { id = "" } = useParams();
  const publicId = id.trim().toUpperCase();
  const valid = REPORT_ID_RE.test(publicId);
  const [result, setResult] = useState<{ id: string; load: Load } | null>(null);
  const load = useMemo<Load>(() => (result?.id === publicId ? result.load : { state: "loading" }), [result, publicId]);

  useEffect(() => {
    if (!valid) return;
    const controller = new AbortController();
    void fetchReport(publicId, controller.signal).then((next) => {
      if (next) setResult({ id: publicId, load: next });
    });
    return () => controller.abort();
  }, [publicId, valid]);

  useEffect(() => {
    if (load.state === "ready") {
      applyPageMeta({
        title: pageTitle(`${load.report.publicId} — ${VERDICT_LABEL[load.report.status]}`),
        description: load.report.summary.slice(0, 180),
        robots: NO_INDEX,
      });
    } else if (load.state === "missing" || load.state === "unavailable") {
      applyPageMeta({
        title: pageTitle(load.state === "missing" ? "Report not found" : "Report unavailable"),
        description: DEFAULT_DESCRIPTION,
        robots: NO_INDEX,
      });
    }
  }, [load]);

  if (!valid) {
    return (
      <EmptyState
        title="That is not a report reference"
        body="SG16 report references look like SG16-4KQ2-9MXT. Check the address and try again."
      />
    );
  }

  if (load.state === "loading") return <Loading publicId={publicId} />;

  if (load.state === "unavailable") {
    return (
      <EmptyState
        title="The report store is temporarily unavailable"
        body="The database could not be reached while loading this report. Retry in a moment — the report itself has not been deleted."
      />
    );
  }

  if (load.state === "missing") {
    return (
      <EmptyState
        title={`No report exists for ${publicId}`}
        body="Reports are retained for the configured window and then permanently deleted. If this reference was issued more than that ago, the record is gone by design — that is the privacy default, not an error."
      />
    );
  }

  const { report } = load;
  const tone = VERDICT_TONE[report.status];

  return (
    <>
      <section className="relative overflow-hidden pt-10">
        <div className="grid-field pointer-events-none absolute inset-0 opacity-40" />
        <div className="noise-layer" />
        <div className="relative mx-auto max-w-[1180px] px-5 sm:px-8">
          <Reveal>
            <div className="flex flex-wrap items-center gap-3">
              <Link href="/" className="inline-flex items-center gap-2 text-[13px] text-mist-500 transition-colors hover:text-brand-400">
                <IconArrow className="h-4 w-4 rotate-180" /> SG16 Identifier
              </Link>
              <span className="text-mist-600">/</span>
              <span className="rule-label text-mist-500">report</span>
              <span className="text-mist-600">/</span>
              <span className="font-mono text-[12px] text-brand-400">{report.publicId}</span>
              <TonalChip tone={tone === "risk" ? "risk" : tone === "warn" ? "warn" : tone === "ok" ? "ok" : "unknown"}>
                {report.status.replace(/_/g, " ")}
              </TonalChip>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="relative mx-auto max-w-[1180px] px-5 py-10 sm:px-8">
        <ReportView report={report} />
      </section>

      <section className="relative mx-auto max-w-[1180px] px-5 pb-8 sm:px-8">
        <Reveal>
          <Panel hover={false} className="p-7">
            <div className="flex items-start gap-4">
              <IconSeal className="mt-1 h-6 w-6 shrink-0 text-brand-400" />
              <div>
                <SectionLabel tone="mist">About this record</SectionLabel>
                <p className="mt-4 max-w-3xl text-[13.5px] leading-relaxed text-mist-500">
                  This report was generated by the SG16 verification engine and stored in PostgreSQL
                  with its evidence, findings, provider calls and metered cost. It is addressed by an
                  unguessable reference and is not indexed by search engines. It is deleted
                  automatically at the end of the retention window. Nothing in it is a legal
                  conclusion, an accusation against a named person or business, or a substitute for
                  inspection by the manufacturer or an authorised service centre.
                </p>
                <div className="mt-5 flex flex-wrap gap-4 font-mono text-[11.5px] text-mist-600">
                  <span>report_id: {report.reportId}</span>
                  <span>checked_at: {report.checkedAt}</span>
                  <span>providers: {report.providers.length}</span>
                  <span>cost_usd: ${report.costUsd.toFixed(5)}</span>
                </div>
              </div>
            </div>
          </Panel>
        </Reveal>
      </section>

      <section className="relative mx-auto max-w-[1180px] px-5 pb-16 sm:px-8">
        <Reveal>
          <div className="border-t border-mist-500/12 pt-10">
            <SectionLabel>Run another check</SectionLabel>
            <h2 className="mt-4 max-w-2xl font-display text-[clamp(1.5rem,3vw,2.2rem)] font-semibold leading-tight tracking-tight text-paper-50">
              Compare a second identifier, link or image against this result.
            </h2>
          </div>
        </Reveal>
        <div className="mt-8">
          <VerifyConsole initialCategory={report.category} compact />
        </div>
      </section>
    </>
  );
}

function Loading({ publicId }: { publicId: string }) {
  return (
    <section className="relative mx-auto grid min-h-[62vh] max-w-[900px] place-items-center px-5 py-24 sm:px-8" aria-busy="true">
      <div className="grid-field pointer-events-none absolute inset-0 opacity-30" />
      <Panel hover={false} className="relative p-10 text-center">
        <IconSeal className="mx-auto h-10 w-10 animate-pulse text-brand-400" />
        <p className="rule-label mt-6 text-mist-500" aria-live="polite">
          reading {publicId} from the report store…
        </p>
      </Panel>
    </section>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <section className="relative mx-auto grid min-h-[62vh] max-w-[900px] place-items-center px-5 py-24 sm:px-8">
      <div className="grid-field pointer-events-none absolute inset-0 opacity-30" />
      <Reveal>
        <Panel hover={false} className="relative p-10 text-center">
          <IconSeal className="mx-auto h-10 w-10 text-brand-400" />
          <h1 className="mt-6 font-display text-[clamp(1.6rem,3.4vw,2.4rem)] font-semibold leading-tight text-paper-50">
            {title}
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-[14.5px] leading-relaxed text-mist-500">{body}</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/identify" className="glow-accent inline-flex items-center gap-2 rounded-sm bg-brand-cta px-5 py-3 text-[13.5px] font-semibold text-white transition-[transform,background-color] hover:-translate-y-0.5 hover:bg-brand-cta-hover">
              Open the verification console <IconArrow className="h-4 w-4" />
            </Link>
            <Link href="/legal/privacy" className="inline-flex items-center gap-2 rounded-sm border border-mist-500/25 px-5 py-3 text-[13.5px] text-mist-300 transition-colors hover:border-brand-500/50">
              Retention &amp; deletion policy
            </Link>
          </div>
        </Panel>
      </Reveal>
    </section>
  );
}
