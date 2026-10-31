import { useParams } from "react-router";
import { Link } from "@/components/link";
import { IconArrow, IconScale, IconSeal, Panel, Reveal, SectionLabel, TonalChip } from "@/components/ui";
import { LEGAL_DOCS } from "@/content/legal";
import NotFoundPage from "@/pages/NotFound";

export default function LegalPage() {
  const { doc = "" } = useParams();
  const page = LEGAL_DOCS[doc];
  if (!page) return <NotFoundPage />;

  return (
    <>
      <section className="relative overflow-hidden pt-14">
        <div className="grid-field pointer-events-none absolute inset-0 opacity-40" />
        <div className="noise-layer" />
        <div className="relative mx-auto max-w-[1000px] px-5 pb-8 sm:px-8">
          <Reveal>
            <div className="flex flex-wrap items-center gap-3">
              <TonalChip tone="neutral">{page.eyebrow}</TonalChip>
              <TonalChip tone="neutral">updated {page.updated}</TonalChip>
            </div>
            <h1 className="mt-6 font-display text-[clamp(2rem,4.8vw,3.6rem)] font-semibold leading-[0.99] tracking-[-0.03em] text-paper-50">
              {page.title}
            </h1>
            <p className="mt-6 max-w-2xl text-[16px] leading-relaxed text-mist-400">{page.lede}</p>
          </Reveal>
        </div>
      </section>

      <section className="relative mx-auto max-w-[1000px] px-5 pb-10 sm:px-8">
        <div className="space-y-10">
          {page.blocks.map((block, i) => (
            <Reveal key={block.heading} delay={i * 40}>
              <article>
                <div className="flex items-baseline gap-4 border-b border-mist-500/15 pb-3">
                  <span className="font-mono text-[12px] text-brand-400">{String(i + 1).padStart(2, "0")}</span>
                  <h2 className="font-display text-[clamp(1.25rem,2.4vw,1.75rem)] font-semibold leading-tight text-paper-50">
                    {block.heading}
                  </h2>
                </div>
                <div className="pt-4 space-y-4">
                  {block.body.map((paragraph) => (
                    <p key={paragraph.slice(0, 40)} className="text-[15px] leading-[1.75] text-mist-400">
                      {paragraph}
                    </p>
                  ))}
                  {block.list && (
                    <ul className="space-y-2.5 rounded-sm border-l-2 border-brand-500/40 bg-ink-900/40 py-4 pl-5 pr-4">
                      {block.list.map((item) => (
                        <li key={item} className="flex gap-3 text-[14px] leading-relaxed text-mist-400">
                          <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-brand-500" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </article>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="relative mx-auto max-w-[1000px] px-5 pb-20 sm:px-8">
        <Reveal>
          <Panel hover={false} className="p-7">
            <div className="flex items-start gap-4">
              <IconScale className="mt-1 h-6 w-6 shrink-0 text-brand-400" />
              <div>
                <SectionLabel tone="mist">Other policies</SectionLabel>
                <div className="mt-4 flex flex-wrap gap-2.5">
                  {Object.values(LEGAL_DOCS)
                    .filter((other) => other.slug !== page.slug)
                    .map((other) => (
                      <Link
                        key={other.slug}
                        href={`/legal/${other.slug}`}
                        className="group inline-flex items-center gap-2 rounded-sm border border-mist-500/20 px-4 py-2.5 text-[13px] text-mist-300 transition-colors hover:border-brand-500/50 hover:text-brand-400"
                      >
                        {other.title}
                        <IconArrow className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
                      </Link>
                    ))}
                </div>
                <div className="mt-7 flex items-start gap-3 border-t border-mist-500/12 pt-6">
                  <IconSeal className="mt-0.5 h-5 w-5 shrink-0 text-mist-600" />
                  <p className="text-[12.5px] leading-relaxed text-mist-600">
                    SG16 Identifier is an independent verification tool. It is not affiliated with,
                    endorsed by, or acting on behalf of any manufacturer, retailer, platform,
                    fact-checking organisation or government body named in its reports. Nothing here or
                    in any report constitutes legal advice.
                  </p>
                </div>
              </div>
            </div>
          </Panel>
        </Reveal>
      </section>
    </>
  );
}
