import { Link } from "@/components/link";
import { IconArrow, IconSeal, Panel, Reveal } from "@/components/ui";

/** Any path no page renders (the Worker also answers these with HTTP 404). */
export default function NotFoundPage() {
  return (
    <section className="relative mx-auto grid min-h-[62vh] max-w-[900px] place-items-center px-5 py-24 sm:px-8">
      <div className="grid-field pointer-events-none absolute inset-0 opacity-30" />
      <Reveal>
        <Panel hover={false} className="relative p-10 text-center">
          <IconSeal className="mx-auto h-10 w-10 text-brand-400" />
          <p className="rule-label mt-6 text-mist-600">404</p>
          <h1 className="mt-3 font-display text-[clamp(1.6rem,3.4vw,2.4rem)] font-semibold leading-tight text-paper-50">
            This page could not be found
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-[14.5px] leading-relaxed text-mist-500">
            The address may be mistyped, or the page may have moved. Nothing was checked and nothing was stored.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/identify" className="glow-accent inline-flex items-center gap-2 rounded-sm bg-brand-cta px-5 py-3 text-[13.5px] font-semibold text-white transition-[transform,background-color] hover:-translate-y-0.5 hover:bg-brand-cta-hover">
              Open the verification console <IconArrow className="h-4 w-4" />
            </Link>
            <Link href="/" className="inline-flex items-center gap-2 rounded-sm border border-mist-500/25 px-5 py-3 text-[13.5px] text-mist-300 transition-colors hover:border-brand-500/50">
              SG16 Identifier home
            </Link>
          </div>
        </Panel>
      </Reveal>
    </section>
  );
}
