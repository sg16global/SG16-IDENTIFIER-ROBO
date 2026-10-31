import { useEffect, useState } from "react";
import { IconArrow, IconSeal, Panel, SectionLabel, TonalChip } from "@/components/ui";

/* ------------------------------- launch checklist --------------------------- */

const CHECKLIST = [
  { id: "domain", label: "Production domain and HTTPS verified", detail: "sg16identifier.com resolves, redirects and serves a valid certificate chain." },
  { id: "db", label: "Database migrations and backup restoration tested", detail: "drizzle-kit push applied, retention job proven, a restore rehearsed end to end." },
  { id: "secrets", label: "API secrets secured and spending alerts configured", detail: "Keys only in the host secret manager; daily budget cap and provider quotas active." },
  { id: "ssrf", label: "URL-fetching and file-upload security tested", detail: "Private-range, redirect-hopping and magic-byte tests all rejected as designed." },
  { id: "citations", label: "Citations and uncertainty labels checked against real cases", detail: "Every conclusion traceable to a retrieved source or a named rule." },
  { id: "policy", label: "Privacy, terms and report-deletion workflows published", detail: "Retention window, deletion route and correction process live on the site." },
  { id: "a11y", label: "Mobile, accessibility and error-state tests passed", detail: "Keyboard-only completion, reduced-motion respected, 4xx/5xx states handled." },
  { id: "ops", label: "Monitoring, incident response and support contact ready", detail: "Error tracking, cost alerts, abuse queue and a named human contact." },
];

export function LaunchChecklist() {
  const [done, setDone] = useState<Record<string, boolean>>({});
  const complete = CHECKLIST.filter((c) => done[c.id]).length;
  const pct = Math.round((complete / CHECKLIST.length) * 100);
  return (
    <Panel hover={false} className="p-6 sm:p-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <SectionLabel>Go-live checklist</SectionLabel>
          <h3 className="mt-3 font-display text-2xl font-semibold text-paper-50">
            {complete} of {CHECKLIST.length} launch gates cleared
          </h3>
        </div>
        <div className="text-right">
          <span className="font-mono text-3xl tabular-nums text-brand-400">{pct}%</span>
          <div className="mt-2 h-1.5 w-40 overflow-hidden rounded-full bg-ink-600">
            <div className="h-full bg-brand-500 transition-[width] duration-700" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>
      <ul className="mt-7 grid gap-2 lg:grid-cols-2">
        {CHECKLIST.map((item) => {
          const active = Boolean(done[item.id]);
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => setDone((d) => ({ ...d, [item.id]: !d[item.id] }))}
                aria-pressed={active}
                className={`group flex w-full items-start gap-3 rounded-sm border p-4 text-left transition-all duration-300 ${
                  active
                    ? "border-ok-400/40 bg-ok-400/8"
                    : "border-ink-600 bg-ink-900/60 hover:border-brand-700 hover:bg-ink-700"
                }`}
              >
                <span
                  className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-sm border font-mono text-[10px] transition-colors ${
                    active ? "border-ok-400 bg-ok-400 text-ink-950" : "border-mist-500/50 text-transparent group-hover:border-brand-500"
                  }`}
                >
                  ✓
                </span>
                <span>
                  <span className={`block text-[14px] ${active ? "text-ok-400" : "text-paper-50"}`}>{item.label}</span>
                  <span className="mt-1 block text-[12.5px] leading-relaxed text-mist-600">{item.detail}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

/* --------------------------------- marquee --------------------------------- */

export function Marquee({ items }: { items: string[] }) {
  const doubled = [...items, ...items];
  return (
    <div className="relative flex overflow-hidden border-y border-brand-700/40 bg-ink-950 py-3">
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-24 bg-gradient-to-r from-ink-950 to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-24 bg-gradient-to-l from-ink-950 to-transparent" />
      <div className="flex min-w-full shrink-0 animate-ticker items-center gap-10 pr-10">
        {doubled.map((item, i) => (
          <span key={i} className="flex shrink-0 items-center gap-3 font-mono text-[11.5px] tracking-wide text-mist-500">
            <span className="h-1 w-1 rotate-45 bg-brand-500" />
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------ live provider feed --------------------------- */

interface MetaResponse {
  providers?: Array<{ id: string; label: string; purpose: string; enabled: boolean; reason: string | null; docsUrl: string | null }>;
  stats?: { reports: number; cost: number; avgLatency: number };
  budget?: { dailyUsd: number; spentUsd: number };
}

export function ProviderStatus() {
  const [data, setData] = useState<MetaResponse | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    fetch("/api/meta?section=all")
      .then((r) => r.json())
      .then((json) => { if (live) setData(json); })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, []);

  if (failed) {
    return (
      <Panel hover={false} className="p-6 sm:p-8">
        <SectionLabel tone="mist">Adapter status in this deployment</SectionLabel>
        <p className="mt-4 flex items-start gap-2 text-[13px] leading-relaxed text-warn-400">
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-warn-500" />
          Adapter status could not be loaded from /api/meta. Nothing is shown rather than a guess.
        </p>
      </Panel>
    );
  }

  return (
    <Panel hover={false} className="p-6 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <SectionLabel tone="mist">Adapter status in this deployment</SectionLabel>
        <span className="rule-label text-mist-600" aria-live="polite">
          {!data
            ? "reading /api/meta…"
            : data.stats
              ? `${data.stats.reports} reports stored · $${data.stats.cost.toFixed(4)} metered`
              : "report totals unavailable"}
        </span>
      </div>
      <div className="mt-6 grid gap-3 md:grid-cols-2">
        {(data?.providers ?? Array.from({ length: 7 })).map((p, i) => {
          const provider = p as NonNullable<MetaResponse["providers"]>[number] | undefined;
          return (
            <div
              key={provider?.id ?? i}
              className={`flex items-start gap-3 rounded-sm p-4 transition-colors ${
                provider?.enabled ? "border border-ok-400/30 bg-ok-400/5" : provider ? "border border-dashed border-warn-500/40 bg-ink-950/60" : "border border-ink-600 bg-ink-900/60"
              }`}
            >
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${provider ? (provider.enabled ? "bg-ok-400" : "bg-warn-500") : "animate-pulse bg-mist-600"}`} />
              <div className="min-w-0">
                <p className="font-display text-[14.5px] text-paper-50">{provider?.label ?? "loading adapter…"}</p>
                <p className="mt-1 font-mono text-[11px] text-mist-600">
                  {provider?.id}
                  {provider && (
                    <span className={provider.enabled ? "text-ok-400" : "text-warn-400"}>{provider.enabled ? " · active" : " · not configured"}</span>
                  )}
                </p>
                <p className="mt-2 text-[12.5px] leading-relaxed text-mist-500">{provider?.purpose}</p>
                {!provider?.enabled && provider?.reason && (
                  <p className="mt-2 font-mono text-[11px] text-warn-400/80">{provider.reason}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-6 text-xs leading-relaxed text-mist-600">
        Each provider sits behind its own adapter, so one can be replaced or removed without
        rebuilding the engine. A disabled adapter is reported in the affected results rather than
        silently producing a weaker answer.
      </p>
    </Panel>
  );
}

/* -------------------------------- newsletter -------------------------------- */

export function NewsletterForm() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setState("sending");
    const res = await fetch("/api/engage", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "newsletter", email, interest: "general" }),
    });
    const json = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
    setMessage(json.message ?? json.error ?? "");
    setState(res.ok ? "done" : "error");
    if (res.ok) setEmail("");
  }

  return (
    <form onSubmit={submit} className="w-full">
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          aria-label="Email address"
          autoComplete="email"
          className="field flex-1 px-4 py-3 text-[13px]"
        />
        <button
          type="submit"
          disabled={state === "sending"}
          className="glow-accent group inline-flex items-center justify-center gap-2 rounded-sm bg-brand-cta px-5 py-3 text-[13px] font-semibold text-white transition-[transform,background-color] hover:-translate-y-0.5 hover:bg-brand-cta-hover disabled:opacity-60"
        >
          {state === "sending" ? "Signing up…" : "Get the launch note"}
          <IconArrow className="h-4 w-4 transition-transform group-hover:translate-x-1" />
        </button>
      </div>
      {message && (
        <p role="status" className={`mt-3 text-[12.5px] ${state === "done" ? "text-ok-400" : "text-risk-400"}`}>{message}</p>
      )}
      <p className="mt-3 text-[11.5px] leading-relaxed text-mist-600">
        One email per milestone. No tracking pixels, no resale, no ad network on this form.
      </p>
    </form>
  );
}

/* ------------------------------ business request ----------------------------- */

export function BusinessRequestForm() {
  const [form, setForm] = useState({ organization: "", email: "", plan: "growth", quota: "5000", notes: "" });
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setState("sending");
    const res = await fetch("/api/engage", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "business-interest", ...form, quota: Number(form.quota) }),
    });
    const json = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
    setMessage(json.message ?? json.error ?? "");
    setState(res.ok ? "done" : "error");
  }

  const field = "field px-3.5 py-2.5 text-[13px]";

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="rule-label text-mist-500">Organisation</span>
          <input required value={form.organization} onChange={(e) => setForm({ ...form, organization: e.target.value })} className={`mt-2 ${field}`} placeholder="Acme Marketplace Ltd" />
        </label>
        <label className="block">
          <span className="rule-label text-mist-500">Work email</span>
          <input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={`mt-2 ${field}`} placeholder="ops@acme.com" />
        </label>
        <label className="block">
          <span className="rule-label text-mist-500">Plan</span>
          <select value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })} className={`mt-2 ${field}`}>
            <option value="starter">Starter — 1,000 checks / month</option>
            <option value="growth">Growth — 10,000 checks / month</option>
            <option value="scale">Scale — 100,000 checks / month</option>
            <option value="embedded">Embedded API — custom</option>
          </select>
        </label>
        <label className="block">
          <span className="rule-label text-mist-500">Expected monthly volume</span>
          <input value={form.quota} onChange={(e) => setForm({ ...form, quota: e.target.value })} className={`mt-2 ${field}`} inputMode="numeric" />
        </label>
      </div>
      <label className="block">
        <span className="rule-label text-mist-500">What do you need verified?</span>
        <textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className={`mt-2 resize-y ${field}`} placeholder="Bulk catalogue checks, domain monitoring, an embedded verification widget…" />
      </label>
      <button
        type="submit"
        disabled={state === "sending"}
        className="glow-accent inline-flex w-full items-center justify-center gap-2 rounded-sm bg-brand-cta px-5 py-3 text-[13px] font-semibold text-white transition-[transform,background-color] hover:-translate-y-0.5 hover:bg-brand-cta-hover disabled:opacity-60 sm:w-auto"
      >
        {state === "sending" ? "Sending…" : "Request access"} <IconArrow className="h-4 w-4" />
      </button>
      {message && (
        <p role="status" className={`text-[12.5px] ${state === "done" ? "text-ok-400" : "text-risk-400"}`}>{message}</p>
      )}
      <p className="text-[11.5px] leading-relaxed text-mist-600">
        Business payments buy capacity and workflow features — never a more favourable verification
        result. That separation is contractual.
      </p>
    </form>
  );
}

/* --------------------------------- trust seal -------------------------------- */

export function TrustBadge({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-sm border border-ink-600 bg-ink-900/60 px-4 py-3">
      <IconSeal className="h-5 w-5 text-brand-400" />
      <div>
        <p className="font-mono text-[13px] text-paper-50">{value}</p>
        <p className="rule-label mt-0.5 text-mist-600">{label}</p>
      </div>
    </div>
  );
}

export function Chip({ children }: { children: React.ReactNode }) {
  return <TonalChip tone="neutral">{children}</TonalChip>;
}
