/**
 * AI Pioneers — read live from the SG16 cloud.
 *
 * Neither sg16engine.com nor the SG16 Brain project publishes a JSON endpoint for
 * the pioneers; SG16 Brain server-renders them as `<li class="pioneer-card">`
 * blocks (photo, `.pioneer-name`, `.pioneer-role`). This module fetches that live
 * page on the server and parses the cards, so no name, role or photo is stored
 * here. Point PIONEERS_SOURCE_URL at another SG16 page with the same markup to
 * switch source.
 */

import type { Pioneer, PioneersPayload } from "@/lib/types";
import { afterResponse } from "@/lib/request-scope";
import { setting } from "@/lib/settings";

export type { Pioneer, PioneersPayload };

export const PIONEERS_SOURCE_URL = setting("PIONEERS_SOURCE_URL") ?? "https://mistralbrain.com/";
const REVALIDATE_SECONDS = 600;
const MAX_PIONEERS = 24;

const CARD_RE = /<li\b[^>]*class="[^"]*\bpioneer-card\b[^"]*"[^>]*>([\s\S]*?)<\/li>/g;
const IMG_RE = /<img\b[^>]*\bsrc="([^"]+)"/;
const NAME_RE = /class="[^"]*\bpioneer-name\b[^"]*"[^>]*>([\s\S]*?)<\//;
const ROLE_RE = /class="[^"]*\bpioneer-role\b[^"]*"[^>]*>([\s\S]*?)<\//;

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function decodeText(raw: string) {
  return raw
    .replace(/<[^>]*>/g, "")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
      if (code[0] === "#") {
        const n = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
        return Number.isFinite(n) ? String.fromCodePoint(n) : match;
      }
      return ENTITIES[code.toLowerCase()] ?? match;
    })
    .replace(/\s+/g, " ")
    .trim();
}

/** Parses pioneer cards out of the source HTML. The page repeats its track for a seamless loop, so cards are de-duplicated by name. */
export function parsePioneers(html: string, base: string): Pioneer[] {
  const origin = new URL(base).origin;
  const seen = new Set<string>();
  const pioneers: Pioneer[] = [];

  for (const [, card] of html.matchAll(CARD_RE)) {
    const src = card.match(IMG_RE)?.[1];
    const name = decodeText(card.match(NAME_RE)?.[1] ?? "");
    const role = decodeText(card.match(ROLE_RE)?.[1] ?? "");
    if (!src || !name || seen.has(name.toLowerCase())) continue;

    // Photos must come from the source site itself over HTTPS.
    let photo: URL;
    try {
      photo = new URL(decodeText(src), base);
    } catch {
      continue;
    }
    if (photo.origin !== origin || photo.protocol !== "https:") continue;

    seen.add(name.toLowerCase());
    pioneers.push({ name, role, photo: photo.toString() });
    if (pioneers.length >= MAX_PIONEERS) break;
  }
  return pioneers;
}

// Parsed pioneers are cached for REVALIDATE_SECONDS: in this isolate's memory (always), and in
// Cloudflare's edge cache (shared by the data centre; active on a custom domain, not workers.dev).
let memo: { at: number; payload: PioneersPayload } | null = null;
const CACHE_KEY = `https://sg16identifier.com/__cache/pioneers?source=${encodeURIComponent(PIONEERS_SOURCE_URL)}`;

export async function fetchLivePioneers(): Promise<PioneersPayload> {
  if (memo && Date.now() - memo.at < REVALIDATE_SECONDS * 1000) return memo.payload;
  const cached = await caches.default.match(CACHE_KEY).catch(() => undefined);
  if (cached) {
    const payload = (await cached.json()) as PioneersPayload;
    memo = { at: Date.now(), payload };
    return payload;
  }
  const payload = await readSource();
  memo = { at: Date.now(), payload };
  afterResponse(
    caches.default.put(CACHE_KEY, Response.json(payload, { headers: { "cache-control": `public, max-age=${REVALIDATE_SECONDS}` } })),
  );
  return payload;
}

async function readSource(): Promise<PioneersPayload> {
  const res = await fetch(PIONEERS_SOURCE_URL, {
    signal: AbortSignal.timeout(10000),
    headers: {
      "user-agent": "Mozilla/5.0 (compatible; SG16-Identifier/1.0; +https://sg16identifier.com/bot)",
      accept: "text/html",
    },
  });
  if (!res.ok) throw new Error(`Pioneers source answered HTTP ${res.status}`);

  const pioneers = parsePioneers(await res.text(), res.url || PIONEERS_SOURCE_URL);
  if (pioneers.length === 0) throw new Error("Pioneers source returned no pioneer cards");

  return { source: PIONEERS_SOURCE_URL, fetchedAt: new Date().toISOString(), pioneers };
}
