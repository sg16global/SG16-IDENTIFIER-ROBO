import { Link } from "@/components/link";
import { VerifyConsole } from "@/components/verify-console";
import { LaunchChecklist } from "@/components/interactive";
import {
  IconAlert,
  IconArrow,
  IconBarcode,
  IconFrame,
  IconLink,
  IconNews,
  IconScale,
  IconSeal,
  Panel,
  Reveal,
  SectionLabel,
  TonalChip,
} from "@/components/ui";
import type { VerificationCategory } from "@/lib/types";

const INPUTS = [
  { title: "Text or a claim", body: "A pasted article, social post, message or a single sentence you want checked.", icon: IconNews },
  { title: "A public URL", body: "A shop, a landing page, a shortened link, or the article the claim came from.", icon: IconLink },
  { title: "An image or screenshot", body: "JPEG, PNG, WebP, GIF or HEIF up to 8 MB. Analysed in memory, hashed, never published.", icon: IconFrame },
  { title: "A product identifier", body: "Model number, IMEI, EAN/UPC barcode, SKU or serial — plus whatever the listing says.", icon: IconBarcode },
];

const MODULE_LINKS: Array<{ key: VerificationCategory; slug: string; name: string; icon: typeof IconNews }> = [
  { key: "claim", slug: "news", name: "News & Claim Identifier", icon: IconNews },
  { key: "website", slug: "websites", name: "Website & Scam Identifier", icon: IconLink },
  { key: "product", slug: "products", name: "Product Identifier", icon: IconBarcode },
  { key: "media", slug: "media", name: "Image & Video Identifier", icon: IconFrame },
];

const ROUTING = [
  ["A URL with no other signal", "website", "Domain, DNS, TLS, redirect and page-behaviour checks."],
  ["A 15-digit number", "product", "IMEI Luhn validation, TAC extraction and catalogue attribution."],
  ["A 13-digit number", "product", "GTIN check-digit validation and GS1 prefix analysis."],
  ["Letters and digits, 4–32 characters", "product", "Model-code shape, normalisation and specification matching."],
  ["An attached image", "media", "Container forensics, EXIF/XMP, C2PA and generator signatures."],
  ["A URL plus a model number", "product + website", "Product workflow first, then a seller/domain sweep merged into one report."],
  ["Long narrative prose, no identifiers", "claim", "Claim decomposition, fact-check retrieval and source rating."],
];

export default function IdentifyPage() {
  return (
    <>
      <section className="relative overflow-hidden pt-14">
        <div className="grid-field pointer-events-none absolute inset-0 opacity-50" />
        <div className="pointer-events-none absolute -right-24 top-10 h-[420px] w-[420px] rounded-full bg-brand-500/10 blur-[130px]" />
        <div className="noise-layer" />
        <div className="relative mx-auto max-w-[1400px] px-5 pb-10 sm:px-8">
          <Reveal>
            <div className="flex flex-wrap items-center gap-3">
              <TonalChip tone="brand">verification console</TonalChip>
              <TonalChip tone="neutral">no account required</TonalChip>
              <TonalChip tone="ok">6 free checks / minute</TonalChip>
            </div>
            <h1 className="mt-6 max-w-4xl font-display text-[clamp(2.2rem,5.4vw,4.2rem)] font-semibold leading-[0.98] tracking-[-0.03em] text-paper-50">
              What would you like to <span className="text-brand-400">identify?</span>
            </h1>
            <p className="mt-6 max-w-2xl text-[16.5px] leading-relaxed text-mist-400">
              One input, one report. The classifier decides which workflow fits and shows you its
              reasoning; you can always override it. Every result carries findings, evidence, sources,
              a calibrated confidence figure and an explicit list of what could not be checked.
            </p>
          </Reveal>
        </div>
      </section>

      <section className="relative mx-auto max-w-[1400px] px-5 pb-6 sm:px-8">
        <VerifyConsole />
      </section>

      <section className="relative mx-auto mt-20 max-w-[1400px] px-5 sm:px-8">
        <div className="grid gap-12 lg:grid-cols-[0.85fr_1.15fr]">
          <Reveal>
            <div>
              <SectionLabel>Accepted inputs</SectionLabel>
              <h2 className="mt-4 font-display text-[clamp(1.7rem,3.2vw,2.5rem)] font-semibold leading-[1.06] tracking-tight text-paper-50">
                Anything you would normally paste into a search box.
              </h2>
              <p className="mt-5 text-[14.5px] leading-relaxed text-mist-500">
                Combine inputs for a stronger result: a model number <em className="not-italic text-mist-300">and</em> the
                listing URL, or an image <em className="not-italic text-mist-300">and</em> the caption it is being shared with.
              </p>
              <div className="mt-8 space-y-3">
                {INPUTS.map((item) => (
                  <div key={item.title} className="flex items-start gap-4 rounded-sm border border-mist-500/15 bg-ink-900/40 p-4">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-sm border border-mist-500/20 bg-ink-950 text-brand-400">
                      <item.icon className="h-[18px] w-[18px]" />
                    </span>
                    <div>
                      <p className="font-display text-[15px] text-paper-50">{item.title}</p>
                      <p className="mt-1 text-[13px] leading-relaxed text-mist-500">{item.body}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>

          <Reveal delay={80}>
            <Panel hover={false} className="overflow-hidden">
              <div className="border-b border-mist-500/15 px-6 py-4">
                <SectionLabel tone="mist">How routing is decided</SectionLabel>
              </div>
              <table className="w-full text-left">
                <thead className="border-b border-mist-500/15 bg-ink-900/60">
                  <tr className="rule-label text-mist-600">
                    <th className="px-6 py-3 font-normal">Detected in the input</th>
                    <th className="px-6 py-3 font-normal">Routed to</th>
                  </tr>
                </thead>
                <tbody>
                  {ROUTING.map(([signal, target, detail]) => (
                    <tr key={signal} className="border-b border-mist-500/8 last:border-0">
                      <td className="px-6 py-3.5">
                        <p className="text-[13.5px] text-paper-50">{signal}</p>
                        <p className="mt-1 text-[12.5px] leading-relaxed text-mist-600">{detail}</p>
                      </td>
                      <td className="whitespace-nowrap px-6 py-3.5 font-mono text-[12.5px] text-brand-400">{target}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="px-6 py-4 text-xs leading-relaxed text-mist-600">
                Routing scores are shown in every report under &ldquo;Automatic routing&rdquo;, together with the
                alternative workflows the input also fitted. Nothing is hidden behind the decision.
              </p>
            </Panel>
          </Reveal>
        </div>
      </section>

      <section className="relative mx-auto mt-24 max-w-[1400px] px-5 sm:px-8">
        <div className="grid gap-5 lg:grid-cols-3">
          {[
            { icon: IconSeal, title: "Evidence before conclusion", body: "A verdict is produced by a deterministic scorer over named findings and retrieved sources. Every point of confidence traces back to something you can open and read." },
            { icon: IconAlert, title: "Abstention is a result", body: "When evidence is insufficient the engine returns 'Unable to verify' with a null confidence. It will not invent a source, a rating or a number to fill the gap." },
            { icon: IconScale, title: "Corrections change the record", body: "Flag any report and a human reviews it. Where the evidence was wrong, the report is republished with the correction attached rather than quietly deleted." },
          ].map((item, i) => (
            <Reveal key={item.title} delay={i * 70}>
              <Panel className="group h-full p-6">
                <span className="grid h-11 w-11 place-items-center rounded-sm border border-mist-500/20 bg-ink-950 text-mist-300 transition-colors group-hover:border-brand-500/50 group-hover:text-brand-400">
                  <item.icon className="h-5 w-5" />
                </span>
                <h3 className="mt-5 font-display text-[17px] font-medium text-paper-50">{item.title}</h3>
                <p className="mt-2.5 text-[13.5px] leading-relaxed text-mist-500">{item.body}</p>
              </Panel>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="relative mx-auto mt-24 max-w-[1400px] px-5 pb-4 sm:px-8">
        <Reveal>
          <Panel hover={false} className="p-7">
            <div className="flex flex-wrap items-end justify-between gap-6">
              <div>
                <SectionLabel tone="mist">Direct module access</SectionLabel>
                <h2 className="mt-4 font-display text-2xl font-semibold text-paper-50">Skip auto-detection</h2>
              </div>
              <Link href="/blueprint" className="group inline-flex items-center gap-2 text-[13.5px] text-brand-400">
                Read how the engine is built <IconArrow className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {MODULE_LINKS.map((item) => (
                <Link
                  key={item.key}
                  href={`/tools/${item.slug}`}
                  className="group flex items-start gap-3 rounded-sm border border-mist-500/15 bg-ink-900/40 p-4 transition-colors hover:border-brand-500/45"
                >
                  <item.icon className="mt-0.5 h-5 w-5 text-brand-400" />
                  <span>
                    <span className="block font-display text-[14.5px] text-paper-50">{item.name}</span>
                    <span className="mt-1 block rule-label text-mist-600">/tools/{item.slug}</span>
                  </span>
                </Link>
              ))}
            </div>
          </Panel>
        </Reveal>
      </section>

      <section className="relative mx-auto mt-12 max-w-[1400px] px-5 sm:px-8">
        <LaunchChecklist />
      </section>
    </>
  );
}
