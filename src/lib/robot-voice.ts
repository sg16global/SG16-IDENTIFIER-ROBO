import { useSyncExternalStore } from "react";

/**
 * Shared voice for the hero Robo Manager and the chat widget: one mute
 * preference, one voice picker, one speak() built on window.speechSynthesis,
 * and the faint ambient hum that plays under any line being spoken.
 * Nothing here ever throws — a browser without speech, or one that refuses to
 * speak, simply stays silent.
 */

/* ---------------------------------- mute ---------------------------------- */

// Mute preference: browser storage when it works, memory otherwise.
const MUTE_KEY = "sg16:robot-muted";
let mutedMemory: boolean | null = null;
const muteListeners = new Set<() => void>();

export function readMuted() {
  if (mutedMemory !== null) return mutedMemory;
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeMuted(muted: boolean) {
  mutedMemory = muted;
  try {
    localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch {
    // Storage blocked — the in-memory value still applies for this page.
  }
  // Mute stops the voice and the hum at once; unmuting brings the hum back only
  // if something is still being spoken.
  if (muted) {
    if (hasSpeech()) window.speechSynthesis.cancel();
    humOut({ immediate: true });
  } else if (speakingCount > 0) {
    humIn();
  }
  muteListeners.forEach((listener) => listener());
}

function subscribeMuted(listener: () => void) {
  muteListeners.add(listener);
  return () => {
    muteListeners.delete(listener);
  };
}

export function useRobotMuted() {
  return useSyncExternalStore(subscribeMuted, readMuted, () => false);
}

/* -------------------------------- speaking -------------------------------- */

// Utterances that have started and not yet ended, so the robot can animate
// while any of its lines (hero or chat) is actually being heard.
let speakingCount = 0;
const speakingListeners = new Set<() => void>();

function setSpeaking(delta: number) {
  const before = speakingCount;
  speakingCount = Math.max(0, speakingCount + delta);
  if (before === 0 && speakingCount > 0) humIn();
  else if (before > 0 && speakingCount === 0) humOut();
  speakingListeners.forEach((listener) => listener());
}

function subscribeSpeaking(listener: () => void) {
  speakingListeners.add(listener);
  return () => {
    speakingListeners.delete(listener);
  };
}

export function useRobotSpeaking() {
  return useSyncExternalStore(subscribeSpeaking, () => speakingCount > 0, () => false);
}

/* --------------------------------- speech --------------------------------- */

export function hasSpeech() {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/*
 * English voice ranking, best first. Browsers only offer what the system or the
 * browser vendor ships: Edge exposes Microsoft's neural "Online (Natural)"
 * voices, Chrome its Google voices, macOS/iOS Apple's. The old Windows desktop
 * voices (David, Zira, Mark) sound dated, so they are a last resort.
 */
const EN_VOICE_RANK = [
  /(ryan|guy|andrew|brian|christopher|eric|roger|steffan|davis|tony).*natural/i, // Microsoft neural, male
  /google uk english male/i,
  /natural/i, // any other neural voice
  /google/i,
  /(daniel|alex|aaron|arthur|evan|nathan|tom)\b/i, // Apple's newer male voices
  /\bmale\b/i,
  /microsoft mark/i,
];
const DATED_VOICE = /microsoft (david|zira)|desktop/i;
let warnedDatedVoice = false;

function rankEnglish(voices: SpeechSynthesisVoice[]) {
  for (const pattern of EN_VOICE_RANK) {
    const match = voices.find((v) => pattern.test(v.name) || pattern.test(v.voiceURI));
    if (match) return match;
  }
  const modern = voices.find((v) => !DATED_VOICE.test(v.name));
  if (modern) return modern;
  if (voices.length > 0 && !warnedDatedVoice) {
    warnedDatedVoice = true;
    console.warn(
      `[SG16 Robo Manager] No modern English voice is installed; using "${voices[0].name}". ` +
        "Edge (Microsoft Natural voices) or Chrome (Google voices) sound much better.",
    );
  }
  return voices[0] ?? null;
}

/** The best installed voice for a BCP 47 tag (e.g. "es-ES"), matching on the primary language. */
export function pickVoice(lang = "en-US") {
  if (!hasSpeech()) return null;
  const primary = lang.toLowerCase().split("-")[0];
  const voices = window.speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().replace("_", "-").split("-")[0] === primary);
  if (primary === "en") return rankEnglish(voices);
  return voices.find((v) => v.lang.toLowerCase() === lang.toLowerCase()) ?? voices[0] ?? null;
}

/**
 * Whether the page may start speech on its own. Chromium-based browsers refuse
 * speechSynthesis before the visitor has interacted with the page; where the
 * User Activation API exists we ask it, elsewhere we try and let it fail quietly.
 */
export function pageHasUserActivation() {
  if (typeof navigator === "undefined") return false;
  const activation = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
  return activation ? activation.hasBeenActive : true;
}

// Chrome can garbage-collect an utterance mid-speech and never fire `end`;
// holding a reference until it finishes keeps chained lines flowing.
const liveUtterances = new Set<SpeechSynthesisUtterance>();

type SpeakOptions = {
  interrupt?: boolean;
  lang?: string;
  /** Called once: `true` when the line was spoken to the end, `false` if cancelled or refused. */
  onEnd?: (completed: boolean) => void;
};

/**
 * Speaks `text` unless muted. Returns false when nothing was queued (muted, no
 * speech support, or no installed voice for a non-English language — reading
 * foreign text with an English voice is worse than silence).
 */
export function speak(text: string, { interrupt = false, lang = "en-US", onEnd }: SpeakOptions = {}) {
  if (!hasSpeech() || readMuted()) return false;
  const voice = pickVoice(lang);
  if (!voice && !lang.toLowerCase().startsWith("en")) return false;
  if (interrupt) window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  if (voice) utterance.voice = voice;
  utterance.lang = voice?.lang ?? lang;
  // Natural pitch, crisp conversational pace.
  utterance.pitch = 1.0;
  utterance.rate = 1.05;
  let started = false;
  let done = false;
  const finish = (completed: boolean) => {
    if (done) return;
    done = true;
    liveUtterances.delete(utterance);
    if (started) setSpeaking(-1);
    onEnd?.(completed);
  };
  utterance.onstart = () => {
    started = true;
    setSpeaking(1);
  };
  utterance.onend = () => finish(true);
  // A refused or cancelled utterance ends quietly.
  utterance.onerror = () => finish(false);
  liveUtterances.add(utterance);
  window.speechSynthesis.speak(utterance);
  return true;
}

/* ----------------------------- ambient tech hum ---------------------------- */

/*
 * A faint, generated hum under the robot's voice (Web Audio, no file): a 70 Hz
 * sine with two softer harmonics — the harmonics are what small laptop and
 * phone speakers can actually reproduce — through a low-pass filter, with a
 * slow tremolo so it breathes. It fades in over 0.5 s when speech starts and
 * out over 0.5 s when it stops; a short grace period keeps it steady between
 * chained lines. Muting silences it at once.
 */
const HUM_VOLUME = 0.07;
const HUM_FADE_S = 0.5;
const HUM_GRACE_MS = 350;

type Hum = { ctx: AudioContext; master: GainNode };
let hum: Hum | null = null;
let humOutTimer: ReturnType<typeof setTimeout> | undefined;
let humSuspendTimer: ReturnType<typeof setTimeout> | undefined;

function buildHum(): Hum | null {
  const Ctx = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  const ctx = new Ctx();
  const master = ctx.createGain();
  master.gain.value = 0;
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 320;
  filter.Q.value = 0.7;
  const tremolo = ctx.createGain();
  tremolo.gain.value = 0.85;
  const lfo = ctx.createOscillator();
  const lfoDepth = ctx.createGain();
  lfo.frequency.value = 0.35;
  lfoDepth.gain.value = 0.15;
  lfo.connect(lfoDepth).connect(tremolo.gain);
  for (const [frequency, level] of [[70, 1], [140, 0.45], [210, 0.2]] as const) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = frequency;
    gain.gain.value = level;
    osc.connect(gain).connect(filter);
    osc.start();
  }
  lfo.start();
  filter.connect(tremolo).connect(master).connect(ctx.destination);
  return { ctx, master };
}

function rampHum(target: number, seconds: number) {
  if (!hum) return;
  const { ctx, master } = hum;
  const now = ctx.currentTime;
  master.gain.cancelScheduledValues(now);
  master.gain.setValueAtTime(master.gain.value, now);
  master.gain.linearRampToValueAtTime(target, now + seconds);
}

function humIn() {
  clearTimeout(humOutTimer);
  clearTimeout(humSuspendTimer);
  if (readMuted() || !pageHasUserActivation()) return;
  hum ??= buildHum();
  if (!hum) return;
  if (hum.ctx.state === "suspended") void hum.ctx.resume().catch(() => {});
  rampHum(HUM_VOLUME, HUM_FADE_S);
}

function humOut({ immediate = false } = {}) {
  clearTimeout(humOutTimer);
  if (!hum) return;
  const fade = () => {
    rampHum(0, immediate ? 0.02 : HUM_FADE_S);
    // Let the context sleep once silent; it resumes on the next line.
    clearTimeout(humSuspendTimer);
    humSuspendTimer = setTimeout(() => void hum?.ctx.suspend().catch(() => {}), (HUM_FADE_S + 1.5) * 1000);
  };
  if (immediate) fade();
  else humOutTimer = setTimeout(fade, HUM_GRACE_MS);
}

// Browsers only let audio start after a user gesture: unlock it on the first one.
if (typeof window !== "undefined") {
  const unlock = () => {
    hum ??= buildHum();
    if (hum && hum.ctx.state === "suspended" && speakingCount === 0) {
      void hum.ctx.resume().then(() => hum?.ctx.suspend()).catch(() => {});
    }
  };
  window.addEventListener("pointerdown", unlock, { once: true, capture: true });
  window.addEventListener("keydown", unlock, { once: true, capture: true });
}
