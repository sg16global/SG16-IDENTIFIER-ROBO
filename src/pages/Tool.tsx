import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { Link } from "@/components/link";
import { VerifyConsole } from "@/components/verify-console";
import {
  IconAlert,
  IconArrow,
  IconBarcode,
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
import { TOOL_PAGES } from "@/content/tools";
import NotFoundPage from "@/pages/NotFound";

const CATEGORY_ICON_MAP = {
  claim: IconNews,
  website: IconLink,
  product: IconBarcode,
  media: IconFrame,
} as const;

interface CatalogRow {
  brand: string;
  model: string;
  category: string;
  identifiers: unknown;
  specs: unknown;
}

/** The products module lists the normalised catalogue from PostgreSQL (GET /api/catalog). */
function useCatalog(slug: string): CatalogRow[] {
  const [loaded, setLoaded] = useState<{ slug: string; rows: CatalogRow[] } | null>(null);
  useEffect(() => {
    if (slug !== "products") return;
    const controller = new AbortController();
    fetch("/api/catalog", { signal: controller.signal, headers: { accept: "application/json" } })
      .then((res) => (res.ok ? (res.json() as Promise<{ rows?: CatalogRow[] }>) : { rows: [] }))
      .then((json) => setLoaded({ slug, rows: json.rows ?? [] }))
      .catch(() => {
        // Aborted or unreachable: the page renders without the catalogue, as before.
      });
    return () => controller.abort();
  }, [slug]);
  return loaded?.slug === slug ? loaded.rows : [];
}

export default function ModulePage() {
  const { slug = "" } = useParams();
  const page = TOOL_PAGES[slug];
  const catalog = useCatalog(slug);
  if (!page) return <NotFoundPage />;

  const Icon = CATEGORY_ICON_MAP[page.category];

  return (
    <>
      <section className="relative overflow-hidden pt-14">
        <div className="grid-field pointer-events-none absolute inset-0 opacity-50" />
        <div className={`pointer-events-none absolute -left-32 top-0 h-[440px] w-[440px] rounded-full blur-[140px] ${
          "bg-brand-500/9"
        }`} />
        <div className="noise-layer" />
        <div className="relative mx-auto max-w-[1400px] px-5 pb-12 sm:px-8">
          <div className="grid gap-10 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
            <Reveal>
              <div className="flex flex-wrap items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-sm border border-mist-500/25 bg-ink-900 text-brand-400">
                  <Icon className="h-5 w-5" />
                </span>
                <TonalChip tone="neutral">{page.eyebrow}</TonalChip>
              </div>
              <h1 className="mt-6 font-display text-[clamp(2.1rem,5vw,3.9rem)] font-semibold leading-[0.99] tracking-[-0.03em] text-paper-50">
                {page.title}
              </h1>
              <p className="mt-6 max-w-2xl text-[16.5px] leading-relaxed text-mist-400">{page.lede}</p>
              <div className="mt-7 flex flex-wrap gap-3">
                <a href="#console" className="glow-accent group inline-flex items-center gap-2 rounded-sm bg-brand-cta px-5 py-3 text-[13.5px] font-semibold text-white transition-[transform,background-color] hover:-translate-y-0.5 hover:bg-brand-cta-hover">
                  Run this check <IconArrow className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </a>
                <Link href="/identify" className="inline-flex items-center gap-2 rounded-sm border border-mist-500/25 px-5 py-3 text-[13.5px] text-mist-300 transition-colors hover:border-brand-500/50">
                  Use the universal console
                </Link>
              </div>
            </Reveal>

            <Reveal delay={110}>
              <Panel hover={false} className="p-6">
                <SectionLabel tone="mist">Try one of these</SectionLabel>
                <div className="mt-4 space-y-2">
                  {page.examples.map((example) => (
                    <a
                      key={example.label}
                      href="#console"
                      className="group block rounded-sm border border-mist-500/15 bg-ink-950/50 p-3.5 transition-colors hover:border-brand-500/45"
                    >
                      <span className="rule-label block text-brand-400">{example.label}</span>
                      <span className="mt-1.5 block line-clamp-2 font-mono text-[11.5px] leading-relaxed text-mist-500">{example.value}</span>
                    </a>
                  ))}
                </div>
              </Panel>
            </Reveal>
          </div>
        </div>
      </section>

      <section id="console" className="relative mx-auto max-w-[1400px] scroll-mt-24 px-5 sm:px-8">
        <VerifyConsole initialCategory={page.category} />
      </section>

      <section className="relative mx-auto mt-24 max-w-[1400px] px-5 sm:px-8">
        <div className="grid gap-12 lg:grid-cols-[0.85fr_1.15fr]">
          <Reveal>
            <div className="lg:sticky lg:top-28">
              <SectionLabel>What actually runs</SectionLabel>
              <h2 className="mt-4 font-display text-[clamp(1.7rem,3.2vw,2.5rem)] font-semibold leading-[1.06] tracking-tight text-paper-50">
                {page.checks.length} checks, each one reported separately.
              </h2>
              <p className="mt-5 text-[14.5px] leading-relaxed text-mist-500">
                Nothing is collapsed into a single score. Every check produces its own finding with its
                own wording and weight, so you can read the reasoning and disagree with any part of it.
              </p>
              <div className="mt-8 rounded-sm border border-mist-500/15 bg-ink-900/40 p-5">
                <p className="rule-label text-brand-400">Module honesty rule</p>
                <p className="mt-2 text-[13.5px] leading-relaxed text-mist-500">
                  If a provider is not configured, or a switch is off, or the input does not support a
                  check, the report says so in plain language. It never silently produces a weaker
                  answer and presents it as a stronger one.
                </p>
              </div>
            </div>
          </Reveal>

          <div className="space-y-3">
            {page.checks.map((check, i) => (
              <Reveal key={check.title} delay={i * 45}>
                <Panel className="group p-6">
                  <div className="flex items-baseline gap-4">
                    <span className="font-mono text-[12px] text-brand-400">{String(i + 1).padStart(2, "0")}</span>
                    <h3 className="font-display text-[17.5px] font-medium text-paper-50">{check.title}</h3>
                  </div>
                  <p className="mt-3 pl-8 text-[14px] leading-relaxed text-mist-400">{check.body}</p>
                  <div className="ml-8 mt-4 h-px w-[calc(100%-2rem)] bg-mist-500/12">
                    <div className="h-px w-0 bg-brand-500 transition-all duration-700 group-hover:w-full" />
                  </div>
                </Panel>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="relative mx-auto mt-24 max-w-[1400px] px-5 sm:px-8">
        <div className="grid gap-6 lg:grid-cols-2">
          <Reveal>
            <Panel hover={false} className="h-full p-7">
              <div className="flex items-center gap-3">
                <IconAlert className="h-5 w-5 text-risk-400" />
                <SectionLabel tone="warn">What this module cannot do</SectionLabel>
              </div>
              <ul className="mt-6 space-y-4">
                {page.cannot.map((item) => (
                  <li key={item} className="flex gap-3 border-l border-risk-500/30 pl-4 text-[14px] leading-relaxed text-mist-400">
                    {item}
                  </li>
                ))}
              </ul>
              <p className="mt-7 text-xs leading-relaxed text-mist-600">
                These limits are repeated inside every report this module produces, in the
                &ldquo;What this report could not check&rdquo; panel. Stating a limitation on a marketing
                page and omitting it from the result would be the same dishonesty in a different order.
              </p>
            </Panel>
          </Reveal>

          <Reveal delay={80}>
            <Panel hover={false} className="h-full overflow-hidden">
              <div className="border-b border-mist-500/15 px-7 py-5">
                <div className="flex items-center gap-3">
                  <IconLock className="h-5 w-5 text-brand-400" />
                  <SectionLabel>Data sources behind this module</SectionLabel>
                </div>
              </div>
              <div className="divide-y divide-mist-500/10">
                {page.sources.map((source) => (
                  <div key={source.name} className="flex items-start gap-4 px-7 py-4">
                    <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                      source.status === "always on" ? "bg-ok-400" : source.status === "key-dependent" ? "bg-warn-500" : "bg-info-400"
                    }`} />
                    <div className="min-w-0 flex-1">
                      <p className="font-display text-[14.5px] text-paper-50">{source.name}</p>
                      <p className="mt-1 text-[13px] leading-relaxed text-mist-500">{source.role}</p>
                    </div>
                    <span className="rule-label shrink-0 text-mist-600">{source.status}</span>
                  </div>
                ))}
              </div>
              <div className="border-t border-mist-500/15 px-7 py-5">
                <p className="text-xs leading-relaxed text-mist-600">
                  Before any provider is used commercially, its licence, commercial-use restrictions,
                  request limits, caching rules, redistribution rights and privacy terms are checked.
                  A free developer key is not a commercial licence.
                </p>
              </div>
            </Panel>
          </Reveal>
        </div>
      </section>

      {catalog.length > 0 && (
        <section className="relative mx-auto mt-24 max-w-[1400px] px-5 sm:px-8">
          <Reveal>
            <div className="flex flex-wrap items-end justify-between gap-6">
              <div>
                <SectionLabel>Internal catalogue</SectionLabel>
                <h2 className="mt-4 font-display text-[clamp(1.7rem,3.2vw,2.5rem)] font-semibold leading-tight tracking-tight text-paper-50">
                  {catalog.length} normalised product records loaded from PostgreSQL
                </h2>
                <p className="mt-4 max-w-2xl text-[14.5px] leading-relaxed text-mist-500">
                  A starter dataset, not a manufacturer feed. Every matched report links to the
                  brand&rsquo;s own specification page and states that a match confirms attribution of a
                  code — never authenticity of an object.
                </p>
              </div>
              <Link href="/business" className="group inline-flex items-center gap-2 text-[13.5px] text-brand-400">
                Bulk catalogue checks <IconArrow className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
            </div>
          </Reveal>

          <div className="mt-8 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {catalog.map((row, i) => {
              const identifiers = (row.identifiers as { models?: string[]; skuPattern?: string }) ?? {};
              const specs = (row.specs as Record<string, string>) ?? {};
              return (
                <Reveal key={`${row.brand}-${row.model}`} delay={Math.min(i * 25, 300)}>
                  <Panel className="group h-full p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="rule-label text-mist-600">{row.brand}</p>
                        <h3 className="mt-1.5 font-display text-[16.5px] leading-tight text-paper-50">{row.model}</h3>
                      </div>
                      <TonalChip tone="neutral">{row.category}</TonalChip>
                    </div>
                    <div className="mt-4 space-y-1.5">
                      {identifiers.models?.length ? (
                        <p className="font-mono text-[11.5px] text-brand-400">{identifiers.models.join(" · ")}</p>
                      ) : (
                        <p className="font-mono text-[11.5px] text-brand-400">SKU pattern {identifiers.skuPattern}</p>
                      )}
                      {Object.entries(specs).slice(0, 3).map(([k, v]) => (
                        <p key={k} className="line-clamp-1 text-[12.5px] text-mist-500">
                          <span className="rule-label mr-2 text-mist-600">{k}</span>
                          {v}
                        </p>
                      ))}
                    </div>
                    <div className="mt-4 h-px w-full bg-mist-500/12">
                      <div className="h-px w-0 bg-brand-500 transition-all duration-700 group-hover:w-full" />
                    </div>
                  </Panel>
                </Reveal>
              );
            })}
          </div>
        </section>
      )}

      <section className="relative mx-auto mt-24 max-w-[1400px] px-5 sm:px-8">
        <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr]">
          <Reveal>
            <div className="lg:sticky lg:top-28">
              <SectionLabel tone="mist">Module questions</SectionLabel>
              <h2 className="mt-4 font-display text-[clamp(1.7rem,3.2vw,2.4rem)] font-semibold leading-[1.06] tracking-tight text-paper-50">
                Answered without hedging.
              </h2>
              <div className="mt-8 flex flex-col gap-3">
                {page.related.map((rel) => (
                  <Link key={rel.href} href={rel.href} className="group inline-flex items-center gap-2 text-[13.5px] text-brand-400">
                    {rel.label} <IconArrow className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </Link>
                ))}
              </div>
            </div>
          </Reveal>
          <div className="divide-y divide-mist-500/12 border-y border-mist-500/12">
            {page.faq.map((item, i) => (
              <Reveal key={item.q} delay={i * 45}>
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
      </section>

      <section className="relative mt-24 border-t border-mist-500/12 bg-ink-900/40 py-20">
        <div className="relative mx-auto max-w-[1400px] px-5 sm:px-8">
          <Reveal>
            <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-center">
              <div className="flex items-start gap-5">
                <IconScale className="mt-1 h-7 w-7 shrink-0 text-brand-400" />
                <div>
                  <h2 className="font-display text-[clamp(1.5rem,3vw,2.2rem)] font-semibold leading-tight text-paper-50">
                    One engine, four modules, identical report structure.
                  </h2>
                  <p className="mt-4 max-w-2xl text-[14.5px] leading-relaxed text-mist-500">
                    Switching modules does not change what a report contains. Findings, evidence,
                    sources, confidence, limitations and next steps are the same fields everywhere —
                    so a business integrating the API once integrates all four.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                {Object.values(TOOL_PAGES).map((other) => (
                  <Link
                    key={other.slug}
                    href={`/tools/${other.slug}`}
                    className={`rounded-sm border px-4 py-2.5 text-[13px] transition-colors ${
                      other.slug === slug
                        ? "border-brand-500/60 bg-brand-500/10 text-brand-400"
                        : "border-mist-500/20 text-mist-400 hover:border-mist-400/40 hover:text-paper-50"
                    }`}
                  >
                    {other.eyebrow.split("— ")[1]}
                  </Link>
                ))}
              </div>
            </div>
          </Reveal>
          <div className="mt-12 flex items-center gap-4 border-t border-mist-500/12 pt-8">
            <IconSeal className="h-6 w-6 text-mist-600" />
            <p className="max-w-3xl text-xs leading-relaxed text-mist-600">
              SG16 Identifier reports evidence, not legal conclusions, and is not affiliated with or
              endorsed by any manufacturer, retailer, platform or fact-checking organisation named in
              its reports. Flag any result you believe is wrong from the report page.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
