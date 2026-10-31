/* ------------------------------- bytes ------------------------------- */
// Web Crypto and plain JS only: this module runs in the browser and the Worker.

export function randomBytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Each byte as one character (ISO-8859-1), for reading binary signatures. */
export function latin1(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) out += String.fromCharCode(b);
  return out;
}

/** Decodes base64, with or without a data: URL prefix. Throws on malformed input. */
export function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value.replace(/^data:[^,]*,/, ""));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

export async function sha256Hex(input: string | Uint8Array): Promise<string> {
  const data = typeof input === "string" ? new TextEncoder().encode(input) : new Uint8Array(input);
  return toHex(new Uint8Array(await crypto.subtle.digest("SHA-256", data)));
}

/* -------------------------------- ids -------------------------------- */

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I/O/0/1 — readable IDs

export function newId(prefix = ""): string {
  return `${prefix}${toHex(randomBytes(16))}`;
}

/** Human-shareable, unguessable report reference: SG16-4KQ2-9MXT */
export function newPublicId(): string {
  const block = (n: number) => {
    const bytes = randomBytes(n);
    let out = "";
    for (let i = 0; i < n; i += 1) out += ALPHABET[bytes[i] % ALPHABET.length];
    return out;
  };
  return `SG16-${block(4)}-${block(4)}`;
}

export function clamp(n: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, n));
}

export function round(n: number, digits = 2): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toISOString().replace("T", " ").slice(0, 19) + " UTC";
}

export function relativeTime(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  const diff = Date.now() - d.getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return d.toISOString().slice(0, 10);
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

export function formatUsd(n: number, digits = 4): string {
  return `$${n.toFixed(digits).replace(/\.?0+$/, (m) => (m.includes(".") ? "" : m))}`;
}

export async function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

export function dedupeBy<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const k = key(item);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
}

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}
