import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Img } from "@/components/img";
import { ROBOT_EVENT, type ResultTone, type RobotEventDetail } from "@/components/robo-manager";
import type { MessageKey } from "@/lib/chat-i18n";
import type { ChatMessage, NewChatMessage, ScanContext } from "@/components/chat-panel";

/**
 * Floating Robo Manager chat. This launcher is all that ships with the page;
 * the panel, its dictionary and its answer logic load on first hover/open.
 *
 * The launcher owns the conversation log (every message, with timestamps and
 * source, kept for future analytics) and listens to the verification console's
 * robot events, so scan progress lands in the chat even while it is closed.
 * Only a high-risk result or a failed scan raises the unread badge.
 */
const loadPanel = () => import("@/components/chat-panel");
const ChatPanel = lazy(loadPanel);

const APPEAR_AFTER_MS = 1200;

const SCAN_KEY: Record<string, MessageKey> = {
  website: "scan.website",
  product: "scan.product",
  claim: "scan.claim",
  media: "scan.media",
};

export function ChatWidget() {
  const [visible, setVisible] = useState(false);
  const [open, setOpen] = useState(false);
  const [everOpened, setEverOpened] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [unread, setUnread] = useState(0);
  const [scan, setScan] = useState<ScanContext>({ phase: "idle" });
  const openRef = useRef(open);
  const nextId = useRef(1);
  const launcherRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    openRef.current = open;
  }, [open]);

  const append = useCallback((items: NewChatMessage[], { notify = false, prepend = false } = {}) => {
    const stamped = items.map((m) => ({ ...m, id: nextId.current++, at: Date.now() }));
    setMessages((prev) => (prepend ? [...stamped, ...prev] : [...prev, ...stamped]));
    if (notify && !openRef.current) setUnread((n) => n + stamped.filter((m) => m.role === "robot").length);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), APPEAR_AFTER_MS);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const onSignal = (event: Event) => {
      const { signal, category } = (event as CustomEvent<RobotEventDetail>).detail;
      if (signal === "scan") {
        setScan({ phase: "scanning" });
        append([{ role: "robot", key: SCAN_KEY[category ?? ""] ?? "scan.auto", source: "scan" }]);
      } else if (signal === "error") {
        setScan({ phase: "error" });
        append(
          [
            { role: "robot", key: "scan.failed", source: "scan" },
            { role: "robot", key: "scan.askExplain", source: "scan", actions: [{ kind: "explain", key: "explain.error" }, { kind: "dismiss" }] },
          ],
          { notify: true },
        );
      } else if (signal.startsWith("result-")) {
        const tone = signal.slice("result-".length) as ResultTone;
        setScan({ phase: "done", tone });
        const items: NewChatMessage[] = [{ role: "robot", key: "scan.done", params: { verdict: `verdict.${tone}` }, source: "scan" }];
        if (tone === "risk") {
          items.push({ role: "robot", key: "scan.askExplain", source: "scan", actions: [{ kind: "explain", key: "explain.risk" }, { kind: "dismiss" }] });
        }
        append(items, { notify: tone === "risk" });
      }
    };
    window.addEventListener(ROBOT_EVENT, onSignal);
    return () => window.removeEventListener(ROBOT_EVENT, onSignal);
  }, [append]);

  const openChat = () => {
    setOpen(true);
    setEverOpened(true);
    setUnread(0);
  };

  const closeChat = useCallback(() => {
    setOpen(false);
    launcherRef.current?.focus();
  }, []);

  return (
    <>
      <button
        ref={launcherRef}
        type="button"
        onClick={() => (open ? closeChat() : openChat())}
        onPointerEnter={() => void loadPanel()}
        onFocus={() => void loadPanel()}
        aria-expanded={open}
        aria-controls="sg16-chat-panel"
        aria-label={unread > 0 ? `Open chat with the SG16 Robo Manager, ${unread} unread` : open ? "Close chat" : "Open chat with the SG16 Robo Manager"}
        className={`group fixed bottom-5 right-5 z-50 grid h-14 w-14 place-items-center rounded-full border border-brand-800 bg-ink-950 shadow-[0_0_26px_-6px_var(--glow-red-strong)] transition-[opacity,transform,border-color] duration-500 hover:border-brand-500 ${
          visible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-4 opacity-0"
        } ${open ? "max-sm:hidden" : ""}`}
      >
        {!everOpened && <span aria-hidden className="absolute inset-0 animate-pulse-ring rounded-full border border-brand-500/70" />}
        <span className="relative block h-full w-full overflow-hidden rounded-full">
          <Img
            src="/assets/robo-manager.png"
            alt=""
            fill
            sizes="56px"
            className="scale-[1.7] object-cover object-[50%_16%] transition-transform duration-300 group-hover:scale-[1.8]"
          />
        </span>
        {unread > 0 && (
          <span aria-hidden className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full border-2 border-ink-950 bg-brand-500 px-1 font-mono text-[10px] font-semibold text-white">
            {unread}
          </span>
        )}
      </button>

      {everOpened && (
        <Suspense fallback={null}>
          <ChatPanel open={open} messages={messages} scan={scan} onAppend={append} onClose={closeChat} />
        </Suspense>
      )}
    </>
  );
}
