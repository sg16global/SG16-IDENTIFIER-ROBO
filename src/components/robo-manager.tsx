import { Img } from "@/components/img";
import { useEffect, useRef, useState } from "react";
import { fetchPioneers } from "@/components/pioneers-section";
import type { Pioneer } from "@/lib/types";
import { pageHasUserActivation, speak, useRobotMuted, useRobotSpeaking, writeMuted } from "@/lib/robot-voice";

/**
 * Hero mascot. The verification console signals it through a window event so
 * the two can live in different sections without shared state.
 *
 * States: idle (floats, breathes, glows, looks around) → typing (head tips
 * toward the input, body leans in) → scanning (head shakes in thought, body
 * vibrates, eyes flash) → result (low risk nods with green eyes, suspicious
 * tilts its head with amber eyes, high risk shakes "no" with red alarm eyes).
 * While any line is being heard it talks: jitter, voice meter, pulsing eyes.
 * The motion itself is CSS (globals.css, "Hero robot"). It speaks through the browser's
 * speechSynthesis: a looping four-line platform tour (5 s pause between
 * rounds) until the visitor starts their first scan — only once they have
 * interacted with the page, as browsers require — and in response to each
 * scan. Never when muted; a faint hum plays under every line (lib/robot-voice).
 *
 * The chat widget listens to the same event for scan context.
 */
export const ROBOT_EVENT = "sg16:robot";
export type ResultTone = "ok" | "warn" | "risk" | "unknown";
export type RobotSignal = "focus" | "blur" | "scan" | "error" | `result-${ResultTone}`;
export type RobotEventDetail = { signal: RobotSignal; category?: string; status?: string };
type RobotState = "idle" | "typing" | "scanning" | "result" | "error";

export function signalRobot(signal: RobotSignal, context: Omit<RobotEventDetail, "signal"> = {}) {
  window.dispatchEvent(new CustomEvent<RobotEventDetail>(ROBOT_EVENT, { detail: { signal, ...context } }));
}

const IMAGE = { src: "/assets/robo-manager.png", width: 1042, height: 1509 };
const SIZES = "(min-width: 1280px) 240px, (min-width: 1024px) 210px, 180px";
// How long the verdict lights stay on before the robot settles back to idle.
const RESULT_HOLD_MS = 14000;

const BUBBLE: Record<RobotState, string> = {
  idle: "Hello. I am the SG16 Robo Manager. What are we verifying today?",
  typing: "Hello. I am the SG16 Robo Manager. What are we verifying today?",
  scanning: "Scanning database… Cross-referencing evidence…",
  result: "Verdict reached. Show me the evidence.",
  error: "The scan could not finish. Check the input and try again.",
};

const STATE_LABEL: Record<RobotState, string> = {
  idle: "Standing by",
  typing: "Listening",
  scanning: "Scanning",
  result: "Verdict",
  error: "Interrupted",
};

// "Low risk", not "safe": a verdict never guarantees safety (see VERDICT_LABEL in lib/types).
const SPOKEN_VERDICT: Record<ResultTone, string> = {
  ok: "Scan complete. The evidence shows this is low risk.",
  warn: "Scan complete. The evidence shows this is suspicious.",
  risk: "Scan complete. The evidence shows this is high risk.",
  unknown: "Scan complete. The evidence is not enough to reach a conclusion.",
};

const TONE_DOT: Record<ResultTone, string> = {
  ok: "bg-ok-400",
  warn: "bg-warn-400",
  risk: "bg-risk-500",
  unknown: "bg-unknown-400",
};

/* ---------------------------------- tour ---------------------------------- */

// The platform tour, spoken line after line (each starts when the previous one
// ends), then 5 s of silence, then again from the top. Line 3 names the pioneers
// from the live /api/pioneers list; until it loads, or if it cannot, the tour
// skips the pioneers lines rather than reading names it has not fetched.
const TOUR_WELCOME =
  "Hello, welcome. I am the SG16 Identifier Robo Manager. How can I help you? We verify News Claims, Websites, Products, Media, and Business domains.";
const TOUR_PIONEERS_INTRO = "Let us introduce the minds behind modern intelligence. Our AI Pioneers:";
const TOUR_CLOSING = "Evidence before conclusion. How can I assist you today?";

/** "Norbert Wiener. Claude Shannon. … And Arthur Samuel." */
function pioneersLine(pioneers: Pioneer[]) {
  const names = pioneers.map((p) => p.name.trim()).filter(Boolean);
  return names.map((name, i) => (i === names.length - 1 && names.length > 1 ? `And ${name}.` : `${name}.`)).join(" ");
}
const TOUR_START_MS = 10000;
const TOUR_PAUSE_MS = 5000;
// When a line cannot start yet (no click on the page, typing, chat open, other
// speech, muted, tab hidden), try again this often.
const TOUR_RETRY_MS = 1000;
// Module state: once a scan has started, the tour stops for the rest of the
// page load — including after client-side navigation back to the homepage.
// A reload starts it again.
let taskStarted = false;

/** True while the chat widget's panel is open: the visitor is already engaged. */
function chatIsOpen() {
  const panel = document.getElementById("sg16-chat-panel");
  return panel !== null && !panel.inert;
}

/* -------------------------------- component ------------------------------- */

export function RoboManager({ className = "" }: { className?: string }) {
  const [state, setState] = useState<RobotState>("idle");
  const [tone, setTone] = useState<ResultTone | null>(null);
  const muted = useRobotMuted();
  const speaking = useRobotSpeaking();
  const stateRef = useRef(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    if (taskStarted) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Bumped on every interruption so callbacks from a cancelled line are ignored.
    let generation = 0;
    let lineInFlight = false;
    // `latest` follows the live pioneers list; `round` is fixed for one pass of
    // the tour so a list that arrives mid-round never shifts the line numbers.
    let latest = [TOUR_WELCOME, TOUR_CLOSING];
    let round = latest;
    const pioneers = new AbortController();
    fetchPioneers(pioneers.signal)
      .then(({ pioneers: list }) => {
        const names = pioneersLine(list);
        if (names) latest = [TOUR_WELCOME, TOUR_PIONEERS_INTRO, names, TOUR_CLOSING];
      })
      .catch(() => {
        // Pioneers unavailable: keep the short tour.
      });

    const schedule = (line: number, ms: number) => {
      clearTimeout(timer);
      timer = setTimeout(() => play(line), ms);
    };

    const play = (line: number) => {
      if (taskStarted) return;
      // Wait rather than talk over the visitor, the chat or other speech, and
      // until the visitor has interacted (browsers refuse speech before that).
      const blocked =
        stateRef.current !== "idle" ||
        document.hidden ||
        chatIsOpen() ||
        !pageHasUserActivation() ||
        window.speechSynthesis?.speaking ||
        window.speechSynthesis?.pending;
      if (blocked) return schedule(line, TOUR_RETRY_MS);

      if (line === 0) round = latest;
      const gen = generation;
      lineInFlight = speak(round[line], {
        onEnd: (completed) => {
          if (gen !== generation) return;
          lineInFlight = false;
          // Cut off (e.g. muted mid-line): retry the same line once allowed.
          if (!completed) return schedule(line, TOUR_RETRY_MS);
          if (line < round.length - 1) play(line + 1);
          else schedule(0, TOUR_PAUSE_MS);
        },
      });
      // Muted or no speech support: check again shortly.
      if (!lineInFlight) schedule(line, TOUR_RETRY_MS);
    };

    const stop = ({ silence }: { silence: boolean }) => {
      generation++;
      clearTimeout(timer);
      if (silence && lineInFlight) window.speechSynthesis?.cancel();
      lineInFlight = false;
    };

    const onSignal = (event: Event) => {
      const { signal } = (event as CustomEvent<RobotEventDetail>).detail;
      if (taskStarted) return;
      // Typing silences the tour at once; leaving the field restarts it from
      // the top after the usual pause.
      if (signal === "focus") stop({ silence: true });
      else if (signal === "blur") schedule(0, TOUR_PAUSE_MS);
    };
    const onScan = (event: Event) => {
      // The scan's own announcement (spoken with interrupt) replaces the tour line.
      if ((event as CustomEvent<RobotEventDetail>).detail.signal === "scan") stop({ silence: false });
    };

    window.addEventListener(ROBOT_EVENT, onSignal);
    window.addEventListener(ROBOT_EVENT, onScan);
    schedule(0, TOUR_START_MS);
    return () => {
      stop({ silence: true });
      pioneers.abort();
      window.removeEventListener(ROBOT_EVENT, onSignal);
      window.removeEventListener(ROBOT_EVENT, onScan);
    };
  }, []);

  useEffect(() => {
    let settle: ReturnType<typeof setTimeout> | undefined;
    const onSignal = (event: Event) => {
      const { signal } = (event as CustomEvent<RobotEventDetail>).detail;
      if (signal === "focus") {
        // Typing never interrupts a scan in progress.
        setState((s) => (s === "scanning" ? s : "typing"));
        return;
      }
      if (signal === "blur") {
        setState((s) => (s === "typing" ? "idle" : s));
        return;
      }

      clearTimeout(settle);
      if (signal === "scan") {
        taskStarted = true;
        setState("scanning");
        setTone(null);
        speak("Initializing secure scan. Analyzing evidence.", { interrupt: true });
      } else if (signal === "error") {
        setState("error");
        setTone(null);
        speak("The scan could not be completed.");
        settle = setTimeout(() => setState("idle"), RESULT_HOLD_MS);
      } else {
        const resultTone = signal.slice("result-".length) as ResultTone;
        setState("result");
        setTone(resultTone);
        // Queued, not interrupting: the scan announcement finishes first.
        speak(SPOKEN_VERDICT[resultTone]);
        settle = setTimeout(() => {
          setState((s) => (s === "result" ? "idle" : s));
          setTone(null);
        }, RESULT_HOLD_MS);
      }
    };
    window.addEventListener(ROBOT_EVENT, onSignal);
    return () => {
      window.removeEventListener(ROBOT_EVENT, onSignal);
      clearTimeout(settle);
    };
  }, []);

  const showEyes = speaking || state === "typing" || state === "scanning" || (state === "result" && tone !== "unknown");

  return (
    <div className={`relative flex flex-col items-center ${className}`}>
      {/* Speech bubble — announced politely to screen readers, which do not see the artwork. */}
      <div
        role="status"
        aria-live="polite"
        className="relative z-10 mb-3 w-[240px] max-w-[calc(100vw-2.5rem)] rounded-sm border border-brand-800 bg-ink-950/90 px-3.5 py-2.5 shadow-[0_0_28px_-10px_var(--glow-red-strong),inset_0_1px_0_rgb(255_23_68/0.1)] backdrop-blur-sm"
      >
        <div className="flex items-center gap-2">
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              state === "result" && tone ? TONE_DOT[tone] : state === "scanning" ? "animate-pulse bg-brand-500" : state === "error" ? "bg-warn-500" : "bg-brand-500"
            }`}
          />
          <span className="whitespace-nowrap font-mono text-[9.5px] uppercase tracking-[0.14em] text-mist-500">
            Robo Manager · {STATE_LABEL[state]}
          </span>
        </div>
        <p key={state} className="mt-1.5 min-h-[3.4em] animate-rise text-[12.5px] leading-snug text-mist-200">
          {BUBBLE[state]}
        </p>
        <span aria-hidden className="absolute -bottom-[5px] left-1/2 h-2.5 w-2.5 -translate-x-1/2 rotate-45 border-b border-r border-brand-800 bg-ink-950" />
      </div>

      <div className="relative w-full">
        <button
          type="button"
          onClick={() => writeMuted(!muted)}
          aria-pressed={muted}
          aria-label={muted ? "Unmute Robo Manager voice" : "Mute Robo Manager voice"}
          title={muted ? "Voice off — click to unmute" : "Voice on — click to mute"}
          className="absolute right-0 top-[6%] z-10 grid h-8 w-8 place-items-center rounded-full border border-brand-800 bg-ink-950/85 text-brand-400 shadow-[0_0_16px_-6px_var(--glow-red-strong)] transition-colors hover:border-brand-500 hover:text-paper-50"
        >
          {muted ? <IconSpeakerOff className="h-4 w-4" /> : <IconSpeaker className="h-4 w-4" />}
        </button>

        <div className="robo" data-state={state} data-tone={tone ?? undefined} data-speaking={speaking ? "" : undefined} aria-hidden>
          <div className="robo__motion">
            <div className="robo__float">
              <div className="robo__breathe">
                {/* Blurred copy of the robot: a glow that follows its own neon outline. */}
                <Img {...IMAGE} alt="" sizes={SIZES} className="robo__bloom" />
                <Img {...IMAGE} alt="" sizes={SIZES} preload className="robo__img robo__img--body" />
                <div className="robo__head">
                  <div className="robo__head-motion">
                    <Img {...IMAGE} alt="" sizes={SIZES} preload className="robo__img robo__img--head" />
                    {showEyes && (
                      <span key={`${state}-${tone}`} className="robo__eyes">
                        <span className="robo__eye robo__eye--left" />
                        <span className="robo__eye robo__eye--right" />
                      </span>
                    )}
                    <span className="robo__voice">
                      <span />
                      <span />
                      <span />
                      <span />
                      <span />
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function IconSpeaker({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" />
      <path d="M15.5 9a4.2 4.2 0 0 1 0 6M18 6.5a7.8 7.8 0 0 1 0 11" />
    </svg>
  );
}

function IconSpeakerOff({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" />
      <path d="m16 9.5 5 5M21 9.5l-5 5" />
    </svg>
  );
}
