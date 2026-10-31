import { useEffect, useState } from "react";
import type { Pioneer, PioneersPayload } from "@/lib/types";
import { Reveal } from "@/components/ui";

/**
 * "AI Pioneers — Intelligence Heritage" rail under the hero. Every name, role and
 * photo is fetched at runtime from /api/pioneers, which reads the live SG16 cloud;
 * nothing about the pioneers is bundled with this page.
 *
 * The cards roll right-to-left without end: the list is rendered twice and the
 * track slides by exactly one copy (the `ticker` keyframes, 0 → -50%), so the
 * loop restarts on an identical frame. Hover or keyboard focus pauses it; with
 * reduced motion it stops and becomes a normal sideways-scrolling row.
 */
type PioneersState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; data: PioneersPayload };

export async function fetchPioneers(signal?: AbortSignal): Promise<PioneersPayload> {
  const res = await fetch("/api/pioneers", { signal, headers: { accept: "application/json" } });
  const body = (await res.json().catch(() => null)) as ({ ok?: boolean } & Partial<PioneersPayload>) | null;
  if (!res.ok || !body?.ok || !Array.isArray(body.pioneers) || body.pioneers.length === 0) {
    throw new Error("Pioneers data temporarily unavailable");
  }
  return { source: body.source ?? "", fetchedAt: body.fetchedAt ?? "", pioneers: body.pioneers };
}

const SKELETON_CARDS = 6;
const SECONDS_PER_CARD = 4;
// Fixed widths so 1–2 cards show on phones and 4–5 on desktop.
const CARD_WIDTH = "w-[200px] shrink-0 sm:w-[216px] xl:w-[236px]";

export function PioneersSection() {
  const [state, setState] = useState<PioneersState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetchPioneers(controller.signal)
      .then((data) => setState({ status: "ready", data }))
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: "error" });
      });
    return () => controller.abort();
  }, [attempt]);

  const retry = () => {
    setState({ status: "loading" });
    setAttempt((n) => n + 1);
  };

  const ready = state.status === "ready" ? state.data : null;
  const sourceHost = ready?.source ? new URL(ready.source).host : null;

  return (
    <section aria-labelledby="pioneers-title" className="relative mx-auto mt-16 max-w-[1400px] px-5 sm:px-8">
      <Reveal>
        <div className="card-edge card-feature relative overflow-hidden rounded-sm px-4 pb-6 pt-8 sm:px-8">
          <div className="grid-fine pointer-events-none absolute inset-0 opacity-40" />
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-500/70 to-transparent" />

          <header className="relative text-center">
            <div className="flex items-center justify-center gap-4">
              <span className="hidden h-px w-24 bg-gradient-to-r from-transparent to-brand-500/80 sm:block" />
              <h2
                id="pioneers-title"
                className="font-display text-[clamp(1.5rem,3vw,2.2rem)] font-semibold uppercase tracking-[0.12em] text-brand-400 [text-shadow:0_0_22px_rgb(255_23_68/0.45)]"
              >
                AI Pioneers
              </h2>
              <span className="hidden h-px w-24 bg-gradient-to-l from-transparent to-brand-500/80 sm:block" />
            </div>
            <p className="rule-label mt-2 text-mist-400">Intelligence heritage</p>
          </header>

          <div className="relative mt-7">
            {state.status === "loading" && (
              <ul className="flex gap-4 overflow-hidden pb-4 pt-1" aria-busy="true" aria-label="Loading AI pioneers">
                {Array.from({ length: SKELETON_CARDS }, (_, i) => (
                  <li key={i} className={`${CARD_WIDTH} rounded-sm border border-ink-600 bg-ink-900/80 p-3`}>
                    <div className="aspect-square w-full animate-pulse rounded-sm bg-ink-700" />
                    <div className="mx-auto mt-4 h-3 w-3/4 animate-pulse rounded-sm bg-ink-600" />
                    <div className="mx-auto mt-2 h-2.5 w-1/2 animate-pulse rounded-sm bg-brand-700/60" />
                  </li>
                ))}
              </ul>
            )}

            {state.status === "error" && (
              <div role="status" className="dash-accent flex flex-col items-center gap-4 rounded-sm bg-ink-950/70 px-6 py-12 text-center">
                <p className="text-[15px] text-mist-300">Pioneers data temporarily unavailable</p>
                <button
                  type="button"
                  onClick={retry}
                  className="rounded-sm border border-brand-700 px-4 py-2 text-[13px] text-paper-50 transition-colors hover:border-brand-500 hover:text-brand-400"
                >
                  Try again
                </button>
              </div>
            )}

            {ready && (
              <div
                role="region"
                aria-label="AI pioneers, rolling — hover to pause"
                className="scrollbar-thin overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_3%,black_97%,transparent)] motion-reduce:overflow-x-auto"
              >
                {/* Trailing padding equals the gap, so half the track is exactly one copy plus its gap. */}
                <ul
                  className="flex w-max animate-ticker gap-4 pb-4 pr-4 pt-2 hover:[animation-play-state:paused] focus-within:[animation-play-state:paused] motion-reduce:animate-none"
                  style={{ animationDuration: `${ready.pioneers.length * SECONDS_PER_CARD}s` }}
                >
                  {[...ready.pioneers, ...ready.pioneers].map((p, i) => (
                    <PioneerCard key={`${p.name}-${i}`} pioneer={p} duplicate={i >= ready.pioneers.length} />
                  ))}
                </ul>
              </div>
            )}
          </div>

          {ready && sourceHost && (
            <p className="relative mt-2 text-center font-mono text-[10.5px] tracking-wider text-mist-600">
              LIVE FROM {sourceHost.toUpperCase()} · {ready.pioneers.length} PIONEERS
            </p>
          )}
        </div>
      </Reveal>
    </section>
  );
}

/** The second copy exists only for the seamless loop: hidden from screen readers and dropped when motion is reduced. */
function PioneerCard({ pioneer: p, duplicate }: { pioneer: Pioneer; duplicate: boolean }) {
  return (
    <li
      aria-hidden={duplicate || undefined}
      className={`${CARD_WIDTH} group rounded-sm border border-brand-700 bg-ink-900/80 p-3 shadow-[inset_0_1px_0_rgb(255_23_68/0.08)] transition-[border-color,box-shadow,transform] duration-300 hover:-translate-y-1 hover:border-brand-500 hover:shadow-[0_0_24px_-6px_var(--glow-red-strong)] ${
        duplicate ? "motion-reduce:hidden" : ""
      }`}
    >
      <div className="relative aspect-square overflow-hidden rounded-sm border border-ink-600 bg-ink-950">
        {/* Remote photo served by the SG16 source site, so it bypasses the local /api/image resizer. */}
        <img
          src={p.photo}
          alt={duplicate ? "" : p.name}
          width={240}
          height={240}
          decoding="async"
          draggable={false}
          className="h-full w-full object-cover grayscale transition-[filter,transform] duration-500 group-hover:scale-[1.03] group-hover:grayscale-0"
        />
      </div>
      <p className="mt-3 text-center font-display text-[13px] font-semibold uppercase tracking-[0.06em] text-paper-50">{p.name}</p>
      {p.role && <p className="mt-1 text-center text-[12px] leading-snug text-brand-400">{p.role}</p>}
    </li>
  );
}
