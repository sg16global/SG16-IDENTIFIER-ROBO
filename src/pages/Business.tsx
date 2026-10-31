import { Link } from "@/components/link";
import { BusinessRequestForm } from "@/components/interactive";
import {
  IconArrow,
  IconChart,
  IconCpu,
  IconDatabase,
  IconLock,
  IconScale,
  IconSeal,
  Panel,
  Reveal,
  SectionLabel,
  TonalChip,
} from "@/components/ui";

const PLANS = [
  {
    name: "Starter",
    price: "$30",
    unit: "per month",
    quota: "1,000 checks",
    for: "Repair shops, small retailers, solo investigators",
    features: [
      "1,000 verification checks per month across all four modules",
      "Batch upload of up to 50 identifiers per run",
      "CSV export of findings, evidence and provider costs",
      "Email support with a 2-business-day target",
    ],
    cta: "Request access",
    highlight: false,
  },
  {
    name: "Growth",
    price: "$180",
    unit: "per month",
    quota: "10,000 checks",
    for: "Marketplaces, importers, mid-size e-commerce",
    features: [
      "10,000 checks per month with rollover of unused allowance",
      "Scheduled catalogue monitoring and domain-risk alerts",
      "Private team dashboard with role-based access and audit trail",
      "Webhook delivery of finished reports",
      "Priority support with a 4-hour target",
    ],
    cta: "Request access",
    highlight: true,
  },
  {
    name: "Scale",
    price: "$1,200",
    unit: "per month",
    quota: "100,000 checks",
    for: "Platforms, insurers, customs and enforcement partners",
    features: [
      "100,000 checks per month, volume-priced beyond that",
      "Dedicated provider budgets and custom adapter configuration",
      "SSO, data-processing agreement and named security contact",
      "On-premise or private-cloud deployment of the engine",
      "Quarterly evaluation reports against a shared test set",
    ],
    cta: "Talk to us",
    highlight: false,
  },
];

const API_ENDPOINTS = [
  { method: "POST", path: "/v1/verify", body: '{ "input": "…", "category": "auto|claim|website|product|media" }', out: "Report object with findings, sources, confidence and limitations." },
  { method: "GET", path: "/v1/reports/{public_id}", body: "—", out: "A stored report, identical in shape to the public report page." },
  { method: "POST", path: "/v1/verify:batch", body: '{ "items": [ … ], "category": "product" }', out: "Job reference; results delivered by webhook or polling." },
  { method: "GET", path: "/v1/usage", body: "—", out: "Calls, tokens and metered cost for the current billing period." },
  { method: "POST", path: "/v1/monitors", body: '{ "target": "…", "cadence": "daily" }', out: "A recurring domain or catalogue watch with alert configuration." },
  { method: "GET", path: "/v1/catalog/{brand}/{model}", body: "—", out: "The normalised record SG16 matched against, with its provenance." },
];

const SEPARATIONS = [
  ["Public core stays free", "Products, news, websites and media checks never require a subscription. That is what attracts traffic and builds trust, and it is not a trial."],
  ["Businesses buy capacity", "Higher limits, batch endpoints, monitoring, dashboards, exports and support. Nothing that changes what a check concludes."],
  ["Conclusions are not for sale", "No customer, advertiser or affiliate partner can influence a verdict, a confidence figure, a ranking or a recommendation. The separation is contractual."],
  ["Every referral is logged", "Affiliate clicks are recorded in affiliate_events with the destination and the report they came from, so commercial influence is auditable rather than asserted."],
];

export default function BusinessPage() {
  return (
    <>
      <section className="relative overflow-hidden pt-14">
        <div className="grid-field pointer-events-none absolute inset-0 opacity-50" />
        <div className="pointer-events-none absolute right-0 top-0 h-[460px] w-[460px] rounded-full bg-brand-500/8 blur-[140px]" />
        <div className="noise-layer" />
        <div className="relative mx-auto max-w-[1400px] px-5 pb-14 sm:px-8">
          <div className="grid gap-12 lg:grid-cols-[1.15fr_0.85fr] lg:items-end">
            <Reveal>
              <div className="flex flex-wrap items-center gap-3">
                <TonalChip tone="brand">public service stays free</TonalChip>
                <TonalChip tone="neutral">service 05</TonalChip>
              </div>
              <h1 className="mt-6 font-display text-[clamp(2.1rem,5vw,4rem)] font-semibold leading-[0.98] tracking-[-0.03em] text-paper-50">
                Pay for capacity.
                <span className="text-accent-gradient block pb-[0.08em]">Never for a conclusion.</span>
              </h1>
              <p className="mt-6 max-w-2xl text-[16.5px] leading-relaxed text-mist-400">
                Retailers, marketplaces, importers and repair networks need to check hundreds of
                listings, domains and identifiers a day, with an audit trail and a budget they can
                forecast. SG16 Business Verification is the same engine the public uses — with volume,
                monitoring, export and support around it.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <a href="#request" className="group inline-flex items-center gap-2 glow-accent rounded-sm bg-brand-cta px-6 py-3.5 text-[14px] font-semibold text-white transition-[transform,background-color] hover:-translate-y-0.5 hover:bg-brand-cta-hover">
                  Request access <IconArrow className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </a>
                <Link href="/blueprint" className="inline-flex items-center gap-2 rounded-sm border border-brand-700 bg-ink-950 px-6 py-3.5 text-[14px] text-paper-50 transition-colors hover:border-brand-500 hover:text-brand-400">
                  Read the technical blueprint
                </Link>
              </div>
            </Reveal>

            <Reveal delay={110}>
              <Panel hover={false} className="p-6">
                <SectionLabel>Why organisations pay</SectionLabel>
                <ul className="mt-5 space-y-4">
                  {[
                    ["Volume", "A rate limit that protects a free public service cannot also serve a marketplace ingest pipeline."],
                    ["Continuity", "A one-off check answers today's question. Monitoring answers it every day on a schedule."],
                    ["Accountability", "Exports, audit trails and stored evidence let you defend a delisting decision to a seller."],
                    ["Integration", "A stable report schema means one integration covers all four verification modules."],
                  ].map(([head, body]) => (
                    <li key={head} className="border-l border-brand-500/50 pl-4">
                      <p className="font-display text-[15px] text-paper-50">{head}</p>
                      <p className="mt-1 text-[13px] leading-relaxed text-mist-500">{body}</p>
                    </li>
                  ))}
                </ul>
              </Panel>
            </Reveal>
          </div>
        </div>
      </section>

      <section className="relative mx-auto max-w-[1400px] px-5 sm:px-8">
        <Reveal>
          <SectionLabel tone="mist">The separation that keeps the public service honest</SectionLabel>
        </Reveal>
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {SEPARATIONS.map(([title, body], i) => (
            <Reveal key={title} delay={i * 60}>
              <Panel className="group h-full p-6">
                <div className="flex items-start gap-4">
                  <IconScale className="mt-0.5 h-5 w-5 shrink-0 text-brand-400" />
                  <div>
                    <h3 className="font-display text-[17px] text-paper-50">{title}</h3>
                    <p className="mt-2 text-[13.5px] leading-relaxed text-mist-500">{body}</p>
                  </div>
                </div>
              </Panel>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="relative mx-auto mt-28 max-w-[1400px] px-5 sm:px-8">
        <Reveal>
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <SectionLabel>Plans</SectionLabel>
              <h2 className="mt-4 font-display text-[clamp(1.8rem,3.6vw,2.8rem)] font-semibold leading-tight tracking-tight text-paper-50">
                Metered, forecastable, no per-seat theatre.
              </h2>
            </div>
            <p className="max-w-md text-sm leading-relaxed text-mist-500">
              Pricing below is a planning framework for the post-launch commercial phase. Access is
              provisioned manually against a contract while volume and per-request cost are still
              being measured.
            </p>
          </div>
        </Reveal>

        <div className="mt-10 grid gap-5 lg:grid-cols-3">
          {PLANS.map((plan, i) => (
            <Reveal key={plan.name} delay={i * 70}>
              <Panel
                hover={false}
                className={`relative h-full p-7 ${plan.highlight ? "card-feature bg-brand-500/4" : ""}`}
              >
                {plan.highlight && (
                  <span className="absolute right-6 top-6">
                    <TonalChip tone="brand">most requested</TonalChip>
                  </span>
                )}
                <p className="rule-label text-mist-500">{plan.name}</p>
                <p className="mt-4 flex items-baseline gap-2">
                  <span className="font-display text-[42px] font-semibold leading-none text-paper-50">{plan.price}</span>
                  <span className="text-[13px] text-mist-500">{plan.unit}</span>
                </p>
                <p className="mt-3 font-mono text-[12px] text-brand-400">{plan.quota}</p>
                <p className="mt-4 text-[13px] leading-relaxed text-mist-500">{plan.for}</p>
                <ul className="mt-6 space-y-3 border-t border-mist-500/12 pt-6">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex gap-3 text-[13.5px] leading-relaxed text-mist-300">
                      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-brand-500" />
                      {feature}
                    </li>
                  ))}
                </ul>
                <a
                  href="#request"
                  className={`mt-8 inline-flex w-full items-center justify-center gap-2 rounded-sm px-5 py-3 text-[13.5px] font-semibold transition-transform hover:-translate-y-0.5 ${
                    plan.highlight ? "glow-accent bg-brand-cta text-white hover:bg-brand-cta-hover" : "border border-ink-500 bg-ink-900 text-paper-50 hover:border-brand-500/60 hover:text-brand-400"
                  }`}
                >
                  {plan.cta} <IconArrow className="h-4 w-4" />
                </a>
              </Panel>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="relative mt-28 border-y border-mist-500/12 bg-ink-900/50 py-24">
        <div className="relative mx-auto max-w-[1400px] px-5 sm:px-8">
          <div className="grid gap-12 lg:grid-cols-[1fr_1.15fr] [&>*]:min-w-0">
            <Reveal>
              <div className="lg:sticky lg:top-28">
                <SectionLabel>SG16 Identifier API</SectionLabel>
                <h2 className="mt-4 font-display text-[clamp(1.8rem,3.6vw,2.7rem)] font-semibold leading-[1.06] tracking-tight text-paper-50">
                  The same report schema the public site renders.
                </h2>
                <p className="mt-5 text-[14.5px] leading-relaxed text-mist-500">
                  Keys, usage-based billing and contractual limits arrive after the public engine is
                  reliable, per-request cost is measurable, and every provider licence permits
                  redistribution. The contract below is already implemented internally.
                </p>
                <div className="mt-8 space-y-3">
                  {[
                    { icon: IconLock, text: "Bearer keys issued per organisation, prefixed and revocable, never embedded in a browser bundle." },
                    { icon: IconChart, text: "Metered cost per request, reported back in the response and queryable by billing period." },
                    { icon: IconDatabase, text: "Idempotent submissions: an identical input inside the cache window returns the stored report instead of re-spending." },
                  ].map((item) => (
                    <div key={item.text} className="flex items-start gap-3 rounded-sm border border-mist-500/15 bg-ink-950/50 p-4">
                      <item.icon className="mt-0.5 h-4 w-4 shrink-0 text-brand-400" />
                      <p className="text-[13px] leading-relaxed text-mist-400">{item.text}</p>
                    </div>
                  ))}
                </div>
              </div>
            </Reveal>

            <Reveal delay={80}>
              <Panel hover={false} className="overflow-hidden">
                <div className="border-b border-mist-500/15 px-6 py-4">
                  <SectionLabel tone="mist">Endpoint contract</SectionLabel>
                </div>
                <div className="divide-y divide-mist-500/10">
                  {API_ENDPOINTS.map((endpoint) => (
                    <div key={endpoint.path} className="px-6 py-5">
                      <div className="flex flex-wrap items-center gap-3">
                        <span className={`rounded-sm px-2 py-0.5 font-mono text-[11px] ${
                          endpoint.method === "GET" ? "border border-info-400/40 bg-info-400/10 text-info-400" : "border border-brand-500/40 bg-brand-500/10 text-brand-400"
                        }`}>
                          {endpoint.method}
                        </span>
                        <code className="font-mono text-[13px] text-paper-50">{endpoint.path}</code>
                      </div>
                      <pre className="mt-3 overflow-x-auto scrollbar-thin rounded-sm border border-mist-500/12 bg-ink-950/70 p-3 font-mono text-[11.5px] leading-relaxed text-mist-400">
{endpoint.body}
                      </pre>
                      <p className="mt-2.5 text-[12.5px] leading-relaxed text-mist-500">
                        <span className="rule-label mr-2 text-mist-600">returns</span>
                        {endpoint.out}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="border-t border-mist-500/15 px-6 py-5">
                  <p className="text-xs leading-relaxed text-mist-600">
                    Today these are served internally by <code className="font-mono text-mist-400">/api/verify</code>,{" "}
                    <code className="font-mono text-mist-400">/api/report/[id]</code> and{" "}
                    <code className="font-mono text-mist-400">/api/meta</code>. Customer keys, quotas
                    and billing are a post-launch phase — not a promise made before the cost per
                    request is known.
                  </p>
                </div>
              </Panel>
            </Reveal>
          </div>
        </div>
      </section>

      <section id="request" className="relative mx-auto mt-28 max-w-[1400px] scroll-mt-24 px-5 sm:px-8">
        <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
          <Reveal>
            <div>
              <SectionLabel>Request access</SectionLabel>
              <h2 className="mt-4 font-display text-[clamp(1.7rem,3.4vw,2.5rem)] font-semibold leading-tight tracking-tight text-paper-50">
                Tell us what you need verified.
              </h2>
              <p className="mt-5 text-[14.5px] leading-relaxed text-mist-500">
                Provisioning is manual while the commercial phase is measured. Requests are written to{" "}
                <code className="font-mono text-mist-300">business_accounts</code> with a pending
                status and an audit event, so nothing is lost and nothing is auto-approved.
              </p>
              <div className="mt-8 grid gap-3 sm:grid-cols-2">
                {[
                  ["Marketplaces", "Screen listings before they go live; re-screen on report."],
                  ["Importers & distributors", "Verify cartons, barcodes and model codes at intake."],
                  ["Repair networks", "Confirm the device in front of you matches its own identifiers."],
                  ["Insurers & enforcement", "Evidence-backed reports with an auditable trail."],
                ].map(([head, body]) => (
                  <div key={head} className="rounded-sm border border-mist-500/15 bg-ink-900/40 p-4">
                    <p className="font-display text-[14.5px] text-paper-50">{head}</p>
                    <p className="mt-1.5 text-[12.5px] leading-relaxed text-mist-500">{body}</p>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>
          <Reveal delay={90}>
            <Panel hover={false} className="p-7">
              <BusinessRequestForm />
            </Panel>
          </Reveal>
        </div>
      </section>

      <section className="relative mx-auto mt-24 max-w-[1400px] px-5 pb-6 sm:px-8">
        <Reveal>
          <Panel hover={false} className="p-8">
            <div className="grid gap-8 lg:grid-cols-[auto_1fr] lg:items-center">
              <IconSeal className="h-10 w-10 text-brand-400" />
              <div>
                <h2 className="font-display text-[clamp(1.4rem,2.8vw,2rem)] font-semibold leading-tight text-paper-50">
                  A commercial customer gets the same answer as a member of the public.
                </h2>
                <p className="mt-4 max-w-3xl text-[14px] leading-relaxed text-mist-500">
                  That is the whole point of the model. If a paying customer could buy a different
                  verdict, every free report on this site would become worthless — and the traffic
                  that funds the platform would leave. Capacity, monitoring, export and support are
                  for sale. Conclusions are not.
                </p>
                <div className="mt-6 flex flex-wrap gap-3">
                  <Link href="/legal/disclosure" className="inline-flex items-center gap-2 text-[13.5px] text-brand-400">
                    Commercial disclosure policy <IconArrow className="h-4 w-4" />
                  </Link>
                  <Link href="/tools/products" className="inline-flex items-center gap-2 text-[13.5px] text-brand-400">
                    See a product report <IconArrow className="h-4 w-4" />
                  </Link>
                </div>
              </div>
            </div>
          </Panel>
        </Reveal>
      </section>

      <section className="relative mx-auto mt-12 max-w-[1400px] px-5 sm:px-8">
        <div className="grid gap-4 md:grid-cols-3">
          {[
            { icon: IconCpu, title: "Same engine", body: "Business requests run the identical orchestration pipeline, adapters and scorer. No separate 'business model' with looser thresholds." },
            { icon: IconDatabase, title: "Your data stays yours", body: "Business reports are segregated by account, excluded from any public listing, and deleted on the contracted retention schedule." },
            { icon: IconLock, title: "Security review ready", body: "SSRF controls, upload validation, secret handling and the audit log are documented and available for your own security review before contract." },
          ].map((item, i) => (
            <Reveal key={item.title} delay={i * 60}>
              <Panel className="group h-full p-6">
                <item.icon className="h-5 w-5 text-brand-400" />
                <h3 className="mt-4 font-display text-[16px] text-paper-50">{item.title}</h3>
                <p className="mt-2 text-[13px] leading-relaxed text-mist-500">{item.body}</p>
              </Panel>
            </Reveal>
          ))}
        </div>
      </section>
    </>
  );
}
