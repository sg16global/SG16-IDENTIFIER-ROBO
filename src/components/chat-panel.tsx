import { useNavigate } from "react-router";
import { Img } from "@/components/img";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import {
  CHAT_LANGUAGES,
  DEFAULT_LANG,
  isChatLang,
  languageInfo,
  matchIntent,
  t,
  type ChatLang,
  type Intent,
  type MessageKey,
} from "@/lib/chat-i18n";
import { hasSpeech, pickVoice, speak, useRobotMuted } from "@/lib/robot-voice";

/**
 * The Robo Manager chat panel, loaded on demand by chat-widget.tsx.
 *
 * Robot messages are stored as dictionary keys, not text, so switching the
 * language re-renders the whole conversation. Answers come from a fixed set
 * of intents (lib/chat-i18n.ts) — no visitor text leaves the browser.
 * Replies the visitor asked for are spoken aloud unless the chat voice is off
 * or the robot is muted; scan updates are not, because the hero robot already
 * announces scans and two voices would talk over each other.
 */

export type ChatAction =
  | { kind: "ask"; intent: Intent }
  | { kind: "explain"; key: "explain.risk" | "explain.error" }
  | { kind: "dismiss" }
  | { kind: "tryNow" }
  | { kind: "changeLanguage" };

export type ChatMessage = {
  id: number;
  at: number;
  role: "robot" | "user";
  source: "greeting" | "reply" | "scan" | "user";
  /** Robot messages: dictionary key, with params that are themselves keys. */
  key?: MessageKey;
  params?: Record<string, MessageKey>;
  /** Visitor messages: their own words. */
  text?: string;
  actions?: ChatAction[];
  /** Speak this message when it appears. */
  speak?: boolean;
};

export type NewChatMessage = Omit<ChatMessage, "id" | "at">;

export type ScanContext = { phase: "idle" | "scanning" | "error" } | { phase: "done"; tone: string };

type Props = {
  open: boolean;
  messages: ChatMessage[];
  scan: ScanContext;
  onAppend: (items: NewChatMessage[], options?: { prepend?: boolean }) => void;
  onClose: () => void;
};

const LANG_KEY = "sg16:chat-lang";
const VOICE_KEY = "sg16:chat-voice";

const QUESTION_KEY: Record<Exclude<Intent, "greeting">, MessageKey> = {
  verifyWebsite: "q.verifyWebsite",
  whatIs: "q.whatIs",
  howWorks: "q.howWorks",
  free: "q.free",
  languages: "q.languages",
};

const SUGGESTIONS: ChatAction[] = [
  { kind: "ask", intent: "verifyWebsite" },
  { kind: "ask", intent: "whatIs" },
  { kind: "ask", intent: "howWorks" },
  { kind: "ask", intent: "free" },
  { kind: "ask", intent: "languages" },
  { kind: "changeLanguage" },
];

function replyTo(intent: Intent | null): NewChatMessage {
  const base = { role: "robot", source: "reply", speak: true } as const;
  switch (intent) {
    case "greeting":
      return { ...base, key: "greeting", actions: SUGGESTIONS };
    case "verifyWebsite":
      return { ...base, key: "a.verifyWebsite", actions: [{ kind: "tryNow" }] };
    case "howWorks":
      return { ...base, key: "a.howWorks", actions: [{ kind: "tryNow" }] };
    case "whatIs":
      return { ...base, key: "a.whatIs", actions: [{ kind: "tryNow" }] };
    case "free":
      return { ...base, key: "a.free" };
    case "languages":
      return { ...base, key: "a.languages", actions: [{ kind: "changeLanguage" }] };
    default:
      return { ...base, key: "a.fallback", actions: SUGGESTIONS };
  }
}

function readStored<T>(key: string, parse: (raw: string | null) => T): T {
  try {
    return parse(localStorage.getItem(key));
  } catch {
    return parse(null);
  }
}

function store(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage blocked — the preference lasts for this page only.
  }
}

function displayName(inLang: string, code: string) {
  try {
    const name = new Intl.DisplayNames([inLang], { type: "language" }).of(code) ?? code;
    return name.charAt(0).toLocaleUpperCase(inLang) + name.slice(1);
  } catch {
    return code;
  }
}

// Installed voices arrive asynchronously; re-render when the list changes.
function subscribeVoices(listener: () => void) {
  if (!hasSpeech()) return () => {};
  window.speechSynthesis.addEventListener("voiceschanged", listener);
  return () => window.speechSynthesis.removeEventListener("voiceschanged", listener);
}
const voiceCount = () => (hasSpeech() ? window.speechSynthesis.getVoices().length : 0);

export default function ChatPanel({ open, messages, scan, onAppend, onClose }: Props) {
  const [lang, setLang] = useState<ChatLang>(() => readStored(LANG_KEY, (raw) => (isChatLang(raw) ? raw : DEFAULT_LANG)));
  const [voiceOn, setVoiceOn] = useState(() => readStored(VOICE_KEY, (raw) => raw !== "0"));
  const [draft, setDraft] = useState("");
  const navigate = useNavigate();
  const muted = useRobotMuted();
  useSyncExternalStore(subscribeVoices, voiceCount, () => 0);

  const info = languageInfo(lang);
  const voiceAvailable = hasSpeech() && (info.code === "en" || pickVoice(info.speech) !== null);

  const listRef = useRef<HTMLOListElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const selectRef = useRef<HTMLSelectElement | null>(null);
  const spoken = useRef(new Set<number>());
  const greeted = useRef(false);

  const languages = useMemo(() => {
    const names = CHAT_LANGUAGES.map((l) => displayName(lang, l.code));
    try {
      return new Intl.ListFormat(lang, { type: "conjunction" }).format(names);
    } catch {
      return names.join(", ");
    }
  }, [lang]);

  const render = useCallback(
    (m: ChatMessage) => {
      if (m.role === "user") return m.text ?? "";
      const params: Record<string, string> = { languages };
      for (const [name, key] of Object.entries(m.params ?? {})) params[name] = t(lang, key);
      return m.key ? t(lang, m.key, params) : "";
    },
    [lang, languages],
  );

  // Greet once, at the top of the conversation, when the panel first mounts.
  useEffect(() => {
    if (greeted.current) return;
    greeted.current = true;
    onAppend([{ role: "robot", source: "greeting", key: "greeting", actions: SUGGESTIONS, speak: true }], { prepend: true });
  }, [onAppend]);

  // Speak new robot messages that ask to be spoken, in the current language.
  useEffect(() => {
    if (!open) return;
    for (const m of messages) {
      if (m.role !== "robot" || !m.speak || spoken.current.has(m.id)) continue;
      spoken.current.add(m.id);
      if (voiceOn) speak(render(m), { lang: info.speech });
    }
  }, [messages, open, voiceOn, render, info.speech]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, lang]);

  useEffect(() => {
    if (open) inputRef.current?.focus({ preventScroll: true });
  }, [open]);

  const ask = (text: string, intent: Intent | null) => {
    onAppend([{ role: "user", source: "user", text }, replyTo(intent)]);
  };

  const act = (action: ChatAction) => {
    switch (action.kind) {
      case "ask":
        ask(t(lang, QUESTION_KEY[action.intent as Exclude<Intent, "greeting">]), action.intent);
        break;
      case "explain":
        onAppend([
          { role: "user", source: "user", text: t(lang, "action.yesExplain") },
          { role: "robot", source: "reply", key: action.key, speak: true },
        ]);
        break;
      case "dismiss":
        onAppend([
          { role: "user", source: "user", text: t(lang, "action.noThanks") },
          { role: "robot", source: "reply", key: "explain.no", speak: true },
        ]);
        break;
      case "changeLanguage":
        onAppend([
          { role: "user", source: "user", text: t(lang, "q.changeLanguage") },
          { role: "robot", source: "reply", key: "a.changeLanguage", speak: true },
        ]);
        selectRef.current?.focus();
        break;
      case "tryNow": {
        const field = document.querySelector<HTMLTextAreaElement>("#identify textarea");
        if (field) {
          field.scrollIntoView({ behavior: "smooth", block: "center" });
          field.focus({ preventScroll: true });
          if (window.matchMedia("(max-width: 639px)").matches) onClose();
        } else {
          navigate("/#identify");
        }
        break;
      }
    }
  };

  const changeLanguage = (next: ChatLang) => {
    setLang(next);
    store(LANG_KEY, next);
    onAppend([{ role: "robot", source: "reply", key: "a.languageChanged", speak: true }]);
  };

  const toggleVoice = () => {
    const next = !voiceOn;
    setVoiceOn(next);
    store(VOICE_KEY, next ? "1" : "0");
    if (!next && hasSpeech()) window.speechSynthesis.cancel();
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    ask(text.slice(0, 500), matchIntent(text));
  };

  const lastRobot = [...messages].reverse().find((m) => m.role === "robot");

  return (
    <div
      id="sg16-chat-panel"
      role="dialog"
      aria-modal="false"
      aria-labelledby="sg16-chat-title"
      inert={!open}
      dir={info.dir}
      lang={lang}
      onKeyDown={(event) => event.key === "Escape" && onClose()}
      className={`fixed inset-x-0 bottom-0 z-[55] flex h-[min(88dvh,640px)] flex-col overflow-hidden rounded-t-md border border-brand-800 bg-ink-950/95 shadow-[0_0_60px_-18px_var(--glow-red-strong)] backdrop-blur-md transition-[opacity,transform] duration-300 ease-out sm:inset-x-auto sm:bottom-24 sm:right-5 sm:h-[min(600px,calc(100dvh-8rem))] sm:w-[380px] sm:rounded-md ${
        open ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-6 opacity-0"
      }`}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-500/70 to-transparent" />

      {/* Header */}
      <header className="border-b border-brand-700/60 bg-ink-900/90 px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full border border-brand-800 bg-ink-950">
            <Img src="/assets/robo-manager.png" alt="" fill sizes="40px" className="scale-[1.7] object-cover object-[50%_16%]" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="sg16-chat-title" className="font-display text-[15px] font-semibold text-paper-50" dir="ltr">
              SG16 Robo Manager
            </h2>
            <p className="truncate text-[11.5px] text-mist-500">{t(lang, "ui.subtitle")}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t(lang, "ui.close")}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-sm border border-ink-600 text-mist-400 transition-colors hover:border-brand-500 hover:text-paper-50"
          >
            <span aria-hidden className="text-lg leading-none">×</span>
          </button>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <label className="sr-only" htmlFor="sg16-chat-lang">
            {t(lang, "ui.language")}
          </label>
          <select
            ref={selectRef}
            id="sg16-chat-lang"
            value={lang}
            onChange={(event) => isChatLang(event.target.value) && changeLanguage(event.target.value)}
            className="min-w-0 flex-1 rounded-sm border border-ink-600 bg-ink-850 px-2.5 py-1.5 text-[12.5px] text-paper-50 outline-none transition-colors hover:border-brand-800 focus:border-brand-500"
          >
            {CHAT_LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {displayName(l.code, l.code)}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={toggleVoice}
            aria-pressed={voiceOn}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-sm border px-2.5 py-1.5 text-[12px] transition-colors ${
              voiceOn ? "border-brand-800 text-brand-300 hover:border-brand-500" : "border-ink-600 text-mist-500 hover:text-paper-50"
            }`}
          >
            <IconVoice off={!voiceOn} className="h-3.5 w-3.5" />
            {t(lang, voiceOn ? "ui.voiceOn" : "ui.voiceOff")}
          </button>
        </div>

        {scan.phase === "scanning" && (
          <p role="status" className="mt-2.5 flex items-center gap-2 rounded-sm border border-brand-800/70 bg-brand-500/10 px-2.5 py-1.5 text-[12px] text-brand-300">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-500" />
            {t(lang, "ui.scanning")}
          </p>
        )}
        {voiceOn && (muted || !voiceAvailable) && (
          <p className="mt-2 text-[11px] leading-snug text-mist-500">{t(lang, muted ? "ui.mutedHint" : "ui.voiceUnavailable")}</p>
        )}
      </header>

      {/* Conversation */}
      <ol ref={listRef} aria-live="polite" className="scrollbar-thin flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-4">
        {messages.map((m) => {
          const robot = m.role === "robot";
          const showActions = robot && m.actions && m.id === lastRobot?.id;
          return (
            <li key={m.id} className={`flex max-w-[86%] flex-col gap-2 ${robot ? "self-start" : "self-end items-end"}`}>
              <p
                className={`whitespace-pre-line rounded-md px-3.5 py-2.5 text-[13.5px] leading-relaxed ${
                  robot ? "rounded-es-sm bg-brand-600 text-white shadow-[0_0_20px_-10px_var(--glow-red-strong)]" : "rounded-ee-sm border border-ink-500 bg-ink-700 text-paper-50"
                }`}
              >
                <span className="sr-only">{robot ? "SG16 Robo Manager: " : `${t(lang, "ui.you")}: `}</span>
                {render(m)}
              </p>
              {showActions && (
                <div className="flex flex-wrap gap-1.5">
                  {m.actions!.map((action, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => act(action)}
                      className="rounded-full border border-brand-800 bg-ink-950 px-3 py-1.5 text-start text-[12px] leading-snug text-brand-300 transition-colors hover:border-brand-500 hover:bg-brand-500/10 hover:text-paper-50"
                    >
                      {actionLabel(lang, action)}
                    </button>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ol>

      {/* Composer */}
      <form onSubmit={submit} className="flex items-center gap-2 border-t border-ink-600 bg-ink-900/90 p-3">
        <label className="sr-only" htmlFor="sg16-chat-input">
          {t(lang, "ui.placeholder")}
        </label>
        <input
          ref={inputRef}
          id="sg16-chat-input"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={t(lang, "ui.placeholder")}
          maxLength={500}
          autoComplete="off"
          className="field min-w-0 flex-1 py-2! text-[13.5px]"
        />
        <button
          type="submit"
          disabled={!draft.trim()}
          className="shrink-0 rounded-sm bg-brand-cta px-3.5 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-brand-cta-hover disabled:opacity-50"
        >
          {t(lang, "ui.send")}
        </button>
      </form>
    </div>
  );
}

function actionLabel(lang: ChatLang, action: ChatAction) {
  switch (action.kind) {
    case "ask":
      return t(lang, QUESTION_KEY[action.intent as Exclude<Intent, "greeting">]);
    case "explain":
      return t(lang, "action.yesExplain");
    case "dismiss":
      return t(lang, "action.noThanks");
    case "tryNow":
      return t(lang, "action.tryNow");
    case "changeLanguage":
      return t(lang, "q.changeLanguage");
  }
}

function IconVoice({ off, className = "" }: { off: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" />
      {off ? <path d="m16 9.5 5 5M21 9.5l-5 5" /> : <path d="M15.5 9a4.2 4.2 0 0 1 0 6M18 6.5a7.8 7.8 0 0 1 0 11" />}
    </svg>
  );
}
