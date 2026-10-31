import type { VerificationCategory } from "@/lib/types";
import { inspectBarcode, inspectImei, looksLikeModelNumber, modelCodesInText } from "@/lib/identifiers/checksums";
import { parseUntrustedUrl } from "@/lib/security/url-guard";
import { PRODUCT_CATEGORY_RULES, SCAM_SIGNALS, brandsInText } from "@/lib/verification/lexicon";

export interface Classification {
  category: VerificationCategory;
  confidence: number;
  inputKind:
    | "url"
    | "email"
    | "image"
    | "barcode"
    | "imei"
    | "model"
    | "text"
    | "mixed";
  urls: string[];
  emails: string[];
  brands: string[];
  reasons: string[];
  alternatives: Array<{ category: VerificationCategory; why: string }>;
}

const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"'()[\]]+/gi;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const SPEC_QUANTITY_RE = /\b\d+(?:\.\d+)?[\s-]?(?:gb|tb|mah|wh|w|hz|mp|mm|inch(?:es)?)\b/gi;
const LISTING_RE = /\b(?:seller|sealed|brand[\s-]new|new in box|bulk lot|ships? from|for sale|refurbished)\b|[$€£]\s?\d/i;

export function classifyInput(
  raw: string,
  file?: { name: string; kind?: string } | null,
): Classification {
  const text = raw.trim();
  const urls = [...new Set(text.match(URL_RE) ?? [])];
  const emails = [...new Set(text.match(EMAIL_RE) ?? [])];

  const brands = brandsInText(text);
  const imei = inspectImei(text);
  const barcode = inspectBarcode(text);
  const model = looksLikeModelNumber(text) && text.length <= 32 ? text : null;
  const embeddedModel = model ? null : (modelCodesInText(text)[0] ?? null);
  const reasons: string[] = [];
  const alternatives: Classification["alternatives"] = [];

  // Score each category, then pick the strongest with an explicit reason.
  const scores: Record<VerificationCategory, number> = { claim: 0, website: 0, product: 0, media: 0 };

  if (file) {
    const imageKind = ["jpeg", "png", "webp", "gif", "heif", "heic", "avif"].includes(file.kind ?? "");
    const imageExt = /\.(jpe?g|png|webp|gif|heic|avif|bmp)$/i.test(file.name);
    if (imageKind || imageExt) {
      scores.media += 1.4;
      reasons.push(`An image file was attached (${file.name}) — routed to the Image & Video Identifier.`);
    } else if (/\.pdf$/i.test(file.name)) {
      scores.claim += 0.6;
      reasons.push("A PDF was attached — text extracted for claim analysis.");
    }
  }

  if (urls.length) {
    scores.website += 0.9;
    reasons.push(`One or more URLs detected (${urls.length}) — domain and page behaviour checks apply.`);
  }
  if (emails.length) {
    scores.website += 0.5;
    reasons.push("An email address was detected — treated as part of a message/report analysis.");
  }
  if (imei.found) {
    scores.product += 1.2;
    reasons.push(`A 15-digit IMEI candidate was found${imei.checksumValid ? " and its Luhn checksum passes" : " but its Luhn checksum fails"}.`);
  }
  if (barcode.found) {
    scores.product += 1.1;
    reasons.push(`A ${barcode.format} candidate was found${barcode.checksumValid ? " with a valid GS1 check digit" : " with an INVALID check digit"}.`);
  }
  if (model) {
    scores.product += 0.85;
    reasons.push(`"${model}" matches the shape of a manufacturer model number (letters + digits, 4–32 characters).`);
  } else if (embeddedModel) {
    // A code inside prose is weaker evidence on its own ("COVID-19"), so it needs specs or listing details to outrank a claim.
    const corroboration = (text.match(SPEC_QUANTITY_RE) ?? []).length + (LISTING_RE.test(text) ? 1 : 0);
    scores.product += 0.6 + 0.25 * Math.min(corroboration, 3);
    reasons.push(`"${embeddedModel}" inside the text has the shape of a manufacturer model code${corroboration ? ", alongside specification or listing details" : ""}.`);
  }
  if (brands.length && !urls.length) {
    scores.product += 0.25 * Math.min(brands.length, 3);
    reasons.push(`Brand terms detected: ${brands.slice(0, 5).join(", ")}.`);
  }

  const scamHits = SCAM_SIGNALS.filter((s) => s.re.test(text));
  if (scamHits.length >= 3) {
    scores.website += 0.35 * Math.min(scamHits.length, 5);
    reasons.push(`${scamHits.length} scam-language signals present, e.g. "${scamHits[0].label}".`);
  }
  if (!urls.length && !imei.found && !barcode.found && !model && !file) {
    scores.claim += 1;
    reasons.push("Plain narrative text with no identifier, URL or attachment — treated as a claim to fact-check.");
  }
  if (text.length > 240 && !urls.length) {
    scores.claim += 0.4;
    reasons.push("Long-form prose suggests an article, post or message to verify.");
  }

  for (const rule of PRODUCT_CATEGORY_RULES) {
    if (rule.re.test(text)) {
      scores[rule.category] += 0.5;
      reasons.push(`Explicit vocabulary matched the ${rule.category} workflow.`);
    }
  }

  const ranked = (Object.entries(scores) as Array<[VerificationCategory, number]>)
    .filter(([, s]) => s > 0)
    .sort((a, b) => b[1] - a[1]);

  const [category, top] = ranked[0] ?? ["claim", 0];
  const second = ranked[1]?.[1] ?? 0;
  const confidence = top === 0 ? 0.35 : Math.max(0.4, Math.min(0.97, 0.5 + (top - second) * 0.28 + top * 0.09));

  for (const [alt] of ranked.slice(1, 3)) {
    alternatives.push({ category: alt, why: `Input also fits the ${alt} workflow — you can override the routing above.` });
  }

  const inputKind: Classification["inputKind"] = file
    ? "image"
    : urls.length && (imei.found || barcode.found || model)
      ? "mixed"
      : urls.length
        ? "url"
        : emails.length
          ? "email"
          : imei.found
            ? "imei"
            : barcode.found
              ? "barcode"
              : model
                ? "model"
                : "text";

  return { category, confidence, inputKind, urls, emails, brands, reasons, alternatives };
}

export function firstSafeUrl(urls: string[]): { url: string; note?: string } | null {
  for (const candidate of urls) {
    const parsed = parseUntrustedUrl(candidate);
    if (parsed.ok) return { url: candidate };
  }
  return urls.length ? { url: urls[0], note: parseUntrustedUrl(urls[0]).reason } : null;
}
