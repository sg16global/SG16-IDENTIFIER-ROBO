import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "@/components/link";
import type { VerificationCategory, VerificationReport } from "@/lib/types";
import { CATEGORY_LABEL, VERDICT_TONE } from "@/lib/types";
import { ReportView } from "@/components/report-view";
import { signalRobot } from "@/components/robo-manager";
import {
  CATEGORY_ICONS,
  IconAlert,
  IconArrow,
  IconFrame,
  Panel,
  SectionLabel,
  TonalChip,
} from "@/components/ui";

type Mode = VerificationCategory | "auto";

const EXAMPLES: Record<Mode, Array<{ label: string; value: string; file?: boolean }>> = {
  auto: [
    { label: "Paste a link you were sent", value: "Check this site before I order: https://apple-secure-verify-login.top/account/confirm?id=9921" },
    { label: "A viral claim", value: "A new law passed last week means every phone purchased before 2024 will stop working on all networks from January." },
    { label: "A model number", value: "Is SM-S928B/DS a real Galaxy S24 Ultra? Seller says 256GB, 6.8 inch, 5000mAh, $310 brand new sealed." },
  ],
  claim: [
    { label: "Health claim", value: "Doctors confirm that drinking boiled lemon water every morning cures type 2 diabetes within three weeks, but the pharmaceutical industry is suppressing the study." },
    { label: "Numeric claim", value: "The new tax rules mean 100% of freelancers earning over $12,000 must register by Friday or lose all income." },
    { label: "Attributed quote", value: "The CEO of the central bank said in an interview that cash will be illegal from next year." },
  ],
  website: [
    { label: "Suspicious shop", value: "https://dyson-outlet-clearance.top/shop/v15-detect-70-off" },
    { label: "Brand impersonation", value: "Message from DHL: your parcel is held at customs, pay a $2.99 clearance fee here http://dhl-customs-fee.cc/pay" },
    { label: "Bare IP link", value: "Login to your account now at http://192.168.4.17/verify/index.php before it is suspended" },
  ],
  product: [
    { label: "IMEI check", value: "IMEI 356938035643809 — iPhone 15 Pro Max, seller says brand new, 256GB, 6.7 inch, $520" },
    { label: "Barcode check", value: "EAN 4006381333931 on the box of a charger marked Anker A2147 30W, $6.50 each, bulk lot of 200" },
    { label: "Invalid barcode", value: "Box says model EP-T2510 25W, barcode 8806092013456, price $3.99, ships from overseas warehouse" },
    { label: "Spec mismatch", value: "Galaxy A55 5G SM-A556B, 6.1 inch display, 3000mAh battery, 45W charging, $180 new in box" },
  ],
  media: [
    { label: "Attach a screenshot", value: "This image was sent to me claiming to show an event last week. Is it genuine?", file: true },
    { label: "Check an AI render", value: "Someone posted this as a real photo of a shark on a motorway during the flood — check whether it is AI generated.", file: true },
    { label: "Out-of-context photo", value: "This photo from 2011 is being shared as if it was taken during yesterday's protest.", file: true },
  ],
};

const STAGES = [
  "Validating input and applying rate limits",
  "Classifying the submission",
  "Retrieving evidence from permitted providers",
  "Cross-checking against known records",
  "Scoring findings and calibrating confidence",
  "Writing the report and recording usage",
];

interface Attachment {
  name: string;
  type: string;
  bytes: number;
  base64: string;
}

const MAX_BYTES = 8 * 1024 * 1024;

export function VerifyConsole({
  initialCategory = "auto",
  compact = false,
}: {
  initialCategory?: Mode;
  compact?: boolean;
}) {
  const [mode, setMode] = useState<Mode>(initialCategory);
  const [value, setValue] = useState("");
  const [file, setFile] = useState<Attachment | null>(null);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<VerificationReport | null>(null);
  const [dragging, setDragging] = useState(false);
  const [recent, setRecent] = useState<Array<{ publicId: string; category: string; status: string; at: string }>>(() => {
    try {
      const stored = localStorage.getItem("sg16:recent");
      return stored ? JSON.parse(stored) : [];
    } catch {
      return []; // private mode
    }
  });
  const [engine, setEngine] = useState<"checking" | "online" | "degraded">("checking");
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const resultRef = useRef<HTMLDivElement | null>(null);

  // The status indicator reflects the real liveness probe rather than a fixed "online" label.
  useEffect(() => {
    let live = true;
    fetch("/api/health", { cache: "no-store" })
      .then(async (r) => {
        const json = (await r.json().catch(() => ({}))) as { database?: boolean };
        if (live) setEngine(r.ok && json.database ? "online" : "degraded");
      })
      .catch(() => {
        if (live) setEngine("degraded");
      });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (!busy) return;
    const timers = STAGES.map((_, i) => setTimeout(() => setStage(i), 500 + i * 750));
    return () => timers.forEach(clearTimeout);
  }, [busy]);

  const readFile = useCallback((f: File) => {
    setError(null);
    if (f.size > MAX_BYTES) {
      setError(`That file is ${(f.size / 1024 / 1024).toFixed(1)} MB. The limit is 8 MB.`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const base64 = result.split(",")[1] ?? "";
      setFile({ name: f.name, type: f.type || "application/octet-stream", bytes: f.size, base64 });
      if (mode === "auto") setMode("media");
    };
    reader.onerror = () => setError("The file could not be read. Try another one.");
    reader.readAsDataURL(f);
  }, [mode]);

  async function submit(nextMode: Mode = mode, nextValue: string = value, nextFile: Attachment | null = file) {
    if (!nextValue.trim() && !nextFile) {
      setError("Enter something to check, or attach an image.");
      inputRef.current?.focus();
      return;
    }
    setStage(0);
    setBusy(true);
    setError(null);
    setReport(null);
    signalRobot("scan", { category: nextMode });
    try {
      const res = await fetch("/api/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ input: nextValue, category: nextMode, file: nextFile }),
      });
      const json = (await res.json()) as { ok: boolean; error?: string; report?: VerificationReport };
      if (!res.ok || !json.ok || !json.report) {
        setError(json.error ?? `The engine responded with HTTP ${res.status}.`);
        signalRobot("error");
        return;
      }
      setReport(json.report);
      signalRobot(`result-${VERDICT_TONE[json.report.status]}`, { category: json.report.category, status: json.report.status });
      const entry = {
        publicId: json.report.publicId,
        category: json.report.category,
        status: json.report.status,
        at: json.report.checkedAt,
      };
      setRecent((prev) => {
        const next = [entry, ...prev.filter((p) => p.publicId !== entry.publicId)].slice(0, 6);
        try { localStorage.setItem("sg16:recent", JSON.stringify(next)); } catch { /* ignore */ }
        return next;
      });
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 120);
    } catch (err) {
      setError(`Network error: ${(err as Error).message}`);
      signalRobot("error");
    } finally {
      setBusy(false);
    }
  }

  const examples = EXAMPLES[mode] ?? EXAMPLES.auto;
  const modes: Array<{ key: Mode; label: string }> = [
    { key: "auto", label: "Auto-detect" },
    { key: "claim", label: "News & claims" },
    { key: "website", label: "Websites & scams" },
    { key: "product", label: "Products" },
    { key: "media", label: "Image & video" },
  ];

  return (
    <div className="space-y-5">
      <Panel hover={false} className={compact ? "p-4 sm:p-6" : "p-5 sm:p-8"}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <SectionLabel>Universal verification input</SectionLabel>
          <div className="flex items-center gap-2" role="status" aria-live="polite">
            <span className="relative flex h-2 w-2">
              {engine === "online" && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ok-400 opacity-50" />
              )}
              <span
                className={`relative inline-flex h-2 w-2 rounded-full ${
                  engine === "online" ? "bg-ok-400" : engine === "degraded" ? "bg-warn-500" : "bg-mist-600"
                }`}
              />
            </span>
            <span className={`rule-label ${engine === "degraded" ? "text-warn-400" : "text-mist-500"}`}>
              {engine === "online"
                ? "engine online"
                : engine === "degraded"
                  ? "database unreachable — checks cannot be saved"
                  : "checking engine…"}
            </span>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-1.5">
          {modes.map((m) => {
            const Icon = m.key === "auto" ? IconFrame : CATEGORY_ICONS[m.key as VerificationCategory];
            const active = mode === m.key;
            return (
              <button
                key={m.key}
                type="button"
                onClick={() => setMode(m.key)}
                aria-pressed={active}
                className={`group inline-flex items-center gap-2 rounded-sm border px-3 py-2 text-[12.5px] transition-all duration-300 ${
                  active
                    ? "border-brand-500 bg-brand-500/12 text-brand-400"
                    : "border-ink-600 bg-ink-900/60 text-mist-300 hover:border-brand-700 hover:text-paper-50"
                }`}
              >
                <Icon className="h-4 w-4" />
                {m.label}
              </button>
            );
          })}
        </div>

        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const dropped = e.dataTransfer.files?.[0];
            if (dropped) readFile(dropped);
          }}
          className={`mt-5 rounded-sm border transition-colors ${
            dragging
              ? "border-dashed border-brand-500 bg-brand-500/8"
              : "border-ink-600 bg-ink-850 hover:border-ink-500 focus-within:border-brand-500 focus-within:ring-3 focus-within:ring-brand-500/18"
          }`}
        >
          <textarea
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onFocus={() => signalRobot("focus")}
            onBlur={() => signalRobot("blur")}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") void submit();
            }}
            rows={compact ? 4 : 6}
            maxLength={20000}
            aria-label="Text, link, identifier or claim to verify"
            placeholder={
              mode === "product"
                ? "Paste a listing, or type a model number, IMEI or barcode — e.g. SM-S928B, 356938035643809, 4006381333931"
                : mode === "website"
                  ? "Paste the suspicious link, the full message, or the email text you received"
                  : mode === "claim"
                    ? "Paste the article text, post or claim you want checked — the more context, the better the result"
                    : mode === "media"
                      ? "Describe what the image is being shared as, then attach the actual file"
                      : "What would you like to identify? Paste text, a URL, a model number, or drop an image…"
            }
            className="w-full resize-y bg-transparent p-4 font-mono text-[13px] leading-relaxed text-mist-200 outline-none placeholder:text-mist-600 focus-visible:outline-none"
          />
          <div className="flex flex-wrap items-center gap-3 border-t border-ink-600 px-4 py-3">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-sm border border-ink-500 px-3 py-1.5 text-[12px] text-mist-300 transition-colors hover:border-brand-500/60 hover:text-brand-400"
            >
              <IconFrame className="h-4 w-4" /> Attach image
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/avif"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) readFile(f);
                e.target.value = "";
              }}
            />
            {file && (
              <span className="dash-accent inline-flex items-center gap-2 rounded-sm bg-brand-500/8 px-3 py-1.5 font-mono text-[11.5px] text-brand-400">
                {file.name.slice(0, 28)} · {(file.bytes / 1024).toFixed(0)} KB
                <button type="button" onClick={() => setFile(null)} className="text-mist-500 hover:text-risk-400" aria-label="Remove file">
                  ✕
                </button>
              </span>
            )}
            <span className="ml-auto font-mono text-[11px] text-mist-600">{value.length.toLocaleString()} / 20,000</span>
            <span className="hidden font-mono text-[11px] text-mist-600 sm:inline">⌘ + ↵</span>
            <button
              type="button"
              disabled={busy}
              onClick={() => void submit()}
              className="glow-accent group inline-flex items-center gap-2 rounded-sm bg-brand-cta px-5 py-2 text-[13px] font-semibold text-white transition-[transform,background-color] duration-300 hover:-translate-y-0.5 hover:bg-brand-cta-hover disabled:translate-y-0 disabled:opacity-60"
            >
              <span>{busy ? "Investigating…" : "Identify"}</span>
              <IconArrow className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="rule-label text-mist-600">Try</span>
          {examples.map((ex) => (
            <button
              key={ex.label}
              type="button"
              onClick={() => {
                setValue(ex.value);
                setError(null);
                if (ex.file && mode === "auto") setMode("media");
              }}
              className="rounded-sm border border-ink-600 px-2.5 py-1 text-[11.5px] text-mist-300 transition-colors hover:border-brand-500/60 hover:text-brand-400"
            >
              {ex.label}
            </button>
          ))}
        </div>

        {error && (
          <div role="alert" className="mt-4 flex items-start gap-3 rounded-sm border border-risk-500/40 bg-risk-500/8 p-4">
            <IconAlert className="mt-0.5 h-4 w-4 text-risk-400" />
            <p className="text-[13px] leading-relaxed text-risk-400">{error}</p>
          </div>
        )}

        {busy && (
          <div className="mt-5 overflow-hidden rounded-sm border border-brand-700/60 bg-ink-950/80" aria-live="polite">
            <div className="relative h-px w-full overflow-hidden bg-mist-500/15">
              <span className="absolute inset-y-0 left-0 w-1/3 animate-sweep bg-gradient-to-r from-transparent via-brand-500 to-transparent" />
            </div>
            <ol className="space-y-2 p-5">
              {STAGES.map((s, i) => (
                <li key={s} className="flex items-center gap-3 text-[13px]">
                  <span
                    className={`grid h-4 w-4 place-items-center rounded-full border font-mono text-[9px] transition-colors ${
                      i < stage ? "border-ok-400/60 bg-ok-400/15 text-ok-400"
                      : i === stage ? "border-brand-500/70 bg-brand-500/15 text-brand-400"
                      : "border-mist-500/25 text-mist-600"
                    }`}
                  >
                    {i < stage ? "✓" : i + 1}
                  </span>
                  <span className={i <= stage ? "text-mist-200" : "text-mist-600"}>{s}</span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </Panel>

      {recent.length > 0 && !report && (
        <Panel hover={false} className="p-5">
          <div className="flex items-center justify-between">
            <SectionLabel tone="mist">Your recent checks</SectionLabel>
            <span className="rule-label text-mist-600">stored locally only</span>
          </div>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {recent.map((r) => (
              <li key={r.publicId}>
                <Link
                  href={`/report/${r.publicId}`}
                  className="group flex items-center gap-3 rounded-sm border border-ink-600 bg-ink-900/60 px-3 py-2.5 transition-colors hover:border-brand-700 hover:bg-ink-700"
                >
                  <span className="font-mono text-[11px] text-brand-400">{r.publicId}</span>
                  <span className="rule-label text-mist-600">{r.category}</span>
                  <IconArrow className="ml-auto h-3.5 w-3.5 text-mist-600 transition-transform group-hover:translate-x-1" />
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <div ref={resultRef} className="scroll-mt-24">
        {report && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <TonalChip tone="neutral">report saved to postgres</TonalChip>
              <Link
                href={`/report/${report.publicId}`}
                className="inline-flex items-center gap-2 text-[13px] text-brand-400 underline decoration-brand-500/40 underline-offset-4 hover:decoration-brand-500"
              >
                Open the permanent report page for {report.publicId} <IconArrow className="h-4 w-4" />
              </Link>
            </div>
            <ReportView report={report} embedded />
          </div>
        )}
      </div>

      <p className="px-1 text-xs leading-relaxed text-mist-600">
        Mode: <span className="font-mono text-mist-400">{mode === "auto" ? "auto-detect" : CATEGORY_LABEL[mode as VerificationCategory]}</span>.
        Free checks are limited to 6 per minute per connection to protect the service and the budget.
        Uploaded files are analysed in memory, hashed, and never published.
      </p>
    </div>
  );
}
