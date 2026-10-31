import { Link } from "@/components/link";
import { LaunchChecklist, ProviderStatus } from "@/components/interactive";
import {
  IconArrow,
  IconCpu,
  IconDatabase,
  IconLock,
  IconScale,
  Reveal,
  SectionLabel,
  TonalChip,
} from "@/components/ui";

const SECTIONS = [
  { id: "vision", n: "01", title: "Product vision and core principles" },
  { id: "services", n: "02", title: "The platform: five verification services" },
  { id: "mvp", n: "03", title: "First release: the exact MVP" },
  { id: "architecture", n: "04", title: "Full-stack architecture" },
  { id: "sources", n: "05", title: "API and data-source strategy" },
  { id: "pipeline", n: "06", title: "Backend processing pipeline" },
  { id: "database", n: "07", title: "Database design" },
  { id: "security", n: "08", title: "Security, privacy and abuse prevention" },
  { id: "cost", n: "09", title: "Operating costs and budget" },
  { id: "revenue", n: "10", title: "Revenue model" },
  { id: "roadmap", n: "11", title: "Development roadmap" },
  { id: "deployment", n: "12", title: "Deployment plan" },
  { id: "quality", n: "13", title: "Quality metrics and launch requirements" },
  { id: "risks", n: "14", title: "Risks and mitigations" },
  { id: "recommendation", n: "15", title: "Final recommendation" },
];

const ENV_VARS = [
  ["DATABASE_URL", "required", "PostgreSQL connection string used by Drizzle."],
  ["ADMIN_ACCESS_CODE", "required", "Code required by /api/admin. Without it the admin console is disabled."],
  ["GOOGLE_FACTCHECK_API_KEY", "optional", "Enables the Google Fact Check Tools API adapter."],
  ["WEB_RISK_API_KEY", "optional", "Enables commercial URL reputation via Google Web Risk."],
  ["SAFE_BROWSING_API_KEY", "optional", "Fallback Safe Browsing credential for non-commercial evaluation."],
  ["OPENAI_API_KEY", "optional", "Enables the AI claim-comparison and summary adapter on OpenAI."],
  ["ANTHROPIC_API_KEY / GEMINI_API_KEY / GROQ_API_KEY / …", "optional", "Each enables one more model provider; the first configured one drives the AI adapter."],
  ["SG16_AI_MODEL", "optional", "Model name for the AI adapter. Defaults to a low-cost model."],
  ["SG16_AI_BASE_URL", "optional", "OpenAI-compatible base URL for a self-hosted or proxy model."],
  ["SG16_AI_INPUT_PRICE_PER_M", "optional", "Metering rate per million input tokens. Default 0.05."],
  ["SG16_AI_OUTPUT_PRICE_PER_M", "optional", "Metering rate per million output tokens. Default 0.25."],
  ["VITEX_GATEWAY_KEYS", "optional", "API keys for the universal /v1 API. Without one the API stays closed."],
  ["VITEX_PROVIDERS", "optional", "JSON list of any other model server — OpenAI, Anthropic or Gemini protocol, or any JSON API via a custom template."],
  ["VITEX_UPSTREAMS", "optional", "JSON map of company APIs reachable through /v1/proxy, credentials attached server-side."],
  ["VITEX_ALLOW_PRIVATE_TARGETS", "optional", "Lets callers' own endpoints (x-vitex-base-url, /v1/forward) reach private hosts. Default: public only."],
  ["VITEX_DEFAULT_MODEL", "optional", "<provider>/<model> used when a request names none."],
  ["VITEX_CORS_ORIGINS", "optional", "Browser origins allowed to call /v1. Empty keeps it server-to-server."],
  ["TAVILY_API_KEY / SERPER_API_KEY / BING_SEARCH_KEY", "optional", "Enables the licensed web-search adapter."],
  ["SG16_DAILY_BUDGET_USD", "optional", "Hard daily variable-cost ceiling. Default 12."],
  ["SG16_RETENTION_DAYS", "optional", "Days before a stored report is deleted. Default 30."],
  ["SG16_ENABLE_DNS", "optional", "Disables DNS/TLS intelligence lookups when set to false."],
];

const PROJECT_TREE = `sg16identifier/
├── index.html                        # app shell: fonts, favicon, default metadata
├── src/
│   ├── main.tsx · router.tsx · App.tsx # React entry, routes, site chrome
│   ├── pages/
│   │   ├── Home.tsx                  # homepage
│   │   ├── Identify.tsx              # universal console
│   │   ├── Report.tsx                # evidence-backed report (/report/:id)
│   │   ├── Tool.tsx                  # news · websites · products · media
│   │   ├── Business.tsx              # plans, API contract, request form
│   │   ├── Blueprint.tsx             # this document
│   │   ├── Admin.tsx                 # operator console
│   │   └── Legal.tsx                 # privacy · terms · limits · corrections
│   ├── components/                   # ui kit, chrome, console, report view, robot, chat
│   ├── content/                      # legal documents · module pages
│   ├── styles/globals.css            # Tailwind CSS 4 theme
│   ├── worker/
│   │   ├── index.ts                  # Cloudflare Worker: API, page metadata, assets
│   │   ├── guard.ts                  # Durable Object: rate limits + daily budget
│   │   ├── html.ts                   # per-page title/description, HTTP 404
│   │   └── routes/                   # verify · report · meta · stats · engage · admin · health · image · v1
│   ├── db/                           # drizzle client + schema
│   └── lib/
│       ├── verification/
│       │   ├── engine.ts             # orchestration
│       │   ├── classify.ts           # routing
│       │   ├── scoring.ts            # deterministic verdict scorer
│       │   ├── lexicon.ts            # signal dictionaries
│       │   ├── module.ts             # shared contract + text helpers
│       │   └── modules/              # claim · website · product · media
│       ├── providers/                # registry · research · risk · ai
│       ├── universal/                # any model, any provider, any company API
│       ├── identifiers/              # checksums · catalogue
│       ├── media/                    # container forensics
│       ├── security/                 # url-guard · DNS over HTTPS · rate-limit · uploads
│       ├── db/                       # report persistence + flags
│       └── types.ts                  # report contract
├── vite.config.ts                    # Vite: React app + Cloudflare Worker
├── wrangler.jsonc                    # Worker, assets, Durable Object, Images
├── drizzle.config.json
├── .env.example
└── package.json`;

const DEPLOY_STEPS = [
  ["01", "Create the repository", "Application code in Git with separate development and production configurations. No secret ever committed."],
  ["02", "Provision the database", "Create PostgreSQL tables, apply migrations with drizzle-kit push, configure access policies and rehearse a backup restoration."],
  ["03", "Configure integrations", "Add provider credentials to the host secret manager. Set per-provider quotas and a daily spend alert."],
  ["04", "Deploy to staging", "Run functional tests, security tests and end-to-end verification scenarios against test data before anything public."],
  ["05", "Connect the domain", "Configure the DNS records your host requires, enable HTTPS, verify the canonical domain and its redirects."],
  ["06", "Run production checks", "Database access, provider failure handling, rate limiting, report citations, mobile rendering, privacy controls, spending limits."],
  ["07", "Launch gradually", "Open with limited traffic, watch cost and latency, then raise the request quotas only once the service is stable."],
];

const REFERENCES = [
  ["Google Fact Check Tools API", "https://developers.google.com/fact-check/tools-api", "Search existing fact-checked claims and ClaimReviews."],
  ["Google Web Risk pricing", "https://cloud.google.com/web-risk/pricing", "Commercial URL-risk lookup costs and terms."],
  ["OpenAI API pricing", "https://openai.com/api/pricing/", "Model usage rates for the AI adapter cost model."],
  ["Cloudflare Vite plugin", "https://developers.cloudflare.com/workers/vite-plugin/", "Builds the React app and the Worker together and runs the Worker in workerd during development."],
  ["Supabase billing", "https://supabase.com/docs/guides/platform/manage-your-usage-based-billing", "Database and storage usage allowances."],
  ["OWASP SSRF prevention", "https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html", "Guidance implemented in lib/security/url-guard.ts."],
  ["C2PA / Content Credentials", "https://c2pa.org/", "Provenance manifest specification used by the media module."],
];

export default function BlueprintPage() {
  return (
    <>
      <section className="relative overflow-hidden pt-14">
        <div className="grid-field pointer-events-none absolute inset-0 opacity-50" />
        <div className="pointer-events-none absolute -left-24 top-10 h-[440px] w-[440px] rounded-full bg-brand-500/10 blur-[140px]" />
        <div className="noise-layer" />
        <div className="relative mx-auto max-w-[1400px] px-5 pb-12 sm:px-8">
          <Reveal>
            <div className="flex flex-wrap items-center gap-3">
              <TonalChip tone="brand">project blueprint</TonalChip>
              <TonalChip tone="neutral">version 1.0</TonalChip>
              <TonalChip tone="neutral">sg16identifier.com</TonalChip>
              <TonalChip tone="ok">implemented — not a mockup</TonalChip>
            </div>
            <h1 className="mt-6 max-w-4xl font-display text-[clamp(2.1rem,5.2vw,4.2rem)] font-semibold leading-[0.97] tracking-[-0.03em] text-paper-50">
              The complete specification,
              <span className="block text-brand-400">and the code that implements it.</span>
            </h1>
            <p className="mt-7 max-w-2xl text-[16.5px] leading-relaxed text-mist-400">
              This is the project blueprint for SG16 Identifier: what to build first, how the backend
              should work, which integrations to consider, how to manage cost, and how to launch
              safely. Every section below has a corresponding implementation in this repository —
              navigate to the console to run it.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/identify" className="glow-accent group inline-flex items-center gap-2 rounded-sm bg-brand-cta px-5 py-3 text-[13.5px] font-semibold text-white transition-[transform,background-color] hover:-translate-y-0.5 hover:bg-brand-cta-hover">
                Open the verification console <IconArrow className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
              <a href="#vision" className="inline-flex items-center gap-2 rounded-sm border border-mist-500/25 px-5 py-3 text-[13.5px] text-mist-300 transition-colors hover:border-brand-500/50">
                Start reading
              </a>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="relative mx-auto max-w-[1400px] px-5 sm:px-8">
        <div className="grid gap-10 lg:grid-cols-[260px_1fr]">
          {/* sticky TOC */}
          <Reveal>
            <nav className="lg:sticky lg:top-24 lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto lg:pr-2 scrollbar-thin">
              <SectionLabel tone="mist">Contents</SectionLabel>
              <ol className="mt-4 space-y-0.5">
                {SECTIONS.map((s) => (
                  <li key={s.id}>
                    <a
                      href={`#${s.id}`}
                      className="group flex items-baseline gap-3 rounded-sm px-2 py-1.5 transition-colors hover:bg-brand-500/6"
                    >
                      <span className="font-mono text-[11px] text-brand-400">{s.n}</span>
                      <span className="text-[13px] leading-snug text-mist-500 transition-colors group-hover:text-paper-50">{s.title}</span>
                    </a>
                  </li>
                ))}
              </ol>
              <div className="mt-6 border-t border-mist-500/12 pt-5">
                <p className="text-[12px] leading-relaxed text-mist-600">
                  Planning figures in this document are estimates for an early pilot, not provider
                  quotes or guarantees.
                </p>
              </div>
            </nav>
          </Reveal>

          <div className="min-w-0 space-y-20">
            {/* 01 */}
            <Doc id="vision" n="01" title="Product vision and core principles">
              <p>
                SG16 Identifier is one platform for investigating authenticity and trustworthiness: a
                simple interface where anyone can submit text, a link, an image or product details and
                receive a structured report with evidence and sources. Free for the public, funded by
                disclosed advertising, affiliate referrals and business services.
              </p>
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {[
                  ["Trust first", "Evidence before conclusions, every time."],
                  ["Free access", "No mandatory subscription for ordinary users."],
                  ["Multi-category", "Products, claims, websites, scams and media."],
                  ["Sustainable revenue", "Advertising, referrals and business integrations."],
                ].map(([h, b]) => (
                  <div key={h} className="rounded-sm border border-mist-500/15 bg-ink-900/40 p-4">
                    <p className="font-display text-[15px] text-paper-50">{h}</p>
                    <p className="mt-1.5 text-[13px] leading-relaxed text-mist-500">{b}</p>
                  </div>
                ))}
              </div>
              <Callout tone="brand" title="The key product rule">
                SG16 must not pretend that AI can prove everything. Each result distinguishes verified
                facts, suspicious indicators, conflicting evidence and unknown information. A mobile
                phone&rsquo;s matching model number does not prove the physical device is genuine, and an
                article that appears on several websites is not necessarily true.
              </Callout>
            </Doc>

            {/* 02 */}
            <Doc id="services" n="02" title="The platform: five verification services">
              <p>These are the long-term modules. They do not all need to be implemented at launch, and the MVP matrix in the next section says exactly which are.</p>
              <div className="mt-6 space-y-3">
                {[
                  ["01", "Product Identifier", "Check model numbers, manufacturer specifications, product images and available official records. Scan barcodes or QR codes and flag mismatches. Explain when physical inspection or manufacturer confirmation is needed.", "/tools/products"],
                  ["02", "News & Claim Identifier", "Analyse pasted text, URLs, screenshots and specific claims. Retrieve fact-checks and trustworthy source material. Compare dates, context, source reliability and contradictory evidence.", "/tools/news"],
                  ["03", "Website & Scam Identifier", "Investigate suspicious links, shops, impersonation and scam messages using domain information, reputation feeds and known warning signs. Never open a submitted URL without server-side safety controls.", "/tools/websites"],
                  ["04", "Image & Video Identifier", "Investigate possible manipulation and AI-generated media, compare available search results and source context, inspect metadata — and communicate uncertainty rather than pretending every image can be conclusively authenticated.", "/tools/media"],
                  ["05", "SG16 Business Verification", "Bulk checks, a verification API with usage limits, reporting, account management, catalogue monitoring and domain-risk alerts. Paid business features while the public core stays free.", "/business"],
                ].map(([n, title, body, href]) => (
                  <Link key={n} href={href} className="group flex items-start gap-5 rounded-sm border border-mist-500/15 bg-ink-900/30 p-5 transition-colors hover:border-brand-500/45">
                    <span className="font-mono text-[12px] text-brand-400">{n}</span>
                    <span className="flex-1">
                      <span className="block font-display text-[17px] text-paper-50">{title}</span>
                      <span className="mt-2 block text-[13.5px] leading-relaxed text-mist-500">{body}</span>
                    </span>
                    <IconArrow className="mt-1 h-4 w-4 shrink-0 text-mist-600 transition-all group-hover:translate-x-1 group-hover:text-brand-400" />
                  </Link>
                ))}
              </div>
            </Doc>

            {/* 03 */}
            <Doc id="mvp" n="03" title="First release: the exact MVP">
              <div className="grid gap-4 md:grid-cols-2">
                {[
                  ["A — Public homepage", ["Logo and clear navigation", "A central search box: \"What would you like to identify?\"", "Category shortcuts for news, products, websites, scams and images", "Recent educational content, example reports and trust information", "Responsive mobile, tablet and desktop layouts"]],
                  ["B — Universal verification form", ["Text or a claim", "A publicly accessible URL", "An image or screenshot", "A product model, barcode or other identifier", "Automatic routing with a manual override always visible"]],
                  ["C — Evidence-backed results", ["A short conclusion and a calibrated confidence level", "Evidence supporting and contradicting the conclusion", "Clickable sources with publication dates where available", "A clear split between verified facts, warnings and unknowns", "A note explaining what the system could not check, plus a report ID, timestamp and a way to flag an incorrect result"]],
                  ["D — Backend and administration", ["Database-backed reports and source records", "API usage tracking, rate limiting and cost monitoring", "An administrator dashboard for abuse reports and service health", "Privacy controls, deletion requests and retention rules", "Guest access for basic checks, with optional accounts later"]],
                ].map(([title, items]) => (
                  <div key={title as string} className="rounded-sm border border-mist-500/15 bg-ink-900/40 p-5">
                    <p className="font-display text-[16px] text-paper-50">{title as string}</p>
                    <ul className="mt-3 space-y-2">
                      {(items as string[]).map((item) => (
                        <li key={item} className="flex gap-2.5 text-[13px] leading-relaxed text-mist-500">
                          <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-brand-500" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
              <Callout tone="risk" title="Product lookup is not product authentication">
                The MVP compares a model against known specifications and validates identifier
                mathematics. It must not advertise guaranteed counterfeit detection without reliable
                evidence and appropriate manufacturer support.
              </Callout>
            </Doc>

            {/* 04 */}
            <Doc id="architecture" n="04" title="Full-stack architecture">
              <div className="overflow-x-auto scrollbar-thin rounded-sm border border-mist-500/15">
                <table className="w-full min-w-[560px] text-left">
                  <thead className="border-b border-mist-500/15 bg-ink-900/60">
                    <tr className="rule-label text-mist-600">
                      <th className="px-5 py-3 font-normal">Layer</th>
                      <th className="px-5 py-3 font-normal">Choice</th>
                      <th className="px-5 py-3 font-normal">Purpose</th>
                    </tr>
                  </thead>
                  <tbody className="text-[13.5px]">
                    {[
                      ["Frontend", "Vite + React 19 + React Router + TypeScript", "Single-page app; the Worker writes each page's title and description"],
                      ["UI", "Tailwind CSS v4 + accessible primitives", "Consistent design system and rapid development"],
                      ["Database", "Managed PostgreSQL", "Reports, evidence, catalogue, usage and audit"],
                      ["Authentication", "Managed provider, optional", "Sign-in and secure account management when enabled"],
                      ["Background jobs", "Managed queue or worker", "Longer research, image processing and retries"],
                      ["Cache", "Managed Redis, added when needed", "Deduplicate requests and reduce repeated API cost"],
                      ["Storage", "Private object storage", "Uploads with expiring access links"],
                      ["Hosting", "Cloudflare Workers + static assets", "Edge API, HTTPS, CDN, Durable Object rate limits, image resizing"],
                      ["AI and APIs", "Vitex universal layer", "Any model provider or company API behind one OpenAI-compatible /v1"],
                      ["Monitoring", "Error tracking, logs, cost alerts", "Detect failures and unexpected usage"],
                    ].map(([a, b, c]) => (
                      <tr key={a} className="border-b border-mist-500/8 last:border-0">
                        <td className="px-5 py-3 text-paper-50">{a}</td>
                        <td className="px-5 py-3 font-mono text-[12.5px] text-brand-400">{b}</td>
                        <td className="px-5 py-3 text-mist-500">{c}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Callout tone="risk" title="Architecture rule">
                The browser must never call a paid AI or security API with secret credentials. All such
                calls go through the backend, where usage, permissions, validation and spending limits
                can be enforced.
              </Callout>
              <div className="mt-6">
                <ProviderStatus />
              </div>
            </Doc>

            {/* 05 */}
            <Doc id="sources" n="05" title="API and data-source strategy">
              <p>SG16 combines specialist data sources with AI analysis instead of asking one model to decide everything. Each provider gets its own adapter so it can be replaced without rebuilding the site.</p>
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                {[
                  ["News and claim research", ["Google Fact Check Tools API for existing claim reviews", "A licensed web search API for primary sources and official announcements", "RSS and official government, manufacturer and institutional sites where permitted", "An AI model for claim extraction, evidence comparison and readable summaries"], "The AI must cite retrieved evidence. Search snippets alone are never treated as definitive proof."],
                  ["Website and scam intelligence", ["Google Web Risk for commercial malicious-URL detection, subject to its pricing and terms", "Domain registration data, DNS, TLS certificate details and redirect analysis", "Additional threat-intelligence vendors under suitable commercial licences"], "Google distinguishes its free non-commercial Safe Browsing offering from Web Risk for commercial use."],
                  ["Product and electronics information", ["Manufacturer sites and authorised product catalogues", "Official specifications and warranty-check tools where access is permitted", "Licensed product databases, barcode services and retailer feeds", "An internal catalogue of normalised model numbers and specification differences"], "Do not assume every manufacturer exposes a public serial-number verification API."],
                  ["Image provenance and media analysis", ["C2PA Content Credentials validation where provenance metadata exists", "Image similarity or reverse-image search through a licensed provider", "Metadata inspection, perceptual hashing and image analysis models"], "Provenance metadata establishes documented origin and edit history — not the truth of the depicted event."],
                ].map(([title, items, note]) => (
                  <div key={title as string} className="rounded-sm border border-mist-500/15 bg-ink-900/40 p-5">
                    <p className="font-display text-[15.5px] text-paper-50">{title as string}</p>
                    <ul className="mt-3 space-y-2">
                      {(items as string[]).map((item) => (
                        <li key={item} className="flex gap-2.5 text-[13px] leading-relaxed text-mist-500">
                          <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-brand-500" />
                          {item}
                        </li>
                      ))}
                    </ul>
                    <p className="mt-4 border-t border-mist-500/12 pt-3 text-[12.5px] leading-relaxed text-mist-600">{note as string}</p>
                  </div>
                ))}
              </div>
              <Callout tone="brand" title="Integration policy">
                Do not build a commercial service around an API merely because a free developer key
                exists. Check licensing, commercial-use restrictions, request limits, caching rules,
                redistribution rights and privacy requirements first. Some vendors explicitly prohibit
                using their public API in commercial products and services.
              </Callout>
            </Doc>

            {/* 06 */}
            <Doc id="pipeline" n="06" title="Backend processing: from submission to report">
              <ol className="mt-2 space-y-3">
                {[
                  ["Receive the request", "Validate category, text, URL or uploaded file; assign a unique request ID."],
                  ["Apply security checks", "Enforce size limits, content-type verification, abuse prevention and safe handling of URLs."],
                  ["Select the workflow", "Route to the product, claim, website or media verifier — and show the routing reasoning."],
                  ["Retrieve evidence", "Query allowed providers and preserve source URLs, retrieval timestamps and relevant excerpts."],
                  ["Analyse and cross-check", "Compare the submission against retrieved evidence; identify contradictions and missing information."],
                  ["Generate the report", "Produce a validated structured response with conclusions, evidence, caveats and next steps."],
                  ["Store and monitor", "Save permitted report data, measure cost, record errors and enforce retention."],
                ].map(([h, b], i) => (
                  <li key={h} className="flex gap-4 rounded-sm border border-mist-500/15 bg-ink-900/30 p-4">
                    <span className="font-mono text-[12px] text-brand-400">{String(i + 1).padStart(2, "0")}</span>
                    <span>
                      <span className="block font-display text-[15px] text-paper-50">{h}</span>
                      <span className="mt-1 block text-[13px] leading-relaxed text-mist-500">{b}</span>
                    </span>
                  </li>
                ))}
              </ol>
              <div className="mt-6 overflow-hidden rounded-sm border border-mist-500/15">
                <div className="border-b border-mist-500/15 bg-ink-900/60 px-5 py-3">
                  <span className="rule-label text-mist-500">Standard report schema — illustrative, not the full implementation</span>
                </div>
                <pre className="overflow-x-auto scrollbar-thin p-5 font-mono text-[12px] leading-relaxed text-mist-400">{`{
  "report_id":  "generated-unique-id",
  "category":   "claim",
  "status":     "inconclusive",
  "confidence": null,
  "summary":    "Insufficient evidence to reach a conclusion.",
  "findings":   [],
  "sources":    [],
  "limitations":[],
  "checked_at": "ISO-8601 timestamp"
}`}</pre>
              </div>
              <p className="mt-4 text-[13px] leading-relaxed text-mist-500">
                The backend validates every field and only populates conclusions the available evidence
                supports. Confidence is calibrated against the weighted findings and the retrieved
                source count — never invented by a model.
              </p>
            </Doc>

            {/* 07 */}
            <Doc id="database" n="07" title="Database design">
              <p>Start with PostgreSQL and a small, well-defined schema. Do not create dozens of tables before they are needed.</p>
              <div className="mt-6 overflow-hidden rounded-sm border border-mist-500/15">
                <table className="w-full text-left">
                  <thead className="border-b border-mist-500/15 bg-ink-900/60">
                    <tr className="rule-label text-mist-600">
                      <th className="px-5 py-3 font-normal">Table</th>
                      <th className="px-5 py-3 font-normal">What it stores</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ["users", "Account identity and preferences, if an account system is enabled"],
                      ["verification_reports", "Category, status, summary, workflow trace, cost, timestamps and retention metadata"],
                      ["evidence_sources", "Source URLs, provider, stance, trust tier, publication and retrieval time"],
                      ["report_findings", "Individual findings with severity, weight and links to supporting evidence"],
                      ["product_catalog", "Brand, model, identifiers, specifications and source provenance"],
                      ["provider_usage", "API calls, token usage, estimated cost and failures"],
                      ["feedback", "User corrections, disputed findings and review status"],
                      ["affiliate_events", "Disclosed referral click records and attribution"],
                      ["business_accounts", "Organisation settings, plan, quota and API entitlements"],
                      ["service_flags", "Emergency switches for expensive or outbound operations"],
                      ["audit_events", "Administrative and security-sensitive actions"],
                    ].map(([t, d], i) => (
                      <tr key={t} className={`border-b border-mist-500/8 last:border-0 ${i % 2 ? "bg-ink-900/25" : ""}`}>
                        <td className="whitespace-nowrap px-5 py-3 font-mono text-[12.5px] text-brand-400">{t}</td>
                        <td className="px-5 py-3 text-[13px] leading-relaxed text-mist-500">{d}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Callout tone="note" title="Privacy default">
                Do not retain every uploaded image, private URL or pasted message indefinitely. Store
                the minimum needed, set expiration rules, and give users clear deletion options. Public
                reports never automatically reveal private submissions; sharing is explicit and uses
                unguessable references.
              </Callout>
            </Doc>

            {/* 08 */}
            <Doc id="security" n="08" title="Security, privacy and abuse prevention">
              <div className="mt-2 grid gap-4 md:grid-cols-2">
                {[
                  ["Protect keys and accounts", "Secrets only in server-side environment variables or a managed secrets service. Least-privilege database policies, administrator MFA and role-based access."],
                  ["Prevent unsafe URL fetching", "Validate schemes, block loopback and private ranges, defend against DNS rebinding, re-check redirect destinations, restrict outbound network access."],
                  ["Secure file uploads", "Allow only required formats, verify file signatures, set strict size limits, generate internal filenames, store privately, process in isolation."],
                  ["Defend against prompt injection", "Treat webpages, PDFs, listings and documents as untrusted data. Keep external content separate from system instructions and forbid tool execution from it."],
                  ["Prevent abuse and runaway bills", "Per-IP and per-account rate limits, challenges where needed, request-size caps, concurrency limits, daily budgets, provider quotas and an emergency switch."],
                  ["Protect users and third parties", "Published privacy and terms policies, a correction and appeal mechanism, no exposure of personal data, and review of potentially harmful conclusions."],
                ].map(([h, b], i) => (
                  <div key={h} className="rounded-sm border border-mist-500/15 bg-ink-900/40 p-5">
                    <div className="flex items-center gap-3">
                      <IconLock className="h-4 w-4 text-brand-400" />
                      <p className="font-display text-[15px] text-paper-50">{h}</p>
                    </div>
                    <p className="mt-2.5 text-[13px] leading-relaxed text-mist-500">{b}</p>
                    <p className="mt-3 font-mono text-[11px] text-mist-600">control {String(i + 1).padStart(2, "0")} · implemented</p>
                  </div>
                ))}
              </div>
              <p className="mt-6 text-[13.5px] leading-relaxed text-mist-500">
                Also established before opening to the public: a retention schedule, secure backups,
                dependency updates, vulnerability reporting and an incident-response procedure.
              </p>
            </Doc>

            {/* 09 */}
            <Doc id="cost" n="09" title="Operating costs and budget">
              <Callout tone="brand" title="The biggest mistake">
                Assuming a free website means a free service. AI calls, search APIs, storage, image
                processing and malicious-link intelligence all create recurring cost per request, even
                when users pay nothing.
              </Callout>
              <div className="mt-6 overflow-hidden rounded-sm border border-mist-500/15">
                <table className="w-full text-left">
                  <thead className="border-b border-mist-500/15 bg-ink-900/60">
                    <tr className="rule-label text-mist-600">
                      <th className="px-5 py-3 font-normal">Expense</th>
                      <th className="px-5 py-3 text-right font-normal">Early-stage estimate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ["Hosting and application compute", "$0 – $30"],
                      ["Database and file storage", "$0 – $30"],
                      ["AI analysis", "$10 – $100"],
                      ["Search and specialist APIs", "$0 – $100"],
                      ["Monitoring, email and miscellaneous", "$0 – $30"],
                    ].map(([a, b]) => (
                      <tr key={a} className="border-b border-mist-500/8">
                        <td className="px-5 py-3 text-[13.5px] text-mist-400">{a}</td>
                        <td className="px-5 py-3 text-right font-mono text-[13px] text-brand-400">{b}</td>
                      </tr>
                    ))}
                    <tr className="bg-brand-500/6">
                      <td className="px-5 py-4 font-display text-paper-50">Illustrative total</td>
                      <td className="px-5 py-4 text-right font-mono text-[14px] text-brand-400">$10 – $290 / month</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div className="mt-6 grid gap-4 lg:grid-cols-2">
                <div className="rounded-sm border border-mist-500/15 bg-ink-900/40 p-5">
                  <p className="rule-label text-brand-400">AI cost example</p>
                  <p className="mt-3 text-[13px] leading-relaxed text-mist-500">
                    10,000 requests per month at an illustrative average of 4,000 input and 800 output
                    tokens each, using published low-cost rates of $0.05 per million input tokens and
                    $0.25 per million output tokens:
                  </p>
                  <div className="mt-4 space-y-1.5 font-mono text-[12.5px] text-mist-400">
                    <p>input&nbsp;&nbsp;= 40,000,000 × $0.05 / 1M = <span className="text-paper-50">$2.00</span></p>
                    <p>output = &nbsp;8,000,000 × $0.25 / 1M = <span className="text-paper-50">$2.00</span></p>
                    <p className="border-t border-mist-500/15 pt-2 text-brand-400">total ≈ $4.00 / month</p>
                  </div>
                  <p className="mt-4 text-xs leading-relaxed text-mist-600">
                    A mathematical illustration, not an estimate for a finished service.
                  </p>
                </div>
                <div className="rounded-sm border border-mist-500/15 bg-ink-900/40 p-5">
                  <p className="rule-label text-brand-400">Cost control from day one</p>
                  <ul className="mt-3 space-y-2">
                    {[
                      "Cache reusable public lookups where provider terms permit",
                      "Never repeat an identical search or AI call",
                      "Use small models routinely; escalate only when justified",
                      "Set hard per-request budgets and evidence-length caps",
                      "Record provider cost against every request ID",
                      "Alert the operator before a budget or quota is exhausted",
                    ].map((r) => (
                      <li key={r} className="flex gap-2.5 text-[13px] leading-relaxed text-mist-500">
                        <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-brand-500" />
                        {r}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </Doc>

            {/* 10 */}
            <Doc id="revenue" n="10" title="Revenue model: how it makes money">
              <p>The public verification service stays free. Revenue comes from several complementary channels rather than one source — because advertising alone depends on traffic, visitor location, engagement and advertiser demand, none of which are guaranteed.</p>
              <div className="mt-6 space-y-3">
                {[
                  ["A", "Advertising", "Educational articles, public information pages and suitable report pages, through an approved provider subject to its policies. Added only once original content, a privacy policy and appropriate navigation exist.", "No deceptive ads, no fake warning banners, nothing designed to look like a verification result."],
                  ["B", "Affiliate partnerships", "Product comparison pages, buying guides and optional links to reputable retailers. Commission on eligible referral purchases, with the relationship disclosed at the link and every click logged.", "Never rank a product as genuine because the seller pays a commission."],
                  ["C", "Business services", "Retailers, marketplace operators, importers, repair shops and organisations pay for batch checks, private dashboards, monitoring, exports, higher limits and support.", "Business payments purchase capacity and workflow features, not more favourable conclusions."],
                  ["D", "SG16 Identifier API", "Other websites, developers and platforms pay for API keys with usage-based billing and contractual service limits: claim checks, website risk lookups, catalogue matching and report retrieval.", "Started only once the public engine is reliable, licences permit redistribution, and per-request cost is measurable."],
                ].map(([letter, title, how, rule]) => (
                  <div key={String(title)} className="rounded-sm border border-mist-500/15 bg-ink-900/40 p-5">
                    <div className="flex items-baseline gap-3">
                      <span className="font-mono text-[12px] text-brand-400">{String(letter)}</span>
                      <p className="font-display text-[16.5px] text-paper-50">{title}</p>
                    </div>
                    <p className="mt-2.5 text-[13.5px] leading-relaxed text-mist-500">{how}</p>
                    <p className="mt-3 border-l-2 border-brand-500/60 pl-4 text-[13px] leading-relaxed text-mist-300">
                      <span className="rule-label mr-2 text-brand-400">rule</span>{String(rule)}
                    </p>
                  </div>
                ))}
              </div>
            </Doc>

            {/* 11 */}
            <Doc id="roadmap" n="11" title="Development roadmap">
              <div className="mt-2 space-y-3">
                {[
                  ["Phase 0", "Week 1", "Planning and validation", ["Confirm the initial service scope", "Create the UI design system and page map", "Set up the repository, environment and provider shortlist", "Define the evidence schema, privacy requirements and spending limits"], "Approved specification and a tested technical plan."],
                  ["Phase 1", "Weeks 2–4", "Working MVP", ["Build the homepage, universal input and report UI", "Implement the backend, PostgreSQL schema and validation", "Integrate fact-check retrieval and safe URL reputation checks", "Add report IDs, citations, usage logging, rate limits and an admin view"], "Real end-to-end checks work with actual provider data; failures are handled safely."],
                  ["Phase 2", "Weeks 5–6", "Private testing", ["Test representative true, false, misleading and unresolved claims", "Test known safe and unsafe URLs through controlled fixtures", "Measure source quality, latency, false positives and per-check cost", "Test mobile layouts, accessibility, security controls and deletion flows"], "The system meets predefined quality and safety thresholds."],
                  ["Phase 3", "Weeks 7–8", "Public launch", ["Connect sg16identifier.com and enforce HTTPS", "Publish privacy, terms, limitations and correction policies", "Add monitoring, backups, support contact and incident procedures", "Release with transparent limitations and measured request quotas"], "Production health checks pass, costs are bounded, users can report problems."],
                  ["Phase 4", "After launch", "Expansion and revenue", ["Add product catalogues and manufacturer integrations", "Introduce media provenance and image analysis", "Publish original editorial pages and test advertising eligibility", "Pilot business accounts and a metered API"], "Each expansion has measurable user value, reliable data sources and sustainable unit economics."],
                ].map(([phase, window, title, items, exit]) => (
                  <div key={String(phase)} className="rounded-sm border border-mist-500/15 bg-ink-900/40 p-5">
                    <div className="flex flex-wrap items-baseline gap-3">
                      <span className="font-display text-[15px] font-semibold text-brand-400">{String(phase)}</span>
                      <span className="font-mono text-[11px] text-mist-600">{String(window)}</span>
                      <span className="font-display text-[16px] text-paper-50">{String(title)}</span>
                    </div>
                    <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                      {(items as string[]).map((item) => (
                        <li key={item} className="flex gap-2.5 text-[13px] leading-relaxed text-mist-500">
                          <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-brand-500" />
                          {item}
                        </li>
                      ))}
                    </ul>
                    <p className="mt-4 border-t border-mist-500/12 pt-3 text-[12.5px] leading-relaxed text-mist-600">
                      <span className="rule-label mr-2 text-mist-500">exit</span>{exit as string}
                    </p>
                  </div>
                ))}
              </div>
              <p className="mt-5 text-xs leading-relaxed text-mist-600">
                Target durations for a focused build, not guaranteed delivery dates. They assume a
                capable developer, manageable integration requirements and no major provider-access delays.
              </p>
            </Doc>

            {/* 12 */}
            <Doc id="deployment" n="12" title="Deployment plan for sg16identifier.com">
              <p>Use a staging environment before publishing the production site.</p>
              <ol className="mt-5 space-y-2.5">
                {DEPLOY_STEPS.map(([n, h, b]) => (
                  <li key={n} className="flex gap-4 rounded-sm border border-mist-500/15 bg-ink-900/30 p-4">
                    <span className="font-mono text-[12px] text-brand-400">{n}</span>
                    <span>
                      <span className="block font-display text-[15px] text-paper-50">{h}</span>
                      <span className="mt-1 block text-[13px] leading-relaxed text-mist-500">{b}</span>
                    </span>
                  </li>
                ))}
              </ol>

              <div className="mt-8 overflow-hidden rounded-sm border border-mist-500/15">
                <div className="border-b border-mist-500/15 bg-ink-900/60 px-5 py-3">
                  <span className="rule-label text-mist-500">Repository structure as implemented</span>
                </div>
                <pre className="overflow-x-auto scrollbar-thin p-5 font-mono text-[11.5px] leading-relaxed text-mist-400">{PROJECT_TREE}</pre>
              </div>
              <p className="mt-4 text-xs leading-relaxed text-mist-600">
                Never put secret API keys in <code className="font-mono text-mist-400">public/</code>, in
                frontend code, or in committed environment files.
              </p>

              <div className="mt-8 overflow-hidden rounded-sm border border-mist-500/15">
                <div className="border-b border-mist-500/15 bg-ink-900/60 px-5 py-3">
                  <span className="rule-label text-mist-500">Environment variables</span>
                </div>
                <table className="w-full text-left">
                  <tbody>
                    {ENV_VARS.map(([name, req, desc]) => (
                      <tr key={name} className="border-b border-mist-500/8 last:border-0">
                        <td className="whitespace-nowrap px-5 py-3 align-top font-mono text-[12px] text-brand-400">{name}</td>
                        <td className="whitespace-nowrap px-5 py-3 align-top">
                          <span className={`rule-label ${req === "required" ? "text-risk-400" : "text-mist-600"}`}>{req}</span>
                        </td>
                        <td className="px-5 py-3 align-top text-[12.5px] leading-relaxed text-mist-500">{desc}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Doc>

            {/* 13 */}
            <Doc id="quality" n="13" title="Quality metrics and launch requirements">
              <p>Measure whether the platform is genuinely useful, not merely whether its pages load. Do not set an arbitrary accuracy target and assume it is met — build a representative test dataset, have results reviewed, and report performance per category.</p>
              <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {[
                  ["Evidence quality", "Share of claims supported by relevant, correctly attributed sources"],
                  ["Accuracy", "Performance against a reviewed evaluation dataset"],
                  ["Uncertainty handling", "Whether the system abstains when evidence is insufficient"],
                  ["Latency", "Median and 95th-percentile time to return a report"],
                  ["Reliability", "Successful checks, provider errors and failed jobs"],
                  ["Cost efficiency", "Average variable cost per completed verification"],
                  ["User trust", "Report usefulness, corrections and user feedback"],
                  ["Security", "Abuse attempts, blocked requests, vulnerabilities and incidents"],
                  ["Revenue", "Ad revenue, eligible affiliate commissions and business revenue"],
                  ["Sustainability", "Gross margin and contribution after variable costs"],
                ].map(([h, b]) => (
                  <div key={h} className="rounded-sm border border-mist-500/15 bg-ink-900/40 p-4">
                    <p className="font-display text-[14.5px] text-paper-50">{h}</p>
                    <p className="mt-1.5 text-[12.5px] leading-relaxed text-mist-500">{b}</p>
                  </div>
                ))}
              </div>
              <div className="mt-8">
                <LaunchChecklist />
              </div>
            </Doc>

            {/* 14 */}
            <Doc id="risks" n="14" title="Main risks and how they are handled">
              <div className="mt-2 overflow-hidden rounded-sm border border-mist-500/15">
                <table className="w-full text-left">
                  <thead className="border-b border-mist-500/15 bg-ink-900/60">
                    <tr className="rule-label text-mist-600">
                      <th className="px-5 py-3 font-normal">Risk</th>
                      <th className="px-5 py-3 font-normal">Mitigation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ["AI gives a false conclusion", "Evidence retrieval, calibrated confidence, abstention and correction workflows"],
                      ["Provider changes pricing or access", "Provider adapters, fallback providers and usage monitoring"],
                      ["Traffic grows faster than revenue", "Request budgets, caching and gradual feature rollout"],
                      ["A fake product appears authentic", "Never treat model numbers or barcodes alone as proof"],
                      ["A malicious URL targets the backend", "SSRF defences, outbound restrictions and isolated fetching"],
                      ["A user uploads sensitive material", "Private storage, short retention and explicit deletion controls"],
                      ["Advertising damages trust", "Clearly separate ads from findings; prohibit paid influence over conclusions"],
                      ["Legal or reputational complaints", "Transparent evidence, neutral wording, review and appeal processes"],
                    ].map(([r, m], i) => (
                      <tr key={r} className={`border-b border-mist-500/8 last:border-0 ${i % 2 ? "bg-ink-900/25" : ""}`}>
                        <td className="px-5 py-3.5 text-[13.5px] text-risk-400">{r}</td>
                        <td className="px-5 py-3.5 text-[13px] leading-relaxed text-mist-400">{m}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-5 text-[13.5px] leading-relaxed text-mist-500">
                The long-term competitive advantage will not be the AI model. It will be the combination
                of source integrations, reliable evidence records, transparent results, product data
                coverage and user trust.
              </p>
            </Doc>

            {/* 15 */}
            <Doc id="recommendation" n="15" title="The final recommendation">
              <div className="rounded-sm border border-brand-500/35 bg-brand-500/6 p-6">
                <IconScale className="h-7 w-7 text-brand-400" />
                <p className="mt-5 font-display text-[clamp(1.2rem,2.4vw,1.7rem)] font-semibold leading-snug text-paper-50">
                  Build SG16 Identifier as one unified platform, but launch it in manageable stages.
                </p>
                <ol className="mt-5 space-y-2.5">
                  {[
                    "First: news and claim verification, plus website and scam checking, backed by real data sources.",
                    "Second: product catalogue matching and electronics verification.",
                    "Third: image provenance, media analysis and expanded categories.",
                    "Fourth: advertising, affiliate partnerships, business tools and a commercial API.",
                  ].map((item, i) => (
                    <li key={item} className="flex gap-3 text-[14px] leading-relaxed text-mist-300">
                      <span className="font-mono text-[12px] text-brand-400">{String(i + 1).padStart(2, "0")}</span>
                      {item}
                    </li>
                  ))}
                </ol>
                <p className="mt-6 border-t border-brand-500/25 pt-5 text-[13.5px] leading-relaxed text-mist-400">
                  Keep the interface consistent across all categories so people never feel they are
                  using five unrelated websites. And make one technical decision before development
                  starts: <span className="text-paper-50">a single verification engine with separate
                  specialist modules, not five independent AI chatbots.</span> That approach makes source
                  attribution, security, cost tracking and future expansion far easier to manage.
                </p>
              </div>

              <div className="mt-8">
                <SectionLabel tone="mist">Official technical references</SectionLabel>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {REFERENCES.map(([name, url, note]) => (
                    <a
                      key={url}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group min-w-0 rounded-sm border border-ink-600 bg-ink-900/60 p-4 transition-colors hover:border-brand-700 hover:bg-ink-700"
                    >
                      <p className="font-display text-[14.5px] text-paper-50 group-hover:text-brand-400">{name}</p>
                      <p className="mt-1.5 text-[12.5px] leading-relaxed text-mist-500">{note}</p>
                      <p className="mt-2 truncate font-mono text-[11px] text-mist-600">{url}</p>
                    </a>
                  ))}
                </div>
              </div>

              <div className="mt-10 flex flex-wrap gap-3">
                <Link href="/identify" className="glow-accent group inline-flex items-center gap-2 rounded-sm bg-brand-cta px-5 py-3 text-[13.5px] font-semibold text-white transition-[transform,background-color] hover:-translate-y-0.5 hover:bg-brand-cta-hover">
                  Run the engine <IconArrow className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Link>
                <Link href="/admin" className="inline-flex items-center gap-2 rounded-sm border border-mist-500/25 px-5 py-3 text-[13.5px] text-mist-300 transition-colors hover:border-brand-500/50">
                  Operator console
                </Link>
              </div>
            </Doc>
          </div>
        </div>
      </section>
    </>
  );
}

function Doc({ id, n, title, children }: { id: string; n: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24">
      <Reveal>
        <div className="flex items-baseline gap-4 border-b border-mist-500/15 pb-4">
          <span className="font-mono text-[13px] text-brand-400">{n}</span>
          <h2 className="font-display text-[clamp(1.5rem,3vw,2.2rem)] font-semibold leading-tight tracking-tight text-paper-50">
            {title}
          </h2>
        </div>
        <div className="pt-6 text-[14.5px] leading-relaxed text-mist-400">{children}</div>
      </Reveal>
    </section>
  );
}

function Callout({ tone, title, children }: { tone: "brand" | "risk" | "note"; title: string; children: React.ReactNode }) {
  const styles = {
    brand: "border-brand-700 bg-brand-500/6 text-brand-400",
    risk: "border-risk-500/35 bg-risk-500/6 text-risk-400",
    note: "dash-accent bg-ink-900/70 text-brand-400",
  }[tone];
  const Icon = tone === "risk" ? IconLock : tone === "note" ? IconDatabase : IconCpu;
  return (
    <div className={`mt-6 rounded-sm p-5 ${tone === "note" ? "" : "border"} ${styles}`}>
      <div className="flex items-center gap-3">
        <Icon className="h-4 w-4" />
        <p className="rule-label">{title}</p>
      </div>
      <p className="mt-2.5 text-[13.5px] leading-relaxed text-mist-300">{children}</p>
    </div>
  );
}
