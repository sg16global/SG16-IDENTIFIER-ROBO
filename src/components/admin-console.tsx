import { useCallback, useEffect, useState } from "react";
import { Link } from "@/components/link";
import {
  IconAlert,
  IconArrow,
  IconChart,
  IconCpu,
  IconDatabase,
  IconLock,
  IconSeal,
  Panel,
  SectionLabel,
  TonalChip,
} from "@/components/ui";

interface AdminData {
  ok: boolean;
  dbAvailable?: boolean;
  stats?: {
    totals?: { count: number; cost: number };
    byCategory: Array<{ category: string; count: number }>;
    byStatus: Array<{ status: string; count: number }>;
    usage: Array<{ provider: string; calls: number; cost: number; errors: number; avgLatency: number }>;
    feedback: Array<{ status: string; count: number }>;
    catalogCount: number;
    businesses: number;
    subscribers: number;
    flags: Array<{ key: string; enabled: boolean; detail: string | null; updatedAt: string }>;
  };
  feedback?: Array<{ id: string; publicId: string | null; kind: string; message: string | null; contact: string | null; status: string; createdAt: string }>;
  audit?: Array<{ id: string; actor: string; action: string; meta: unknown; createdAt: string }>;
  recentUsage?: Array<{ id: string; provider: string; operation: string; status: string; latencyMs: number | null; costUsd: number; tokensIn: number | null; tokensOut: number | null; error: string | null; createdAt: string }>;
  spend?: { total: number; calls: number; errors: number };
  budget?: { dailyUsd: number; spentUsd: number; blocked: number };
  retentionDays?: number;
  mustChangePassword?: boolean;
  hasCustomCode?: boolean;
  adminEmail?: string | null;
  error?: string;
}

const FLAG_LABELS: Record<string, { label: string; hint: string }> = {
  expensive_providers: { label: "Paid provider calls", hint: "Fact Check Tools, Web Risk, AI analysis and licensed search. Turning this off leaves only the free local engine." },
  outbound_fetch: { label: "Outbound URL fetching", hint: "Server-side fetching of user-submitted links through the SSRF guard. Off means no page-behaviour evidence." },
  dns_lookups: { label: "DNS & TLS intelligence", hint: "Resolver and TLS handshake queries against submitted hostnames." },
  public_intake: { label: "Public intake", hint: "Accept new verification requests at all. The emergency stop." },
};

type AdminLoad = { ok: true; data: AdminData } | { ok: false; message: string };

async function fetchAdmin(accessCode: string): Promise<AdminLoad> {
  try {
    // The code travels in a header, never the URL (URLs end up in server and CDN logs).
    const res = await fetch("/api/admin", { cache: "no-store", headers: { "x-sg16-admin": accessCode } });
    const json = (await res.json()) as AdminData;
    return res.ok && json.ok ? { ok: true, data: json } : { ok: false, message: json.error ?? `HTTP ${res.status}` };
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
}

export function AdminConsole() {
  const [code, setCode] = useState(() => sessionStorage.getItem("sg16:admin") ?? "");
  const [data, setData] = useState<AdminData | null>(null);
  const [state, setState] = useState<"locked" | "loading" | "ready" | "error">(() => (sessionStorage.getItem("sg16:admin") ? "loading" : "locked"));
  const [message, setMessage] = useState("");
  const [messageOk, setMessageOk] = useState(true);
  const [newCode, setNewCode] = useState("");
  const [confirmCode, setConfirmCode] = useState("");
  const [changeMsg, setChangeMsg] = useState("");

  const apply = useCallback((result: AdminLoad) => {
    if (result.ok) {
      setData(result.data);
      setState("ready");
      setMessage("");
    } else {
      setState("error");
      setMessage(result.message);
    }
  }, []);

  // Refreshes in place. Only unlocking shows the lock screen's "loading" state;
  // doing that here replaced the whole console on every action.
  const load = useCallback(async (accessCode: string) => apply(await fetchAdmin(accessCode)), [apply]);

  useEffect(() => {
    // A stored code starts the console in "loading" (see the state initialiser).
    const stored = sessionStorage.getItem("sg16:admin");
    if (stored) void fetchAdmin(stored).then(apply);
  }, [apply]);

  async function unlock(event: React.FormEvent) {
    event.preventDefault();
    sessionStorage.setItem("sg16:admin", code);
    setState("loading");
    await load(code);
  }

  async function act(action: string, extra: Record<string, unknown> = {}) {
    if (!code) return;
    const res = await fetch("/api/admin", {
      method: "POST",
      headers: { "content-type": "application/json", "x-sg16-admin": code },
      body: JSON.stringify({ action, ...extra }),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; inserted?: number; removed?: number; error?: string };
    // Reload first: load() clears the message on success, which used to wipe this result.
    await load(code);
    setMessageOk(Boolean(json.ok));
    setMessage(
      json.ok
        ? action === "seed-catalog"
          ? `Catalogue seeded: ${json.inserted ?? 0} records inserted.`
          : action === "purge-expired"
            ? `Retention purge complete: ${json.removed ?? 0} reports deleted.`
            : `${action} applied.`
        : json.error ?? "Action failed.",
    );
  }

  async function changeCode(event: React.FormEvent) {
    event.preventDefault();
    if (newCode !== confirmCode) {
      setChangeMsg("The two entries do not match.");
      return;
    }
    const res = await fetch("/api/admin", {
      method: "POST",
      headers: { "content-type": "application/json", "x-sg16-admin": code },
      body: JSON.stringify({ action: "set-access-code", newCode }),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    setChangeMsg(json.ok ? "Permanent code saved. This console now requires it." : json.error ?? "Could not save the new code.");
    if (json.ok) {
      setNewCode("");
      setConfirmCode("");
      await load(code);
    }
  }

  if (state === "locked" || state === "error" || state === "loading") {
    return (
      <div className="mx-auto grid min-h-[60vh] max-w-lg place-items-center">
        <Panel hover={false} className="w-full p-8">
          <IconLock className="h-8 w-8 text-brand-400" />
          <h2 className="mt-5 font-display text-2xl font-semibold text-paper-50">Operator console</h2>
          <p className="mt-3 text-[13.5px] leading-relaxed text-mist-500">
            Service health, provider cost, the abuse queue and the emergency switches. Access requires
            the administrator code, which is read from{" "}
            <code className="font-mono text-mist-300">ADMIN_ACCESS_CODE</code> on the server.
          </p>
          <form onSubmit={unlock} className="mt-6 space-y-3">
            <input
              type="password"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Administrator access code"
              aria-label="Administrator access code"
              autoComplete="current-password"
              className="field px-4 py-3 text-[13px]"
            />
            <button
              type="submit"
              disabled={!code || state === "loading"}
              className="glow-accent inline-flex w-full items-center justify-center gap-2 rounded-sm bg-brand-cta px-5 py-3 text-[13.5px] font-semibold text-white transition-[transform,background-color] hover:-translate-y-0.5 hover:bg-brand-cta-hover disabled:opacity-50"
            >
              {state === "loading" ? "Authenticating…" : "Unlock console"} <IconArrow className="h-4 w-4" />
            </button>
          </form>
          {state === "error" && message && (
            <p className="mt-4 flex items-start gap-2 rounded-sm border border-risk-500/35 bg-risk-500/8 p-3 text-[12.5px] text-risk-400">
              <IconAlert className="mt-0.5 h-4 w-4 shrink-0" /> {message}
            </p>
          )}
          <p className="mt-5 text-[11.5px] leading-relaxed text-mist-600">
            There is no default code: until <code className="font-mono">ADMIN_ACCESS_CODE</code> is set
            on the server, the console stays closed to everyone. The first login with that temporary
            code requires setting a permanent one. Require MFA on the operator account.
          </p>
        </Panel>
      </div>
    );
  }

  if (!data?.stats) return null;
  const { stats, budget, spend } = data;
  const spent = budget?.spentUsd ?? 0;
  const daily = budget?.dailyUsd ?? 12;
  const budgetPct = Math.min(100, Math.round((spent / daily) * 100));

  return (
    <div className="space-y-6">
      {message && (
        <div
          role="status"
          className={`rounded-sm border p-3.5 text-[13px] ${
            messageOk ? "border-ok-400/35 bg-ok-400/8 text-ok-400" : "border-risk-500/40 bg-risk-500/8 text-risk-400"
          }`}
        >
          {message}
        </div>
      )}

      {data.dbAvailable === false && (
        <div className="flex items-start gap-2 rounded-sm border border-warn-500/40 bg-warn-500/8 p-3 text-[12.5px] text-warn-400" role="status">
          <IconAlert className="mt-0.5 h-4 w-4 shrink-0" />
          Database unavailable (no working DATABASE_URL) — console is in degraded mode. Unlock, permanent-code
          rotation and the budget still work (stored in the Guard object); report history, the corrections queue
          and the switches need Postgres.
        </div>
      )}

      {data.mustChangePassword && (
        <Panel hover={false} className="border-warn-500/40 p-6">
          <SectionLabel>Action required — replace the temporary access code</SectionLabel>
          <p className="mt-3 text-[13px] leading-relaxed text-mist-500">
            You unlocked the console with the temporary code from the server configuration. Set a
            permanent code now; it is stored only as a SHA-256 hash, and the temporary code keeps
            working as recovery but will keep asking for this until replaced.
            {data.adminEmail && <> Operator contact on file: <span className="font-mono text-mist-300">{data.adminEmail}</span>.</>}
          </p>
          <form onSubmit={changeCode} className="mt-4 grid gap-3 sm:grid-cols-2">
            <input
              type="password"
              value={newCode}
              onChange={(e) => setNewCode(e.target.value)}
              placeholder="New permanent code (min. 12 characters)"
              aria-label="New permanent access code"
              autoComplete="new-password"
              className="field px-4 py-3 text-[13px]"
            />
            <input
              type="password"
              value={confirmCode}
              onChange={(e) => setConfirmCode(e.target.value)}
              placeholder="Repeat the new code"
              aria-label="Repeat the new access code"
              autoComplete="new-password"
              className="field px-4 py-3 text-[13px]"
            />
            <button
              type="submit"
              disabled={newCode.length < 12 || newCode !== confirmCode}
              className="glow-accent inline-flex items-center justify-center gap-2 rounded-sm bg-brand-cta px-5 py-3 text-[13.5px] font-semibold text-white transition-[transform,background-color] hover:-translate-y-0.5 hover:bg-brand-cta-hover disabled:opacity-50 sm:col-span-2"
            >
              Save permanent code <IconArrow className="h-4 w-4" />
            </button>
          </form>
          {changeMsg && <p className="mt-3 text-[12.5px] text-mist-400">{changeMsg}</p>}
        </Panel>
      )}

      {/* headline metrics */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { icon: IconSeal, label: "Reports stored", value: String(stats.totals?.count ?? 0), sub: `${data.retentionDays ?? 30}-day retention` },
          { icon: IconChart, label: "Metered spend (all time)", value: `$${(spend?.total ?? 0).toFixed(4)}`, sub: `${spend?.calls ?? 0} provider calls` },
          { icon: IconDatabase, label: "Catalogue records", value: String(stats.catalogCount), sub: `${stats.businesses} business request(s)` },
          { icon: IconAlert, label: "Open corrections", value: String(stats.feedback.filter((f) => f.status === "new").reduce((s, f) => s + f.count, 0)), sub: `${stats.subscribers} newsletter subscriber(s)` },
        ].map((card) => (
          <Panel key={card.label} hover={false} className="p-5">
            <card.icon className="h-5 w-5 text-brand-400" />
            <p className="mt-4 font-display text-[28px] font-semibold leading-none text-paper-50">{card.value}</p>
            <p className="mt-2 rule-label text-mist-500">{card.label}</p>
            <p className="mt-1 font-mono text-[11px] text-mist-600">{card.sub}</p>
          </Panel>
        ))}
      </div>

      {/* budget + flags */}
      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <Panel hover={false} className="p-6">
          <SectionLabel>Daily variable-cost budget</SectionLabel>
          <p className="mt-4 font-mono text-[32px] leading-none text-paper-50">
            ${spent.toFixed(4)} <span className="text-[16px] text-mist-600">/ ${daily.toFixed(2)}</span>
          </p>
          <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-ink-700">
            <div
              className={`h-full transition-[width] duration-700 ${budgetPct > 80 ? "bg-risk-500" : budgetPct > 50 ? "bg-warn-500" : "bg-ok-400"}`}
              style={{ width: `${Math.max(budgetPct, 2)}%` }}
            />
          </div>
          <p className="mt-3 text-[12.5px] leading-relaxed text-mist-500">
            {budgetPct}% of today&rsquo;s ceiling consumed. {budget?.blocked ?? 0} request(s) blocked by the
            budget gate. When the ceiling is reached the API returns 429 and only free local checks
            resume at 00:00 UTC.
          </p>
          <div className="mt-5 grid grid-cols-2 gap-3 border-t border-mist-500/12 pt-5">
            <div>
              <p className="rule-label text-mist-600">Provider errors</p>
              <p className={`mt-1 font-mono text-lg ${(spend?.errors ?? 0) > 0 ? "text-risk-400" : "text-paper-50"}`}>{spend?.errors ?? 0}</p>
            </div>
            <div>
              <p className="rule-label text-mist-600">Categories seen</p>
              <p className="mt-1 font-mono text-lg text-paper-50">{stats.byCategory.length}</p>
            </div>
          </div>
        </Panel>

        <Panel hover={false} className="p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <SectionLabel>Emergency switches</SectionLabel>
            <span className="rule-label text-mist-600">service_flags</span>
          </div>
          <div className="mt-5 space-y-2.5">
            {Object.entries(FLAG_LABELS).map(([key, meta]) => {
              const flag = stats.flags.find((f) => f.key === key);
              const enabled = flag?.enabled ?? true;
              return (
                <div key={key} className={`flex items-start gap-4 rounded-sm border p-4 transition-colors ${enabled ? "border-mist-500/15 bg-ink-900/40" : "border-risk-500/35 bg-risk-500/6"}`}>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={enabled}
                    aria-label={meta.label}
                    onClick={() => void act("set-flag", { key, enabled: !enabled })}
                    className={`relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors ${enabled ? "bg-ok-400" : "bg-ink-500"}`}
                  >
                    <span className={`absolute top-0.5 h-4 w-4 rounded-full transition-transform ${enabled ? "translate-x-4 bg-ink-950" : "translate-x-0.5 bg-mist-300"}`} />
                  </button>
                  <div className="min-w-0">
                    <p className="font-display text-[14.5px] text-paper-50">{meta.label}</p>
                    <p className="mt-1 text-[12.5px] leading-relaxed text-mist-500">{meta.hint}</p>
                    <p className="mt-1.5 font-mono text-[10.5px] text-mist-600">{key} · {enabled ? "enabled" : "disabled"}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>
      </div>

      {/* distribution */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel hover={false} className="p-6">
          <SectionLabel tone="mist">Reports by category</SectionLabel>
          <div className="mt-5 space-y-3">
            {(stats.byCategory.length ? stats.byCategory : [{ category: "—", count: 0 }]).map((row) => {
              const max = Math.max(1, ...stats.byCategory.map((r) => r.count));
              return (
                <div key={row.category}>
                  <div className="flex items-baseline justify-between">
                    <span className="font-mono text-[12.5px] text-mist-300">{row.category}</span>
                    <span className="font-mono text-[12.5px] text-mist-500">{row.count}</span>
                  </div>
                  <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-ink-700">
                    <div className="h-full bg-brand-500 transition-[width] duration-700" style={{ width: `${(row.count / max) * 100}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>

        <Panel hover={false} className="p-6">
          <SectionLabel tone="mist">Verdict distribution</SectionLabel>
          <div className="mt-5 flex flex-wrap gap-2">
            {(stats.byStatus.length ? stats.byStatus : [{ status: "—", count: 0 }]).map((row) => (
              <div key={row.status} className="rounded-sm border border-mist-500/15 bg-ink-900/40 px-3 py-2">
                <p className="font-mono text-[12px] text-paper-50">{row.status}</p>
                <p className="mt-0.5 font-mono text-[11px] text-mist-600">{row.count}</p>
              </div>
            ))}
          </div>
          <p className="mt-5 text-[12.5px] leading-relaxed text-mist-600">
            A healthy distribution contains a meaningful share of{" "}
            <span className="font-mono text-mist-400">unable_to_verify</span>. An engine that almost
            never abstains is guessing, not verifying.
          </p>
        </Panel>
      </div>

      {/* provider usage */}
      <Panel hover={false} className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-mist-500/15 px-6 py-4">
          <SectionLabel tone="mist">Provider usage &amp; cost</SectionLabel>
          <span className="rule-label text-mist-600">provider_usage</span>
        </div>
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full min-w-[620px] text-left">
            <thead className="border-b border-mist-500/15 bg-ink-900/60">
              <tr className="rule-label text-mist-600">
                <th className="px-6 py-3 font-normal">Provider</th>
                <th className="px-4 py-3 text-right font-normal">Calls</th>
                <th className="px-4 py-3 text-right font-normal">Errors</th>
                <th className="px-4 py-3 text-right font-normal">Avg latency</th>
                <th className="px-6 py-3 text-right font-normal">Cost</th>
              </tr>
            </thead>
            <tbody className="font-mono text-[12.5px]">
              {(stats.usage.length ? stats.usage : []).map((u) => (
                <tr key={u.provider} className="border-b border-mist-500/8 last:border-0">
                  <td className="px-6 py-3 text-mist-300">{u.provider}</td>
                  <td className="px-4 py-3 text-right text-mist-400">{u.calls}</td>
                  <td className="px-4 py-3 text-right text-risk-400">{u.errors}</td>
                  <td className="px-4 py-3 text-right text-mist-400">{Math.round(u.avgLatency)} ms</td>
                  <td className="px-6 py-3 text-right text-brand-400">${u.cost.toFixed(5)}</td>
                </tr>
              ))}
              {!stats.usage.length && (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-mist-600">
                    No provider calls recorded yet. Run a check from the console to populate this table.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* corrections queue */}
      <Panel hover={false} className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-mist-500/15 px-6 py-4">
          <SectionLabel>Corrections &amp; abuse queue</SectionLabel>
          <span className="rule-label text-mist-600">{data.feedback?.length ?? 0} item(s)</span>
        </div>
        <div className="divide-y divide-mist-500/10">
          {(data.feedback ?? []).map((item) => (
            <div key={item.id} className="flex flex-wrap items-start gap-4 px-6 py-4">
              <TonalChip tone={item.status === "new" ? "warn" : "ok"}>{item.status}</TonalChip>
              <div className="min-w-0 flex-1">
                <p className="font-mono text-[11.5px] text-brand-400">{item.publicId ?? "no report"} · {item.kind}</p>
                <p className="mt-1.5 text-[13px] leading-relaxed text-mist-300">{item.message}</p>
                <p className="mt-1.5 font-mono text-[11px] text-mist-600">
                  {new Date(item.createdAt).toISOString().slice(0, 19).replace("T", " ")} UTC
                  {item.contact ? ` · contact ${item.contact}` : ""}
                </p>
              </div>
              {item.status === "new" && (
                <button
                  type="button"
                  onClick={() => void act("resolve-feedback", { id: item.id, status: "reviewed" })}
                  className="rounded-sm border border-mist-500/25 px-3 py-1.5 text-[12px] text-mist-300 transition-colors hover:border-brand-500/50 hover:text-brand-400"
                >
                  Mark reviewed
                </button>
              )}
              {item.publicId && (
                <Link href={`/report/${item.publicId}`} className="rounded-sm border border-mist-500/25 px-3 py-1.5 text-[12px] text-mist-300 transition-colors hover:border-brand-500/50 hover:text-brand-400">
                  Open report
                </Link>
              )}
            </div>
          ))}
          {!data.feedback?.length && (
            <p className="px-6 py-8 text-center text-[13px] text-mist-600">
              No corrections submitted. When a user flags a report it appears here and the report is
              marked <span className="font-mono">flagged = true</span>.
            </p>
          )}
        </div>
      </Panel>

      {/* recent provider calls + audit */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel hover={false} className="overflow-hidden">
          <div className="border-b border-mist-500/15 px-6 py-4">
            <SectionLabel tone="mist">Recent provider calls</SectionLabel>
          </div>
          <div className="max-h-80 overflow-y-auto scrollbar-thin">
            {(data.recentUsage ?? []).map((u) => (
              <div key={u.id} className="flex items-baseline gap-3 border-b border-mist-500/8 px-6 py-2.5 last:border-0">
                <span className={`font-mono text-[11px] ${u.status === "ok" ? "text-ok-400" : u.status === "error" ? "text-risk-400" : "text-mist-500"}`}>
                  {u.status}
                </span>
                <span className="font-mono text-[11.5px] text-mist-400">{u.provider}</span>
                <span className="truncate font-mono text-[11px] text-mist-600">{u.operation}</span>
                <span className="ml-auto shrink-0 font-mono text-[11px] text-mist-600">
                  {u.latencyMs ?? 0}ms · ${(u.costUsd ?? 0).toFixed(5)}
                </span>
              </div>
            ))}
            {!data.recentUsage?.length && <p className="px-6 py-6 text-[12.5px] text-mist-600">No calls recorded yet.</p>}
          </div>
        </Panel>

        <Panel hover={false} className="overflow-hidden">
          <div className="border-b border-mist-500/15 px-6 py-4">
            <SectionLabel tone="mist">Audit log</SectionLabel>
          </div>
          <div className="max-h-80 overflow-y-auto scrollbar-thin">
            {(data.audit ?? []).map((a) => (
              <div key={a.id} className="flex items-baseline gap-3 border-b border-mist-500/8 px-6 py-2.5 last:border-0">
                <span className="font-mono text-[11px] text-brand-400">{a.actor}</span>
                <span className="font-mono text-[11.5px] text-mist-300">{a.action}</span>
                <span className="ml-auto shrink-0 font-mono text-[10.5px] text-mist-600">
                  {new Date(a.createdAt).toISOString().slice(5, 19).replace("T", " ")}
                </span>
              </div>
            ))}
            {!data.audit?.length && <p className="px-6 py-6 text-[12.5px] text-mist-600">No administrative actions recorded yet.</p>}
          </div>
        </Panel>
      </div>

      {/* maintenance */}
      <Panel hover={false} className="p-6">
        <SectionLabel tone="mist">Maintenance</SectionLabel>
        <div className="mt-5 flex flex-wrap gap-3">
          <button type="button" onClick={() => void act("seed-catalog")} className="inline-flex items-center gap-2 rounded-sm border border-ink-500 bg-ink-900 px-4 py-2.5 text-[13px] text-paper-50 transition-colors hover:border-brand-500/60 hover:text-brand-400">
            <IconDatabase className="h-4 w-4" /> Seed product catalogue
          </button>
          <button type="button" onClick={() => void act("purge-expired")} className="inline-flex items-center gap-2 rounded-sm border border-warn-500/40 bg-warn-500/8 px-4 py-2.5 text-[13px] text-warn-400 transition-colors hover:bg-warn-500/15">
            <IconCpu className="h-4 w-4" /> Purge expired reports
          </button>
          <button type="button" onClick={() => void load(code)} className="inline-flex items-center gap-2 rounded-sm border border-mist-500/25 px-4 py-2.5 text-[13px] text-mist-300 transition-colors hover:border-mist-400/50">
            Refresh
          </button>
          <button
            type="button"
            onClick={() => { sessionStorage.removeItem("sg16:admin"); setCode(""); setData(null); setState("locked"); }}
            className="inline-flex items-center gap-2 rounded-sm border border-risk-500/35 px-4 py-2.5 text-[13px] text-risk-400 transition-colors hover:bg-risk-500/10"
          >
            <IconLock className="h-4 w-4" /> Lock console
          </button>
        </div>
        <p className="mt-5 text-[12px] leading-relaxed text-mist-600">
          Seeding inserts the normalised starter catalogue only if the table is empty. The purge deletes
          reports past their <span className="font-mono">retention_expires_at</span> timestamp; evidence
          and findings rows cascade with them. Both actions are written to the audit log.
        </p>
      </Panel>
    </div>
  );
}
