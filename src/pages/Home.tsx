import { useEffect, useState, type ReactNode } from "react";
import { Link } from "@/components/link";
import type { EngineStats } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";
import { VerifyConsole } from "@/components/verify-console";
import { RoboManager } from "@/components/robo-manager";
import { PioneersSection } from "@/components/pioneers-section";
import { GlobalPresence } from "@/components/global-presence";
import { LaunchChecklist, Marquee, NewsletterForm, ProviderStatus } from "@/components/interactive";
import {
  ConfidenceMeter,
  CountUp,
  DataLine,
  IconAlert,
  IconArrow,
  IconBarcode,
  IconChart,
  IconCpu,
  IconDatabase,
  IconFrame,
  IconLink,
  IconLock,
  IconNews,
  IconScale,
  IconSeal,
  Panel,
  Reveal,
  SectionLabel,
  TonalChip,
} from "@/components/ui";

const CATEGORY_ICON_MAP = {
  claim: IconNews,
  website: IconLink,
  product: IconBarcode,
  media: IconFrame,
} as const;

const SERVICES = [
  {
    id: "product",
    n: "01",
    title: "Product Identifier",
    strap: "Phones, laptops, electronics, accessories and other goods.",
    href: "/tools/products",
    icon: IconBarcode,
    bullets: [
      "Validate IMEI with the Luhn algorithm and GTIN barcodes with the GS1 modulo-10 check digit.",
      "Match model codes against normalised manufacturer records and specification ranges.",
      "Flag specification contradictions — a capacity the manufacturer never shipped.",
      "Publish the physical checks that actually decide authenticity, and say plainly that a database cannot.",
    ],
  },
  {
    id: "claim",
    n: "02",
    title: "News & Claim Identifier",
    strap: "Pasted text, URLs, screenshots and specific claims.",
    href: "/tools/news",
    icon: IconNews,
    bullets: [
      "Decompose a post into atomic, checkable claims instead of judging the whole thing at once.",
      "Retrieve published ClaimReviews through the Google Fact Check Tools API.",
      "Rate every retrieved source: official, reputable, mixed or unrated.",
      "Distinguish supported, contradicted, misleading, disputed and simply unresolved.",
    ],
  },
  {
    id: "website",
    n: "03",
    title: "Website & Scam Identifier",
    strap: "Links, shops, emails, offers and impersonation attempts.",
    href: "/tools/websites",
    icon: IconLink,
    bullets: [
      "Resolve DNS, read SOA/NS/MX, and check whether SPF and DMARC are published.",
      "Inspect the TLS certificate actually presented — issuer, age and how many hostnames it covers.",
      "Fetch the page only through an SSRF guard, then look for credential forms and irreversible-payment language.",
      "Detect brand impersonation, homoglyph substitution and punycode look-alikes.",
    ],
  },
  {
    id: "media",
    n: "04",
    title: "Image & Video Identifier",
    strap: "Manipulated photos, AI-generated content and reused media.",
    href: "/tools/media",
    icon: IconFrame,
    bullets: [
      "Parse the container: JPEG marker path, PNG chunk list, WebP RIFF structure.",
      "Read EXIF capture device, software tag, timestamps, GPS and embedded thumbnails.",
      "Detect C2PA / Content Credentials manifests and generative-tool signatures in XMP and PNG text.",
      "State the limits out loud: metadata cannot prove a depicted event happened.",
    ],
  },
  {
    id: "business",
    n: "05",
    title: "SG16 Business Verification",
    strap: "Bulk checks, monitoring and an API for organisations.",
    href: "/business",
    icon: IconCpu,
    bullets: [
      "Batch product and domain checks against a private team dashboard.",
      "Metered API keys with usage limits, exports and audit trails.",
      "Catalogue monitoring and domain-risk alerts on a schedule.",
      "Paid capacity and workflow — never a paid-for conclusion.",
    ],
  },
];

const TAXONOMY = [
  {
    status: "Verified against available sources",
    tone: "ok" as const,
    code: "verified / supported",
    body: "The supplied details match identified official records, or the retrieved evidence supports the claim as stated. The report names exactly what was checked and what was not.",
  },
  {
    status: "Suspicious — further checking needed",
    tone: "warn" as const,
    code: "suspicious / disputed / misleading",
    body: "Conflicting specifications, questionable seller details, deception patterns or credible disagreement between sources. Enough to stop and check; not enough to accuse.",
  },
  {
    status: "High risk — do not interact",
    tone: "risk" as const,
    code: "high_risk / contradicted",
    body: "A definitive failure was detected: an invalid checksum, a threat-list classification, or fact-checkers who directly contradicted the claim as stated.",
  },
  {
    status: "Unable to verify",
    tone: "unknown" as const,
    code: "unable_to_verify",
    body: "Insufficient reliable evidence to reach a conclusion, and the engine says so with a null confidence rather than guessing. This does not mean the item or claim is fake.",
  },
];

const PIPELINE = [
  { n: "01", label: "Receive & validate", detail: "Category, text, URL and file type are validated. A unique request ID is assigned and the rate limit consumed.", ms: "~2 ms" },
  { n: "02", label: "Apply security controls", detail: "Size caps, magic-byte sniffing, SSRF screening, private-range rejection and budget checks run before any outbound call.", ms: "~5 ms" },
  { n: "03", label: "Select the workflow", detail: "The classifier scores all four modules and routes the input, always leaving the choice visible and overridable.", ms: "~1 ms" },
  { n: "04", label: "Retrieve evidence", detail: "Permitted adapters are queried. Source URLs, retrieval timestamps and excerpts are preserved verbatim.", ms: "0.5–8 s" },
  { n: "05", label: "Analyse & cross-check", detail: "Rules compare the submission against retrieved evidence, looking for contradictions and missing information.", ms: "~40 ms" },
  { n: "06", label: "Generate the report", detail: "A structured, schema-validated response with conclusion, findings, evidence, caveats and next steps.", ms: "~15 ms" },
  { n: "07", label: "Store & meter", detail: "Report, evidence and findings are persisted; provider usage and cost are recorded against the request ID.", ms: "~10 ms" },
];

const TABLES = [
  ["verification_reports", "Category, status, confidence, summary, workflow trace, cost and retention metadata."],
  ["evidence_sources", "Source URLs, provider, publisher, stance, trust tier, publication and retrieval timestamps."],
  ["report_findings", "Individual findings with severity, weight and links to the evidence that produced them."],
  ["product_catalog", "Brand, model, normalised identifiers, specification ranges, counterfeit signals, provenance."],
  ["provider_usage", "Every adapter call: operation, status, latency, tokens and estimated cost in USD."],
  ["feedback", "User corrections and disputed findings with a review status."],
  ["affiliate_events", "Disclosed referral click records with destination and attribution."],
  ["business_accounts", "Organisation settings, plan, quota, API key prefix and entitlements."],
  ["service_flags", "The emergency switches that disable expensive or outbound operations instantly."],
  ["audit_events", "Administrative and security-sensitive actions, immutable append log."],
  ["newsletter_subscribers", "Opt-in addresses for milestone notices. Nothing else."],
];

const SECURITY = [
  { icon: IconLock, title: "Secrets never reach the browser", body: "All provider credentials live in server-side environment variables. The client bundle contains no keys, and no paid API is ever callable from a browser." },
  { icon: IconLink, title: "SSRF defence on every fetch", body: "Only http/https. Credentials in URLs rejected. Loopback, RFC1918, CGNAT, link-local and cloud-metadata ranges blocked. DNS re-resolved and every redirect hop re-validated." },
  { icon: IconFrame, title: "Uploads judged by magic bytes", body: "The client-declared MIME type is never trusted. JPEG, PNG, WebP, GIF, HEIF/AVIF and PDF signatures are verified, sizes capped at 8 MB and stored names made opaque." },
  { icon: IconAlert, title: "Prompt-injection containment", body: "Webpages, listings and documents are wrapped as untrusted data. Instructions inside them are ignored, and the model may not call tools based on retrieved content." },
  { icon: IconChart, title: "Budget and quota enforcement", body: "Per-fingerprint rate limits, a hard daily variable-cost budget, per-provider quotas and an emergency switch that disables expensive operations in one write." },
  { icon: IconScale, title: "Minimum retention by default", body: "Submissions are kept for a configured window then deleted. Only a fingerprinted hash of the connection is stored — never a raw IP address." },
];

const COST_ROWS = [
  ["Hosting & application compute", "$0 – $30", "Usage-based app host, edge cache included."],
  ["Database & file storage", "$0 – $30", "Managed PostgreSQL free allowance, then usage."],
  ["AI analysis", "$10 – $100", "Routine extraction on a low-cost model, escalation only when justified."],
  ["Search & specialist APIs", "$0 – $100", "Fact-check tools free tier, commercial URL risk and licensed search."],
  ["Monitoring, email & misc", "$0 – $30", "Error tracking, transactional mail, alerting."],
];

const REVENUE = [
  { title: "Display advertising", where: "Educational articles and public information pages", how: "An approved advertising provider, subject to its content policies. Added only once original content, a privacy policy and clear navigation exist.", rule: "No ad may ever resemble a verification result or a warning banner." },
  { title: "Affiliate partnerships", where: "Product comparison pages and buying guides", how: "A commission when an eligible referral results in a purchase. Every click is logged in affiliate_events and disclosed at the point of the link.", rule: "A seller never influences a verdict, a confidence figure or a ranking." },
  { title: "Business services", where: "Retailers, marketplaces, importers, repair shops", how: "Batch checks, private dashboards, monitoring, exports, higher limits and support — provisioned manually against a contract.", rule: "Payments buy capacity and workflow, never more favourable conclusions." },
  { title: "SG16 Identifier API", where: "Other sites, developers and platforms", how: "API keys with usage-based billing and contractual limits. Started only once per-request cost is measurable and provider licences permit redistribution.", rule: "No provider is resold unless its terms allow it." },
];

const ROADMAP = [
  { phase: "Phase 0", window: "Week 1", title: "Planning & validation", items: ["Confirm initial service scope", "UI system and page map", "Repository, environment, provider shortlist", "Evidence schema, privacy and spend limits"], exit: "Approved specification and a tested technical plan." },
  { phase: "Phase 1", window: "Weeks 2–4", title: "Working MVP", items: ["Homepage, universal input, report UI", "Backend, PostgreSQL schema, validation", "Fact-check retrieval and safe URL reputation", "Report IDs, citations, usage logging, admin view"], exit: "Real end-to-end checks against live provider data." },
  { phase: "Phase 2", window: "Weeks 5–6", title: "Private testing", items: ["True, false, misleading and unresolved fixtures", "Known safe and unsafe URLs", "Latency, false positives, per-check cost", "Mobile, accessibility, deletion flows"], exit: "Predefined quality and safety thresholds met." },
  { phase: "Phase 3", window: "Weeks 7–8", title: "Public launch", items: ["Connect sg16identifier.com, enforce HTTPS", "Publish privacy, terms, limitations, corrections", "Monitoring, backups, support contact", "Release with transparent quotas"], exit: "Health checks pass, costs bounded, users can report problems." },
  { phase: "Phase 4", window: "After launch", title: "Expansion & revenue", items: ["Product catalogues and manufacturer integrations", "Media provenance and image analysis", "Original editorial content, advertising eligibility", "Business accounts and a metered API"], exit: "Each expansion has measurable value and sustainable unit economics." },
];

const METRICS = [
  ["Evidence quality", "Share of claims supported by relevant, correctly attributed sources"],
  ["Accuracy", "Performance against a reviewed evaluation dataset, reported per category"],
  ["Uncertainty handling", "Whether the engine abstains when evidence is genuinely insufficient"],
  ["Latency", "Median and 95th-percentile time to a finished report"],
  ["Reliability", "Successful checks, provider errors and failed background jobs"],
  ["Cost efficiency", "Average variable cost per completed verification"],
  ["User trust", "Usefulness ratings, corrections submitted and how many were upheld"],
  ["Security", "Abuse attempts blocked, vulnerabilities found and incidents"],
  ["Revenue", "Advertising, eligible affiliate commission and business revenue"],
  ["Sustainability", "Gross margin and contribution after variable cost per check"],
];

const RISKS = [
  ["AI gives a false conclusion", "Evidence retrieval before reasoning, calibrated confidence, abstention by default, correction workflow."],
  ["A provider changes price or access", "One adapter per provider, fallback sources, usage monitoring, kill switch."],
  ["Traffic grows faster than revenue", "Per-request budgets, caching where licences allow, gradual feature rollout."],
  ["A fake product appears authentic", "Never treat a model number, IMEI or barcode alone as proof; always publish the physical checks."],
  ["A malicious URL targets the backend", "SSRF screening, private-range rejection, redirect re-validation, isolated fetching."],
  ["A user uploads sensitive material", "Private in-memory analysis, hashing, short retention, explicit deletion controls."],
  ["Advertising damages trust", "Ads visually separated from findings; paid placement prohibited near results."],
  ["Legal or reputational complaints", "Neutral wording, evidence-first reports, review and appeal process, no accusations."],
];

const FAQ = [
  { q: "Is SG16 Identifier free?", a: "Yes for the public. Core verification of products, news, websites and media does not require a subscription or an account. The platform is funded by disclosed advertising, affiliate referrals and paid business services — none of which can influence a result." },
  { q: "Can you prove an item is genuine?", a: "No, and any service that claims otherwise is overstating. SG16 can prove that an identifier is mathematically valid, that a model code belongs to a documented product, and that a specification was contradicted. Physical authenticity still requires inspection, weight measurement, manufacturer diagnostics or an authorised service centre." },
  { q: "What does 'Unable to verify' mean?", a: "It means the evidence available was not sufficient to reach a conclusion, and the engine abstained rather than guessing. It is not a soft way of saying 'fake'. The report lists exactly which providers were unavailable and what you can check yourself." },
  { q: "Do you store what I submit?", a: "Reports, evidence and findings are stored so a result can be re-opened and reviewed, with a configured retention window after which they are deleted. Uploaded files are analysed in memory, hashed for deduplication and never published. Only a fingerprinted hash of the connection is recorded for rate limiting — never a raw IP address." },
  { q: "Which external sources do you use?", a: "The Google Fact Check Tools API for published claim reviews, a licensed web search provider for corroborating sources, Google Web Risk for commercial URL reputation, public DNS and TLS for domain intelligence, and an internal normalised product catalogue. Each sits behind its own adapter; disabled adapters are reported in the affected results." },
  { q: "Is an AI model deciding the answer?", a: "No. The verdict is produced by a deterministic scorer over named findings and retrieved evidence. Where an AI model is configured it decomposes claims, compares supplied evidence and drafts the human-readable summary — it may not introduce a source, and it cannot raise a confidence figure on its own." },
  { q: "What if a result is wrong?", a: "Flag it from the report page. Corrections are queued for human review, and where the evidence was wrong the report is republished with the correction attached rather than quietly deleted." },
  { q: "Do you have an API?", a: "An internal API foundation exists today: POST /api/verify, GET /api/report/{id} and the metadata endpoints. Customer API keys and billing are a post-launch phase, started only once per-request cost is measurable and every provider licence permits redistribution." },
];

interface StatsPayload {
  stats: EngineStats;
  /** Evidence adapters enabled in this deployment; null when /api/stats could not be reached. */
  activeProviders: number | null;
}

const UNREACHABLE: StatsPayload = {
  stats: { available: false, reports: 0, cost: 0, latency: null, confidence: null, scored: 0, last: null, catalog: 0, providerCalls: 0 },
  activeProviders: null,
};

/** Engine figures read live from PostgreSQL by the Worker; null while the request is in flight. */
function useEngineStats(): StatsPayload | null {
  const [payload, setPayload] = useState<StatsPayload | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/stats", { signal: controller.signal, cache: "no-store", headers: { accept: "application/json" } })
      .then((res) => (res.ok ? (res.json() as Promise<StatsPayload>) : UNREACHABLE))
      .then(setPayload)
      .catch((error: Error) => {
        if (error.name !== "AbortError") setPayload(UNREACHABLE);
      });
    return () => controller.abort();
  }, []);
  return payload;
}

function Unavailable() {
  return <span className="text-mist-600">unavailable</span>;
}

function Reading() {
  return <span className="text-mist-600">reading…</span>;
}

export default function HomePage() {
  const payload = useEngineStats();
  const stats = payload?.stats ?? null;
  const activeProviders = payload?.activeProviders ?? null;
  /** A figure once read; "reading…" before, "unavailable" when the database could not be read. */
  const figure = (render: (s: EngineStats) => ReactNode) => (!stats ? <Reading /> : stats.available ? render(stats) : <Unavailable />);

  return (
    <>
      {/* ============================== HERO ============================== */}
      <section className="relative overflow-hidden pt-14 sm:pt-20">
        <div className="grid-field pointer-events-none absolute inset-0 opacity-70" />
        <div className="pointer-events-none absolute -left-40 -top-20 h-[520px] w-[520px] rounded-full bg-brand-500/10 blur-[130px]" />
        <div className="pointer-events-none absolute right-0 top-32 h-[380px] w-[380px] rounded-full bg-brand-500/6 blur-[130px]" />
        <div className="noise-layer" />

        <div className="relative mx-auto max-w-[1400px] px-5 sm:px-8">
          <div className="grid gap-10 lg:grid-cols-[1.15fr_1fr] lg:items-end lg:gap-x-14 lg:gap-y-6 xl:grid-cols-[1.05fr_auto_0.95fr] xl:gap-x-8">
            <div className="lg:row-span-2 xl:row-span-1">
              <Reveal>
                <div className="flex flex-wrap items-center gap-3">
                  <TonalChip tone="brand">sg16identifier.com · v1.0</TonalChip>
                  <TonalChip tone="neutral">free for the public</TonalChip>
                  <TonalChip tone="ok">
                    {activeProviders !== null ? `${activeProviders} adapters active` : payload ? "adapter status unavailable" : "checking adapters"}
                  </TonalChip>
                </div>
              </Reveal>

              <Reveal delay={90}>
                <h1 className="mt-7 font-display text-[clamp(2.6rem,6.4vw,5.1rem)] font-semibold leading-[0.95] tracking-[-0.03em] text-paper-50">
                  Is it real?
                  <span className="text-accent-gradient block pb-[0.08em]">Show the evidence.</span>
                </h1>
              </Reveal>

              <Reveal delay={170}>
                <p className="mt-7 max-w-xl text-[17px] leading-relaxed text-mist-400">
                  SG16 Identifier is one verification engine for four problems that look different and
                  behave the same: counterfeit products, unverified news, cloned shops and synthetic
                  media. Submit text, a link, an identifier or an image and receive a structured
                  report — finding, evidence, source, confidence, limitation, next step.
                </p>
              </Reveal>

              <Reveal delay={240}>
                <div className="mt-9 flex flex-wrap items-center gap-3">
                  <a
                    href="#identify"
                    className="glow-accent group inline-flex items-center gap-2 rounded-sm bg-brand-cta px-6 py-3.5 text-[14px] font-semibold text-white transition-[transform,background-color] duration-300 hover:-translate-y-0.5 hover:bg-brand-cta-hover"
                  >
                    Start a free check
                    <IconArrow className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </a>
                  <Link
                    href="/blueprint"
                    className="inline-flex items-center gap-2 rounded-sm border border-brand-700 bg-ink-950 px-6 py-3.5 text-[14px] text-paper-50 transition-colors hover:border-brand-500 hover:text-brand-400"
                  >
                    Read the full blueprint
                  </Link>
                </div>
              </Reveal>

              <Reveal delay={300}>
                <p className="mt-8 max-w-lg border-l-2 border-brand-500/50 pl-4 text-[13px] leading-relaxed text-mist-500">
                  The product rule: SG16 never says an item is real or fake because a model guessed.
                  It separates what was checked, what was contradicted, what remains unknown — and
                  abstains when the evidence does not support a conclusion.
                </p>
              </Reveal>
            </div>

            {/* robot manager — beside the panel on wide screens, below the text on small ones */}
            <RoboManager className="mx-auto w-[170px] sm:w-[200px] lg:col-start-2 lg:row-start-1 lg:w-[190px] xl:w-[240px]" />

            {/* live instrument panel */}
            <Reveal delay={200} className="lg:col-start-2 lg:row-start-2 xl:col-start-3 xl:row-start-1">
              <Panel hover={false} className="card-feature relative p-0">
                <div className="grid-fine pointer-events-none absolute inset-0 opacity-50" />
                <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-500/70 to-transparent" />
                <div className="relative border-b border-brand-700/50 bg-ink-950/60 px-5 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="rule-label text-mist-400">SG16 verification engine</span>
                    {!stats ? (
                      <span className="flex items-center gap-1.5" title="Reading figures from PostgreSQL">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-mist-600" />
                        <span className="font-mono text-[10px] tracking-wider text-mist-500">READING</span>
                      </span>
                    ) : stats.available ? (
                      <span className="flex items-center gap-1.5" title="Figures read from PostgreSQL on this request">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ok-400" />
                        <span className="font-mono text-[10px] tracking-wider text-ok-400">LIVE</span>
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5" title="The database could not be read on this request">
                        <span className="h-1.5 w-1.5 rounded-full bg-warn-500" />
                        <span className="font-mono text-[10px] tracking-wider text-warn-400">DATA UNAVAILABLE</span>
                      </span>
                    )}
                  </div>
                </div>
                <div className="relative space-y-4 p-5">
                  <div>
                    <DataLine label="Reports stored" value={figure((s) => <CountUp to={s.reports} />)} />
                    <DataLine label="Catalogue records" value={figure((s) => <CountUp to={s.catalog} />)} />
                    <DataLine label="Provider calls metered" value={figure((s) => <CountUp to={s.providerCalls} />)} />
                    <DataLine label="Metered spend" value={figure((s) => `$${s.cost.toFixed(4)}`)} />
                    <DataLine
                      label="Median latency"
                      value={figure((s) => (s.latency === null ? <span className="text-mist-500">no checks yet</span> : `${s.latency} ms`))}
                    />
                    <DataLine
                      label="Last check"
                      value={figure((s) => (s.last ? formatDateTime(s.last) : <span className="text-mist-500">awaiting first check</span>))}
                    />
                  </div>
                  <div className="dash-accent rounded-sm bg-ink-950/80 p-4">
                    {!stats ? (
                      <>
                        <p className="rule-label text-mist-500">Calibrated confidence</p>
                        <p className="mt-2 text-[12.5px] leading-relaxed text-mist-500">Reading stored reports…</p>
                      </>
                    ) : !stats.available ? (
                      <>
                        <p className="rule-label text-mist-500">Calibrated confidence</p>
                        <p className="mt-2 text-[12.5px] leading-relaxed text-mist-500">
                          Not shown — stored reports could not be read on this request.
                        </p>
                      </>
                    ) : stats.confidence === null ? (
                      <>
                        <p className="rule-label text-mist-500">Calibrated confidence</p>
                        <p className="mt-2 text-[12.5px] leading-relaxed text-mist-500">
                          {stats.reports === 0
                            ? "No reports yet. A confidence figure appears only after real checks have been scored."
                            : `All ${stats.reports} stored report${stats.reports === 1 ? "" : "s"} abstained with a null confidence — the evidence did not support a figure.`}
                        </p>
                      </>
                    ) : (
                      <ConfidenceMeter
                        value={stats.confidence}
                        tone="brand"
                        label="Median calibrated confidence"
                        note={`Median across ${stats.scored} stored report${stats.scored === 1 ? "" : "s"} that stated a figure; ${stats.reports - stats.scored} abstained with null. Read from the database — not a forecast.`}
                      />
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {(["claim", "website", "product", "media"] as const).map((c) => {
                      const Icon = CATEGORY_ICON_MAP[c];
                      return (
                        <div key={c} className="flex items-center gap-2 rounded-sm border border-ink-600 bg-ink-900/80 px-3 py-2">
                          <Icon className="h-4 w-4 text-brand-400" />
                          <span className="rule-label text-mist-400">{c}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </Panel>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ============================== GLOBAL PRESENCE ============================== */}
      <GlobalPresence />

      {/* ============================== AI PIONEERS ============================== */}
      <PioneersSection />

      <div className="relative mt-16">
        <Marquee
          items={[
            "IMEI Luhn validation", "GS1 modulo-10 barcode checks", "Google Fact Check Tools API",
            "C2PA / Content Credentials detection", "DNS · SOA · NS · MX · SPF · DMARC",
            "TLS certificate age & SAN count", "SSRF-guarded page fetching", "Brand impersonation & homoglyph folding",
            "JPEG marker path & quantisation tables", "PNG tEXt generator signatures", "Shannon entropy profiling",
            "Deterministic, explainable scoring", "Per-request cost metering", "30-day retention then deletion",
          ]}
        />
      </div>

      {/* ============================== IDENTIFY ============================== */}
      <section id="identify" className="relative mx-auto max-w-[1400px] scroll-mt-24 px-5 pt-20 sm:px-8">
        <Reveal>
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <SectionLabel>The central idea</SectionLabel>
              <h2 className="mt-4 max-w-3xl font-display text-[clamp(1.9rem,4vw,3.1rem)] font-semibold leading-[1.05] tracking-tight text-paper-50">
                One website, many verification tools, one understandable result.
              </h2>
            </div>
            <p className="max-w-md text-sm leading-relaxed text-mist-500">
              Type anything below. The classifier decides which workflow fits, tells you why, and lets
              you override it. Free — no account, no subscription, no card.
            </p>
          </div>
        </Reveal>
        <div className="mt-9">
          <VerifyConsole />
        </div>
      </section>

      {/* ============================== PROBLEM ============================== */}
      <section className="relative mx-auto mt-28 max-w-[1400px] px-5 sm:px-8">
        <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr]">
          <Reveal>
            <div className="lg:sticky lg:top-28">
              <SectionLabel tone="mist">Why this exists</SectionLabel>
              <h2 className="mt-4 font-display text-[clamp(1.8rem,3.6vw,2.8rem)] font-semibold leading-[1.06] tracking-tight text-paper-50">
                Four different problems.
                <span className="block text-mist-500">One identical question.</span>
              </h2>
              <p className="mt-6 max-w-md text-[15px] leading-relaxed text-mist-400">
                A counterfeit charger, a recycled war photo, a cloned shoe shop and a fabricated
                quote are not the same crime. But the person facing them is asking the same thing:
                <em className="not-italic text-brand-400"> can this be checked, and by what evidence?</em>
              </p>
              <p className="mt-4 max-w-md text-[15px] leading-relaxed text-mist-400">
                Today that question is answered by five unrelated tools, each with its own interface,
                each pretending its single signal is conclusive. SG16 answers it once.
              </p>
            </div>
          </Reveal>

          <div className="space-y-4">
            {[
              { k: "Products", v: "Counterfeit electronics reuse genuine model codes and valid barcodes copied from real packaging, so identifier lookups alone produce false reassurance.", icon: IconBarcode },
              { k: "Information", v: "A claim repeated across a hundred sites is not corroborated a hundred times — usually it is one source syndicated, and the absence of a fact-check proves nothing.", icon: IconNews },
              { k: "Commerce", v: "Fake shops live for weeks on new domains, short-lived TLS certificates and brand names embedded as subdomains of someone else's registrable domain.", icon: IconLink },
              { k: "Media", v: "Fabrication is rarer than reuse. Most misleading media is a genuine image attached to the wrong event, date or place.", icon: IconFrame },
            ].map((row, i) => (
              <Reveal key={row.k} delay={i * 70}>
                <Panel className="group p-6">
                  <div className="flex items-start gap-5">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-sm border border-mist-500/20 bg-ink-900 text-brand-400 transition-colors group-hover:border-brand-500/50">
                      <row.icon className="h-5 w-5" />
                    </span>
                    <div>
                      <div className="flex items-center gap-3">
                        <h3 className="font-display text-xl text-paper-50">{row.k}</h3>
                        <TonalChip tone="brand">{`0${i + 1}`}</TonalChip>
                      </div>
                      <p className="mt-2.5 text-[14.5px] leading-relaxed text-mist-400">{row.v}</p>
                    </div>
                  </div>
                </Panel>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ============================== SERVICES ============================== */}
      <section className="relative mx-auto mt-28 max-w-[1400px] px-5 sm:px-8">
        <Reveal>
          <SectionLabel>The platform</SectionLabel>
          <h2 className="mt-4 max-w-3xl font-display text-[clamp(1.9rem,4vw,3.1rem)] font-semibold leading-[1.05] tracking-tight text-paper-50">
            Five verification services behind one engine.
          </h2>
          <p className="mt-5 max-w-2xl text-[15px] leading-relaxed text-mist-500">
            Not five chatbots. A single orchestrator with specialist modules, so source attribution,
            security, cost tracking and schema stay identical everywhere.
          </p>
        </Reveal>

        <div className="mt-10 divide-y divide-mist-500/12 border-y border-mist-500/12">
          {SERVICES.map((service, i) => (
            <Reveal key={service.id} delay={i * 50}>
              <div className="group grid gap-6 py-8 lg:grid-cols-[auto_1fr_1.3fr] lg:items-start lg:gap-10">
                <div className="flex items-center gap-4 lg:block">
                  <span className="font-mono text-[13px] text-brand-400">{service.n}</span>
                  <span className="mt-0 grid h-12 w-12 place-items-center rounded-sm border border-mist-500/20 bg-ink-900 text-mist-300 transition-all duration-500 group-hover:border-brand-500/50 group-hover:text-brand-400 lg:mt-4">
                    <service.icon className="h-6 w-6" />
                  </span>
                </div>
                <div>
                  <h3 className="font-display text-[clamp(1.3rem,2.4vw,1.9rem)] font-semibold leading-tight text-paper-50">
                    {service.title}
                  </h3>
                  <p className="mt-2.5 max-w-sm text-[14px] leading-relaxed text-mist-500">{service.strap}</p>
                  <Link
                    href={service.href}
                    className="mt-4 inline-flex items-center gap-2 text-[13px] text-brand-400 transition-all hover:gap-3"
                  >
                    Open module <IconArrow className="h-4 w-4" />
                  </Link>
                </div>
                <ul className="grid gap-2.5 sm:grid-cols-2">
                  {service.bullets.map((bullet) => (
                    <li key={bullet} className="flex gap-2.5 text-[13px] leading-relaxed text-mist-400">
                      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-brand-500" />
                      {bullet}
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ============================== TAXONOMY ============================== */}
      <section className="relative mt-28 overflow-hidden border-y border-mist-500/12 bg-ink-900/60 py-24">
        <div className="grid-field pointer-events-none absolute inset-0 opacity-40" />
        <div className="relative mx-auto max-w-[1400px] px-5 sm:px-8">
          <Reveal>
            <SectionLabel>The most important feature</SectionLabel>
            <h2 className="mt-4 max-w-3xl font-display text-[clamp(1.9rem,4vw,3.1rem)] font-semibold leading-[1.05] tracking-tight text-paper-50">
              Four possible answers. Never &ldquo;real&rdquo; or &ldquo;fake&rdquo;.
            </h2>
            <p className="mt-5 max-w-2xl text-[15px] leading-relaxed text-mist-500">
              A serial number cannot prove a phone is genuine, because counterfeiters copy valid
              identifiers from authentic units. A missing fact-check cannot prove a story is true. So
              SG16 reports what the evidence supports — and abstains when it does not.
            </p>
          </Reveal>

          <div className="mt-12 grid gap-5 md:grid-cols-2">
            {TAXONOMY.map((item, i) => (
              <Reveal key={item.code} delay={i * 70}>
                <Panel hover={false} className="h-full p-0">
                  <div className={`h-1 w-full ${
                    item.tone === "ok" ? "bg-ok-400" : item.tone === "warn" ? "bg-warn-500" : item.tone === "risk" ? "bg-risk-500" : "bg-unknown-400"
                  }`} />
                  <div className="p-7">
                    <span className="font-mono text-[11px] text-mist-600">{item.code}</span>
                    <h3 className={`mt-3 font-display text-[22px] font-semibold leading-tight ${
                      item.tone === "ok" ? "text-ok-400" : item.tone === "warn" ? "text-warn-400" : item.tone === "risk" ? "text-risk-400" : "text-mist-300"
                    }`}>
                      {item.status}
                    </h3>
                    <p className="mt-4 text-[14.5px] leading-relaxed text-mist-400">{item.body}</p>
                  </div>
                </Panel>
              </Reveal>
            ))}
          </div>

          <Reveal delay={120}>
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ["Serial / IMEI match", "Confirms the identifier is valid and attributable. Not authenticity."],
                ["No fact-check found", "Confirms nobody reviewed it in the queried index. Not truth."],
                ["Not on a blocklist", "Confirms no classification yet. Not an endorsement."],
                ["No AI signature found", "Confirms no marker exists. Not a camera capture."],
              ].map(([head, body]) => (
                <div key={head} className="rounded-sm border border-mist-500/15 bg-ink-950/60 p-5">
                  <p className="font-display text-[15px] text-paper-50">{head}</p>
                  <p className="mt-2 text-[13px] leading-relaxed text-mist-500">{body}</p>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ============================== PIPELINE ============================== */}
      <section className="relative mx-auto mt-28 max-w-[1400px] px-5 sm:px-8">
        <Reveal>
          <SectionLabel tone="mist">From submission to report</SectionLabel>
          <h2 className="mt-4 max-w-3xl font-display text-[clamp(1.9rem,4vw,3.1rem)] font-semibold leading-[1.05] tracking-tight text-paper-50">
            A controlled pipeline, not a chat completion.
          </h2>
        </Reveal>

        <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {PIPELINE.map((step, i) => (
            <Reveal key={step.n} delay={i * 60}>
              <Panel className="group h-full p-6">
                <div className="flex items-baseline justify-between">
                  <span className="font-display text-3xl font-semibold text-mist-600 transition-colors duration-500 group-hover:text-brand-400">
                    {step.n}
                  </span>
                  <span className="font-mono text-[11px] text-mist-600">{step.ms}</span>
                </div>
                <h3 className="mt-4 font-display text-[17px] font-medium text-paper-50">{step.label}</h3>
                <p className="mt-2.5 text-[13.5px] leading-relaxed text-mist-500">{step.detail}</p>
                <div className="mt-5 h-px w-full bg-mist-500/12">
                  <div className="h-px w-0 bg-brand-500 transition-all duration-700 group-hover:w-full" />
                </div>
              </Panel>
            </Reveal>
          ))}
        </div>

        <Reveal delay={100}>
          <Panel hover={false} className="mt-8 p-0">
            <div className="border-b border-mist-500/15 px-6 py-4">
              <SectionLabel tone="mist">Standard report schema — identical across all four modules</SectionLabel>
            </div>
            <pre className="overflow-x-auto scrollbar-thin p-6 font-mono text-[12px] leading-relaxed text-mist-400">{`{
  "report_id":   "generated-unique-id",
  "public_id":   "SG16-4KQ2-9MXT",
  "category":    "claim",
  "status":      "inconclusive",
  "confidence":  null,
  "headline":    "Unable to verify this claim",
  "summary":     "Insufficient evidence to reach a conclusion.",
  "findings":    [ { "kind", "title", "detail", "severity", "weight" } ],
  "sources":     [ { "provider", "url", "publisher", "stance", "trust_tier", "retrieved_at" } ],
  "limitations": [ "what the system could not check" ],
  "next_steps":  [ "what the reader should do next" ],
  "workflow":    [ { "index", "label", "status", "ms" } ],
  "providers":   [ { "provider", "operation", "status", "cost_usd" } ],
  "checked_at":  "ISO-8601 timestamp"
}`}</pre>
            <p className="border-t border-mist-500/15 px-6 py-4 text-xs leading-relaxed text-mist-600">
              Confidence is calibrated against the weighted findings and the number of retrieved
              sources — it is never asserted by the model. When evidence is insufficient the field is
              <span className="font-mono text-brand-400"> null</span>, not a low number.
            </p>
          </Panel>
        </Reveal>
      </section>

      {/* ============================== ARCHITECTURE ============================== */}
      <section className="relative mt-28 border-y border-mist-500/12 bg-ink-900/50 py-24">
        <div className="relative mx-auto max-w-[1400px] px-5 sm:px-8">
          <Reveal>
            <SectionLabel>Architecture</SectionLabel>
            <h2 className="mt-4 max-w-3xl font-display text-[clamp(1.9rem,4vw,3.1rem)] font-semibold leading-[1.05] tracking-tight text-paper-50">
              One engine, isolated adapters, metered everything.
            </h2>
          </Reveal>

          <div className="mt-12 grid gap-6 lg:grid-cols-[1.25fr_1fr] [&>*]:min-w-0">
            <Reveal>
              <Panel hover={false} className="h-full p-6 sm:p-8">
                <div className="space-y-3">
                  {[
                    { label: "Web client", detail: "Vite + React 19 · Tailwind v4 · Cloudflare Workers · desktop, tablet and mobile", icon: IconFrame, tone: "border border-ink-600 bg-ink-900/70", iconTone: "text-mist-300" },
                    { label: "Backend API layer", detail: "Validation · rate limits · API keys · request IDs · budget gate · universal /v1 API", icon: IconLock, tone: "border border-ink-600 bg-ink-900/70", iconTone: "text-mist-300" },
                    { label: "Verification orchestration", detail: "Classify → retrieve evidence → analyse → cross-check → build report", icon: IconCpu, tone: "border border-brand-500/60 bg-brand-500/8", iconTone: "text-brand-400" },
                    { label: "Provider adapters", detail: "Fact check · web risk · search · any AI model or company API · DNS/TLS · internal catalogue", icon: IconLink, tone: "dash-accent bg-ink-950/60", iconTone: "text-brand-400" },
                    { label: "PostgreSQL + private storage + cache", detail: "Reports · evidence · findings · usage · audit · retention expiry", icon: IconDatabase, tone: "border border-ink-600 bg-ink-900/70", iconTone: "text-mist-300" },
                  ].map((layer, i, arr) => (
                    <div key={layer.label}>
                      <div className={`flex items-start gap-4 rounded-sm p-4 ${layer.tone}`}>
                        <layer.icon className={`mt-0.5 h-5 w-5 ${layer.iconTone}`} />
                        <div>
                          <p className="font-display text-[15.5px] text-paper-50">{layer.label}</p>
                          <p className="mt-1 text-[13px] leading-relaxed text-mist-500">{layer.detail}</p>
                        </div>
                      </div>
                      {i < arr.length - 1 && (
                        <div className="flex justify-center py-1">
                          <span className="h-4 w-px bg-gradient-to-b from-brand-500/60 to-transparent" />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <p className="mt-6 rounded-sm border border-risk-500/30 bg-risk-500/6 p-4 text-[13px] leading-relaxed text-mist-400">
                  <span className="font-semibold text-risk-400">Architecture rule:</span> the browser
                  never calls a paid AI or security API with secret credentials. Every such call goes
                  through the backend, where usage, permissions, validation and spending limits are
                  enforced.
                </p>
              </Panel>
            </Reveal>

            <Reveal delay={90}>
              <Panel hover={false} className="h-full p-0">
                <div className="border-b border-mist-500/15 px-6 py-4">
                  <SectionLabel tone="mist">Adapter tree</SectionLabel>
                </div>
                <pre className="overflow-x-auto scrollbar-thin p-6 font-mono text-[11.5px] leading-relaxed text-mist-400">{`Verification Engine
├── Claim Verification
│   ├── Fact Check Adapter      (Google ClaimReview)
│   ├── Search Adapter          (licensed web search)
│   └── Evidence Comparison     (deterministic scorer)
├── Website Verification
│   ├── Commercial URL Risk     (Web Risk / Safe Browsing)
│   ├── Domain Intelligence     (DNS · TLS · HTTP probe)
│   └── Message Lexicon         (scam & deception signals)
├── Product Verification
│   ├── Identifier Checksums    (Luhn · GS1 modulo-10)
│   ├── Product Catalogue       (normalised model records)
│   └── Specification Comparator
└── Media Verification
    ├── Provenance Adapter      (C2PA / Content Credentials)
    ├── Container Forensics     (EXIF · XMP · PNG · RIFF)
    └── Generator Signatures    (tool marker lexicon)`}</pre>
                <div className="border-t border-mist-500/15 px-6 py-5">
                  <p className="text-[13px] leading-relaxed text-mist-500">
                    Every provider has its own adapter, so one can be replaced without rebuilding the
                    website. Before any provider is used commercially, its licence, request limits,
                    caching rules, redistribution rights and privacy terms are checked.
                  </p>
                  <p className="mt-4 rounded-sm border border-warn-500/30 bg-warn-500/6 p-3 text-[12.5px] leading-relaxed text-mist-400">
                    Example of a rejected integration: a vendor whose public API explicitly prohibits
                    commercial products. A free developer key is not a commercial licence.
                  </p>
                </div>
              </Panel>
            </Reveal>
          </div>

          <div className="mt-8">
            <ProviderStatus />
          </div>
        </div>
      </section>

      {/* ============================== DATABASE ============================== */}
      <section className="relative mx-auto mt-28 max-w-[1400px] px-5 sm:px-8">
        <div className="grid gap-10 lg:grid-cols-[0.85fr_1.15fr] [&>*]:min-w-0">
          <Reveal>
            <div className="lg:sticky lg:top-28">
              <SectionLabel>PostgreSQL schema</SectionLabel>
              <h2 className="mt-4 font-display text-[clamp(1.8rem,3.6vw,2.7rem)] font-semibold leading-[1.06] tracking-tight text-paper-50">
                Eleven tables. No speculative modelling.
              </h2>
              <p className="mt-5 text-[15px] leading-relaxed text-mist-500">
                A small, well-defined schema that stores the minimum needed to reproduce a result,
                meter its cost and review a complaint — then deletes it.
              </p>
              <div className="mt-7 space-y-3">
                <div className="rounded-sm border border-mist-500/15 bg-ink-900/50 p-4">
                  <p className="rule-label text-brand-400">Privacy default</p>
                  <p className="mt-2 text-[13.5px] leading-relaxed text-mist-500">
                    Uploaded images, pasted messages and private URLs are not retained indefinitely.
                    Retention expires on a schedule, users can request deletion, and only a hashed
                    connection fingerprint is stored for rate limiting.
                  </p>
                </div>
                <div className="rounded-sm border border-mist-500/15 bg-ink-900/50 p-4">
                  <p className="rule-label text-brand-400">Sharing is explicit</p>
                  <p className="mt-2 text-[13.5px] leading-relaxed text-mist-500">
                    Reports are private by default. A shareable report uses an unguessable reference
                    such as SG16-4KQ2-9MXT and is only ever created when the submitter asks for it.
                  </p>
                </div>
              </div>
            </div>
          </Reveal>

          <Reveal delay={80}>
            <Panel hover={false} className="overflow-hidden">
              <div className="overflow-x-auto scrollbar-thin"><table className="w-full text-left">
                <thead className="border-b border-mist-500/15 bg-ink-900/60">
                  <tr className="rule-label text-mist-600">
                    <th className="px-4 py-3.5 sm:px-6 font-normal">Table</th>
                    <th className="px-4 py-3.5 sm:px-6 font-normal">What it stores</th>
                  </tr>
                </thead>
                <tbody>
                  {TABLES.map(([name, desc], i) => (
                    <tr key={name} className={`group border-b border-mist-500/8 transition-colors last:border-0 hover:bg-brand-500/4 ${i % 2 ? "bg-ink-900/25" : ""}`}>
                      <td className="whitespace-nowrap px-4 py-3.5 sm:px-6 font-mono text-[12.5px] text-brand-400">{name}</td>
                      <td className="px-4 py-3.5 sm:px-6 text-[13.5px] leading-relaxed text-mist-400">{desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            </Panel>
          </Reveal>
        </div>
      </section>

      {/* ============================== SECURITY ============================== */}
      <section className="relative mt-28 border-y border-mist-500/12 bg-ink-900/50 py-24">
        <div className="relative mx-auto max-w-[1400px] px-5 sm:px-8">
          <Reveal>
            <SectionLabel tone="brand">Security, privacy and abuse prevention</SectionLabel>
            <h2 className="mt-4 max-w-3xl font-display text-[clamp(1.9rem,4vw,3.1rem)] font-semibold leading-[1.05] tracking-tight text-paper-50">
              Built to accept hostile input.
            </h2>
            <p className="mt-5 max-w-2xl text-[15px] leading-relaxed text-mist-500">
              SG16 receives untrusted links, uploaded binaries and adversarial text as its normal
              workload. Security is not a hardening pass — it is the first release.
            </p>
          </Reveal>

          <div className="mt-12 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {SECURITY.map((item, i) => (
              <Reveal key={item.title} delay={i * 60}>
                <Panel className="group h-full p-6">
                  <span className="grid h-11 w-11 place-items-center rounded-sm border border-mist-500/20 bg-ink-950 text-mist-300 transition-all duration-500 group-hover:border-brand-500/50 group-hover:text-brand-400">
                    <item.icon className="h-5 w-5" />
                  </span>
                  <h3 className="mt-5 font-display text-[17px] font-medium text-paper-50">{item.title}</h3>
                  <p className="mt-2.5 text-[13.5px] leading-relaxed text-mist-500">{item.body}</p>
                </Panel>
              </Reveal>
            ))}
          </div>

          <Reveal delay={100}>
            <Panel hover={false} className="mt-8 overflow-hidden">
              <div className="border-b border-mist-500/15 px-6 py-4">
                <SectionLabel tone="mist">Private-range rejection — implemented in url-guard.ts</SectionLabel>
              </div>
              <div className="grid gap-px bg-mist-500/10 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  ["127.0.0.0/8", "loopback"],
                  ["10.0.0.0/8", "RFC1918"],
                  ["172.16.0.0/12", "RFC1918"],
                  ["192.168.0.0/16", "RFC1918"],
                  ["169.254.0.0/16", "link-local / cloud metadata"],
                  ["100.64.0.0/10", "carrier-grade NAT"],
                  ["0.0.0.0/8", "this network"],
                  ["224.0.0.0/4 +", "multicast & reserved"],
                  ["::1 / fc00::/7", "IPv6 loopback & ULA"],
                  ["fe80::/10", "IPv6 link-local"],
                  ["::ffff:10.x", "IPv4-mapped private"],
                  ["*.local / *.internal", "internal name suffixes"],
                ].map(([range, label]) => (
                  <div key={range} className="bg-ink-950 px-5 py-4">
                    <p className="font-mono text-[12.5px] text-risk-400">{range}</p>
                    <p className="mt-1 text-[11.5px] text-mist-600">{label} — blocked</p>
                  </div>
                ))}
              </div>
              <p className="px-6 py-4 text-xs leading-relaxed text-mist-600">
                Redirects are followed manually and every hop is re-resolved and re-validated, which
                defeats DNS-rebinding and redirect-hopping attempts against the fetch backend.
              </p>
            </Panel>
          </Reveal>
        </div>
      </section>

      {/* ============================== COST ============================== */}
      <section className="relative mx-auto mt-28 max-w-[1400px] px-5 sm:px-8">
        <Reveal>
          <SectionLabel tone="brand">Operating economics</SectionLabel>
          <h2 className="mt-4 max-w-3xl font-display text-[clamp(1.9rem,4vw,3.1rem)] font-semibold leading-[1.05] tracking-tight text-paper-50">
            A free website is not a free service.
          </h2>
          <p className="mt-5 max-w-2xl text-[15px] leading-relaxed text-mist-500">
            AI calls, search APIs, storage, image processing and malicious-link intelligence all cost
            money per request. The budget below is a planning envelope for an early pilot — not a
            provider quote or a guarantee.
          </p>
        </Reveal>

        <div className="mt-10 grid gap-6 lg:grid-cols-[1.15fr_1fr]">
          <Reveal>
            <Panel hover={false} className="overflow-hidden">
              <div className="overflow-x-auto scrollbar-thin"><table className="w-full text-left">
                <thead className="border-b border-mist-500/15 bg-ink-900/60">
                  <tr className="rule-label text-mist-600">
                    <th className="px-6 py-3.5 font-normal">Expense</th>
                    <th className="px-6 py-3.5 font-normal">Early-stage / month</th>
                  </tr>
                </thead>
                <tbody>
                  {COST_ROWS.map(([name, cost, note]) => (
                    <tr key={name} className="border-b border-mist-500/8 last:border-0">
                      <td className="px-6 py-4">
                        <p className="text-[14px] text-paper-50">{name}</p>
                        <p className="mt-1 text-[12.5px] leading-relaxed text-mist-600">{note}</p>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 font-mono text-[13.5px] text-brand-400">{cost}</td>
                    </tr>
                  ))}
                  <tr className="bg-brand-500/6">
                    <td className="px-6 py-4 font-display text-[15px] text-paper-50">Illustrative total</td>
                    <td className="px-6 py-4 font-mono text-[15px] text-brand-400">$10 – $290</td>
                  </tr>
                </tbody>
              </table></div>
            </Panel>
          </Reveal>

          <Reveal delay={80}>
            <Panel hover={false} className="h-full p-6 sm:p-7">
              <SectionLabel tone="mist">Worked AI cost example</SectionLabel>
              <p className="mt-5 text-[13.5px] leading-relaxed text-mist-500">
                10,000 verification requests per month at an illustrative average of 4,000 input and
                800 output tokens each, using published low-cost model rates:
              </p>
              <div className="mt-5 space-y-0">
                <DataLine label="Input tokens" value="40,000,000 / month" />
                <DataLine label="Input rate" value="$0.05 per million" />
                <DataLine label="Input cost" value="$2.00" />
                <DataLine label="Output tokens" value="8,000,000 / month" />
                <DataLine label="Output rate" value="$0.25 per million" />
                <DataLine label="Output cost" value="$2.00" />
              </div>
              <div className="mt-6 rounded-sm border border-brand-700 bg-brand-500/6 p-5">
                <p className="font-display text-[15px] text-brand-400">Estimated model-token cost</p>
                <p className="mt-1 font-mono text-3xl text-paper-50">$4.00 / month</p>
              </div>
              <p className="mt-5 text-xs leading-relaxed text-mist-600">
                A mathematical illustration, not an estimate for a finished service. Search, retries,
                image processing, longer evidence contexts, more capable models and provider minimums
                can all cost substantially more. The chosen model&rsquo;s real price must be measured
                before launch — which is why every call is metered in <span className="font-mono">provider_usage</span>.
              </p>
              <div className="mt-6 border-t border-mist-500/12 pt-5">
                <p className="rule-label text-brand-400">The unit metric that decides what stays free</p>
                <p className="mt-3 font-mono text-[13px] text-mist-300">
                  net contribution per check =
                  <span className="block pl-6 text-ok-400">+ revenue attributed to the check</span>
                  <span className="block pl-6 text-risk-400">− variable cost per check</span>
                </p>
              </div>
            </Panel>
          </Reveal>
        </div>

        <Reveal delay={60}>
          <div className="mt-6 grid gap-4 md:grid-cols-3 lg:grid-cols-6">
            {[
              "Cache reusable lookups where licences allow",
              "Never repeat an identical search or AI call",
              "Small model by default, escalate only when justified",
              "Hard per-request budget and evidence-length caps",
              "Record provider cost against every request ID",
              "Alert the operator before a quota is exhausted",
            ].map((rule, i) => (
              <div key={rule} className="rounded-sm border border-mist-500/15 bg-ink-900/40 p-4">
                <span className="font-mono text-[11px] text-brand-400">{String(i + 1).padStart(2, "0")}</span>
                <p className="mt-2 text-[13px] leading-relaxed text-mist-400">{rule}</p>
              </div>
            ))}
          </div>
        </Reveal>
      </section>

      {/* ============================== REVENUE ============================== */}
      <section className="relative mt-28 border-y border-mist-500/12 bg-ink-900/50 py-24">
        <div className="relative mx-auto max-w-[1400px] px-5 sm:px-8">
          <Reveal>
            <SectionLabel>How it earns money</SectionLabel>
            <h2 className="mt-4 max-w-3xl font-display text-[clamp(1.9rem,4vw,3.1rem)] font-semibold leading-[1.05] tracking-tight text-paper-50">
              Free at the core. Four honest revenue streams around it.
            </h2>
            <p className="mt-5 max-w-2xl text-[15px] leading-relaxed text-mist-500">
              No mandatory subscription for ordinary users. Advertising alone is not a strategy: it
              depends on traffic, visitor location, engagement and advertiser demand, and none of
              those are guaranteed.
            </p>
          </Reveal>

          <div className="mt-12 grid gap-5 lg:grid-cols-2">
            {REVENUE.map((stream, i) => (
              <Reveal key={stream.title} delay={i * 70}>
                <Panel className="group h-full p-7">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-[12px] text-brand-400">{String.fromCharCode(65 + i)}</span>
                    <h3 className="font-display text-[20px] font-semibold text-paper-50">{stream.title}</h3>
                  </div>
                  <dl className="mt-5 space-y-3">
                    {[["Where", stream.where], ["How", stream.how]].map(([k, v]) => (
                      <div key={k}>
                        <dt className="rule-label text-mist-600">{k}</dt>
                        <dd className="mt-1 text-[13.5px] leading-relaxed text-mist-400">{v}</dd>
                      </div>
                    ))}
                  </dl>
                  <p className="mt-5 rounded-sm border-l-2 border-brand-500/60 bg-brand-500/5 py-3 pl-4 text-[13px] leading-relaxed text-mist-300">
                    <span className="rule-label mr-2 text-brand-400">Rule</span>
                    {stream.rule}
                  </p>
                </Panel>
              </Reveal>
            ))}
          </div>

          <Reveal delay={80}>
            <Panel hover={false} className="mt-8 overflow-hidden">
              <div className="border-b border-mist-500/15 px-6 py-4">
                <SectionLabel tone="mist">Hypothetical monthly scenario — illustrative, not a forecast</SectionLabel>
              </div>
              <div className="overflow-x-auto scrollbar-thin"><table className="w-full text-left">
                <thead className="border-b border-mist-500/15 bg-ink-900/60">
                  <tr className="rule-label text-mist-600">
                    <th className="px-6 py-3 font-normal">Source</th>
                    <th className="px-6 py-3 font-normal">Assumption</th>
                    <th className="px-6 py-3 text-right font-normal">Revenue</th>
                  </tr>
                </thead>
                <tbody className="text-[13.5px]">
                  {[
                    ["Advertising", "100,000 page views × $3 effective per 1,000", "$300"],
                    ["Affiliate referrals", "100 eligible purchases × $2 average commission", "$200"],
                    ["Business services", "10 customers × $30 per month", "$300"],
                  ].map(([a, b, c]) => (
                    <tr key={a} className="border-b border-mist-500/8">
                      <td className="px-6 py-3.5 text-paper-50">{a}</td>
                      <td className="px-6 py-3.5 text-mist-500">{b}</td>
                      <td className="px-6 py-3.5 text-right font-mono text-brand-400">{c}</td>
                    </tr>
                  ))}
                  <tr className="border-b border-mist-500/8 bg-brand-500/5">
                    <td className="px-6 py-3.5 font-display text-paper-50">Total gross revenue</td>
                    <td className="px-6 py-3.5 text-mist-500">Before taxes, labour, refunds and reinvestment</td>
                    <td className="px-6 py-3.5 text-right font-mono text-[15px] text-brand-400">$800</td>
                  </tr>
                  <tr className="border-b border-mist-500/8">
                    <td className="px-6 py-3.5 text-mist-400">Operating expenses</td>
                    <td className="px-6 py-3.5 text-mist-500">Mid-point of the pilot envelope</td>
                    <td className="px-6 py-3.5 text-right font-mono text-risk-400">−$250</td>
                  </tr>
                  <tr className="bg-brand-500/6">
                    <td className="px-6 py-4 font-display text-[15px] text-paper-50">Remaining</td>
                    <td className="px-6 py-4 text-[13px] text-mist-500">Before everything that is not a server bill</td>
                    <td className="px-6 py-4 text-right font-mono text-[16px] text-brand-400">$550</td>
                  </tr>
                </tbody>
              </table></div>
              <p className="px-6 py-4 text-xs leading-relaxed text-mist-600">
                Actual results may be substantially lower or higher. Traffic alone does not guarantee
                advertising revenue, and affiliate conversion depends on visitor intent and available
                offers. Build useful public content and earn trust first.
              </p>
            </Panel>
          </Reveal>
        </div>
      </section>

      {/* ============================== ROADMAP ============================== */}
      <section className="relative mx-auto mt-28 max-w-[1400px] px-5 sm:px-8">
        <Reveal>
          <SectionLabel>Delivery roadmap</SectionLabel>
          <h2 className="mt-4 max-w-3xl font-display text-[clamp(1.9rem,4vw,3.1rem)] font-semibold leading-[1.05] tracking-tight text-paper-50">
            An enormous vision, launched in manageable stages.
          </h2>
          <p className="mt-5 max-w-2xl text-[15px] leading-relaxed text-mist-500">
            Target durations for a focused build, not guaranteed delivery dates. Each phase has an
            explicit exit criterion, so nothing is declared finished because it looks finished.
          </p>
        </Reveal>

        <div className="mt-12 grid gap-4 lg:grid-cols-5">
          {ROADMAP.map((phase, i) => (
            <Reveal key={phase.phase} delay={i * 70}>
              <Panel className="group h-full p-5">
                <div className="flex items-baseline justify-between">
                  <span className="font-display text-[15px] font-semibold text-brand-400">{phase.phase}</span>
                  <span className="font-mono text-[10.5px] text-mist-600">{phase.window}</span>
                </div>
                <h3 className="mt-3 font-display text-[17px] text-paper-50">{phase.title}</h3>
                <ul className="mt-4 space-y-2">
                  {phase.items.map((item) => (
                    <li key={item} className="flex gap-2 text-[12.5px] leading-relaxed text-mist-500">
                      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-brand-500/70" />
                      {item}
                    </li>
                  ))}
                </ul>
                <div className="mt-5 border-t border-mist-500/12 pt-4">
                  <p className="rule-label text-mist-600">Exit criterion</p>
                  <p className="mt-1.5 text-[12.5px] leading-relaxed text-mist-400">{phase.exit}</p>
                </div>
                <div className="mt-4 h-px w-full bg-mist-500/12">
                  <div className="h-px w-0 bg-brand-500 transition-all duration-700 group-hover:w-full" />
                </div>
              </Panel>
            </Reveal>
          ))}
        </div>

        <Reveal delay={80}>
          <Panel hover={false} className="mt-6 p-6">
            <SectionLabel tone="mist">Launch vs later — capability matrix</SectionLabel>
            <div className="mt-6 overflow-x-auto scrollbar-thin">
              <table className="w-full min-w-[680px] text-left text-[13.5px]">
                <thead className="border-b border-mist-500/15">
                  <tr className="rule-label text-mist-600">
                    <th className="py-3 pr-6 font-normal">Capability</th>
                    <th className="py-3 pr-6 font-normal">In the MVP</th>
                    <th className="py-3 font-normal">Later phase</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["News and claim checks", "Yes — fact-check retrieval, search, deterministic decomposition", "Broader source coverage and image claim review"],
                    ["Website and scam checks", "Yes — safe URL reputation, DNS, TLS, page probe", "Continuous domain monitoring and alerting"],
                    ["Product identification", "Model, specification and checksum matching", "Manufacturer integrations and physical authentication workflows"],
                    ["Image analysis", "Container forensics, EXIF, C2PA and generator signatures", "Pixel-level forensics, duplicate detection and video workflows"],
                    ["Public API", "Internal API foundation with metering", "Customer API keys, quotas and billing"],
                    ["Bulk business checks", "No — provisioned manually on request", "Yes — batch endpoints and team dashboards"],
                    ["Advertising", "Deferred until original content and policies exist", "Optimised, responsibly placed, visually separated"],
                  ].map(([a, b, c]) => (
                    <tr key={a} className="border-b border-mist-500/8 last:border-0">
                      <td className="py-3.5 pr-6 text-paper-50">{a}</td>
                      <td className="py-3.5 pr-6 text-mist-400">{b}</td>
                      <td className="py-3.5 text-mist-500">{c}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-5 rounded-sm border border-warn-500/30 bg-warn-500/6 p-4 text-[13px] leading-relaxed text-mist-400">
              <span className="font-semibold text-warn-400">Important:</span> product lookup and
              product authentication are different services. The MVP compares a model against known
              specifications; it does not advertise guaranteed counterfeit detection without reliable
              evidence and appropriate manufacturer support.
            </p>
          </Panel>
        </Reveal>
      </section>

      {/* ============================== METRICS + CHECKLIST ============================== */}
      <section className="relative mt-28 border-y border-mist-500/12 bg-ink-900/50 py-24">
        <div className="relative mx-auto max-w-[1400px] px-5 sm:px-8">
          <Reveal>
            <SectionLabel>Quality gates</SectionLabel>
            <h2 className="mt-4 max-w-3xl font-display text-[clamp(1.9rem,4vw,3.1rem)] font-semibold leading-[1.05] tracking-tight text-paper-50">
              Measure whether it is useful, not whether it loads.
            </h2>
            <p className="mt-5 max-w-2xl text-[15px] leading-relaxed text-mist-500">
              Do not set an arbitrary accuracy target and assume it is met. Build a representative
              evaluation dataset, have the results reviewed, and report performance per category — a
              news verifier and a product identifier need different tests.
            </p>
          </Reveal>

          <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {METRICS.map(([name, desc], i) => (
              <Reveal key={name} delay={i * 45}>
                <div className="group h-full rounded-sm border border-mist-500/15 bg-ink-950/50 p-5 transition-colors hover:border-brand-500/50">
                  <span className="font-mono text-[11px] text-brand-400">{String(i + 1).padStart(2, "0")}</span>
                  <p className="mt-2.5 font-display text-[15px] text-paper-50">{name}</p>
                  <p className="mt-2 text-[12.5px] leading-relaxed text-mist-500">{desc}</p>
                </div>
              </Reveal>
            ))}
          </div>

          <div className="mt-8">
            <LaunchChecklist />
          </div>
        </div>
      </section>

      {/* ============================== RISKS ============================== */}
      <section className="relative mx-auto mt-28 max-w-[1400px] px-5 sm:px-8">
        <Reveal>
          <SectionLabel tone="brand">Risk register</SectionLabel>
          <h2 className="mt-4 max-w-3xl font-display text-[clamp(1.9rem,4vw,3.1rem)] font-semibold leading-[1.05] tracking-tight text-paper-50">
            What could go wrong, and the mitigation already built.
          </h2>
        </Reveal>
        <Reveal delay={80}>
          <Panel hover={false} className="mt-10 overflow-hidden">
            <div className="overflow-x-auto scrollbar-thin"><table className="w-full text-left">
              <thead className="border-b border-mist-500/15 bg-ink-900/60">
                <tr className="rule-label text-mist-600">
                  <th className="px-6 py-3.5 font-normal">Risk</th>
                  <th className="px-6 py-3.5 font-normal">Mitigation</th>
                </tr>
              </thead>
              <tbody>
                {RISKS.map(([risk, mitigation], i) => (
                  <tr key={risk} className={`group border-b border-mist-500/8 transition-colors last:border-0 hover:bg-risk-500/4 ${i % 2 ? "bg-ink-900/25" : ""}`}>
                    <td className="px-6 py-4 text-[14px] text-risk-400">{risk}</td>
                    <td className="px-6 py-4 text-[13.5px] leading-relaxed text-mist-400">{mitigation}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          </Panel>
        </Reveal>
        <Reveal delay={120}>
          <p className="mt-8 max-w-3xl border-l-2 border-brand-500/50 pl-5 text-[15px] leading-relaxed text-mist-400">
            The long-term advantage will not be the AI model. It will be the combination of source
            integrations, reliable evidence records, transparent results, product-data coverage and
            user trust — none of which can be copied overnight.
          </p>
        </Reveal>
      </section>

      {/* ============================== FAQ ============================== */}
      <section className="relative mt-28 border-t border-mist-500/12 bg-ink-900/40 py-24">
        <div className="relative mx-auto max-w-[1400px] px-5 sm:px-8">
          <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr]">
            <Reveal>
              <div className="lg:sticky lg:top-28">
                <SectionLabel tone="mist">Questions people actually ask</SectionLabel>
                <h2 className="mt-4 font-display text-[clamp(1.8rem,3.6vw,2.7rem)] font-semibold leading-[1.06] tracking-tight text-paper-50">
                  Straight answers, including the inconvenient ones.
                </h2>
                <div className="mt-8 flex flex-col gap-3">
                  <Link href="/legal/limitations" className="group inline-flex items-center gap-2 text-[14px] text-brand-400">
                    What SG16 cannot prove <IconArrow className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </Link>
                  <Link href="/legal/corrections" className="group inline-flex items-center gap-2 text-[14px] text-brand-400">
                    Corrections &amp; appeals process <IconArrow className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </Link>
                  <Link href="/legal/privacy" className="group inline-flex items-center gap-2 text-[14px] text-brand-400">
                    Privacy &amp; retention policy <IconArrow className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </Link>
                </div>
              </div>
            </Reveal>

            <div className="divide-y divide-mist-500/12 border-y border-mist-500/12">
              {FAQ.map((item, i) => (
                <Reveal key={item.q} delay={i * 40}>
                  <details className="group py-5">
                    <summary className="flex cursor-pointer list-none items-start justify-between gap-6 text-[16px] font-medium text-paper-50 transition-colors hover:text-brand-400">
                      {item.q}
                      <span className="mt-1 grid h-5 w-5 shrink-0 place-items-center rounded-sm border border-mist-500/30 text-mist-500 transition-transform duration-300 group-open:rotate-45">
                        <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" aria-hidden>
                          <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                        </svg>
                      </span>
                    </summary>
                    <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-mist-400">{item.a}</p>
                  </details>
                </Reveal>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ============================== CTA ============================== */}
      <section className="relative mt-24 overflow-hidden">
        <div className="grid-field pointer-events-none absolute inset-0 opacity-50" />
        <div className="pointer-events-none absolute left-1/2 top-0 h-[420px] w-[820px] -translate-x-1/2 rounded-full bg-brand-500/10 blur-[140px]" />
        <div className="relative mx-auto max-w-[1400px] px-5 py-24 sm:px-8">
          <div className="grid gap-12 lg:grid-cols-[1.2fr_1fr] lg:items-center">
            <Reveal>
              <IconSeal className="h-10 w-10 text-brand-400" />
              <h2 className="mt-6 font-display text-[clamp(2rem,4.6vw,3.4rem)] font-semibold leading-[1.03] tracking-tight text-paper-50">
                Check something now.
                <span className="block text-mist-500">It costs you nothing.</span>
              </h2>
              <p className="mt-6 max-w-xl text-[15.5px] leading-relaxed text-mist-400">
                Paste the link you were sent, the claim you cannot confirm, the model number on the
                box, or drop the image everyone is forwarding. You will get evidence, sources, a
                confidence figure — and an honest list of what SG16 could not check.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/identify" className="glow-accent group inline-flex items-center gap-2 rounded-sm bg-brand-cta px-6 py-3.5 text-[14px] font-semibold text-white transition-[transform,background-color] hover:-translate-y-0.5 hover:bg-brand-cta-hover">
                  Open the verification console <IconArrow className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Link>
                <Link href="/business" className="inline-flex items-center gap-2 rounded-sm border border-mist-500/25 px-6 py-3.5 text-[14px] text-mist-300 transition-colors hover:border-brand-500/50 hover:text-paper-50">
                  Business &amp; API access
                </Link>
              </div>
            </Reveal>
            <Reveal delay={100}>
              <Panel hover={false} className="p-7">
                <SectionLabel>Build notes</SectionLabel>
                <h3 className="mt-4 font-display text-xl text-paper-50">
                  Get the specification as it ships.
                </h3>
                <p className="mt-3 text-[13.5px] leading-relaxed text-mist-500">
                  Schema changes, provider decisions, evaluation results and the honest numbers behind
                  cost and accuracy.
                </p>
                <div className="mt-6">
                  <NewsletterForm />
                </div>
              </Panel>
            </Reveal>
          </div>
        </div>
      </section>
    </>
  );
}
