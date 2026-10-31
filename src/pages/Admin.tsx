import { Link } from "@/components/link";
import { AdminConsole } from "@/components/admin-console";
import { IconArrow, IconLock, Panel, Reveal, SectionLabel, TonalChip } from "@/components/ui";

const DUTIES = [
  { title: "Watch the spend before it watches you", body: "Every provider call is metered against the request that caused it. The daily ceiling stops a viral moment from becoming an invoice you cannot pay." },
  { title: "Review corrections as a human", body: "A flagged report means somebody believes the evidence was wrong. Read it, decide, and either uphold the finding or republish the report with the correction attached." },
  { title: "Kill expensive operations first", body: "The switches are ordered by cost. Turn off paid providers before you turn off intake — the free local engine still produces useful, honestly-labelled results." },
  { title: "Treat errors as evidence", body: "A provider that fails is reported in the affected result rather than silently skipped. Watch the error column: a rising rate usually means a key, quota or licence problem." },
];

export default function AdminPage() {
  return (
    <>
      <section className="relative overflow-hidden pt-14">
        <div className="grid-field pointer-events-none absolute inset-0 opacity-40" />
        <div className="noise-layer" />
        <div className="relative mx-auto max-w-[1400px] px-5 pb-10 sm:px-8">
          <Reveal>
            <div className="flex flex-wrap items-center gap-3">
              <TonalChip tone="brand">restricted</TonalChip>
              <TonalChip tone="neutral">operator only</TonalChip>
              <TonalChip tone="neutral">not indexed</TonalChip>
            </div>
            <h1 className="mt-6 max-w-3xl font-display text-[clamp(2rem,4.6vw,3.4rem)] font-semibold leading-[1] tracking-[-0.03em] text-paper-50">
              Operator console
            </h1>
            <p className="mt-5 max-w-2xl text-[16px] leading-relaxed text-mist-400">
              Service health, verdict distribution, metered provider cost, the corrections queue, the
              audit log and the emergency switches. Everything on this page writes to PostgreSQL and
              every write is logged against an actor.
            </p>
          </Reveal>
        </div>
      </section>

      <section className="relative mx-auto max-w-[1400px] px-5 sm:px-8">
        <AdminConsole />
      </section>

      <section className="relative mx-auto mt-20 max-w-[1400px] px-5 sm:px-8">
        <Reveal>
          <SectionLabel tone="mist">Operating duties</SectionLabel>
        </Reveal>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {DUTIES.map((duty, i) => (
            <Reveal key={duty.title} delay={i * 60}>
              <Panel className="group h-full p-6">
                <div className="flex items-start gap-4">
                  <IconLock className="mt-0.5 h-5 w-5 shrink-0 text-brand-400" />
                  <div>
                    <h3 className="font-display text-[16.5px] text-paper-50">{duty.title}</h3>
                    <p className="mt-2 text-[13.5px] leading-relaxed text-mist-500">{duty.body}</p>
                  </div>
                </div>
              </Panel>
            </Reveal>
          ))}
        </div>

        <Reveal delay={80}>
          <Panel hover={false} className="mt-6 p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <SectionLabel tone="mist">Related endpoints</SectionLabel>
                <p className="mt-3 max-w-2xl text-[13px] leading-relaxed text-mist-500">
                  The console reads <code className="font-mono text-mist-300">GET /api/admin</code> and
                  writes <code className="font-mono text-mist-300">POST /api/admin</code> with actions{" "}
                  <code className="font-mono text-mist-300">set-flag</code>,{" "}
                  <code className="font-mono text-mist-300">seed-catalog</code>,{" "}
                  <code className="font-mono text-mist-300">purge-expired</code> and{" "}
                  <code className="font-mono text-mist-300">resolve-feedback</code>. Liveness and the
                  database probe are public at <code className="font-mono text-mist-300">/api/health</code>.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <a href="/api/health" className="inline-flex items-center gap-2 rounded-sm border border-mist-500/25 px-4 py-2.5 text-[13px] text-mist-300 transition-colors hover:border-brand-500/50 hover:text-brand-400">
                  Service health <IconArrow className="h-4 w-4" />
                </a>
                <Link href="/blueprint" className="inline-flex items-center gap-2 rounded-sm border border-mist-500/25 px-4 py-2.5 text-[13px] text-mist-300 transition-colors hover:border-brand-500/50 hover:text-brand-400">
                  Blueprint §08 &amp; §09 <IconArrow className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </Panel>
        </Reveal>
      </section>
    </>
  );
}
