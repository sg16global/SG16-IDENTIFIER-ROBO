import { db } from "@/db";
import { productCatalog } from "@/db/schema";
import type { EvidenceSource, ProviderCall, ReportFinding, RetailLink } from "@/lib/types";
import { CATALOG_SEED, matchCatalog, type CatalogEntry } from "@/lib/identifiers/catalog";
import { inspectBarcode, inspectImei, modelCodesInText, normalizeModel } from "@/lib/identifiers/checksums";
import { aiStructured } from "@/lib/providers/ai";
import { SCAM_SIGNALS } from "@/lib/verification/lexicon";
import { StepTimer, extractPrices, type ModuleInput, type ModuleOutput } from "@/lib/verification/module";
import { LIMITATION_LIBRARY, makeFinding, score } from "@/lib/verification/scoring";
import { newId, round, truncate } from "@/lib/utils";

/**
 * Product Identifier.
 *
 * Separates three things the market conflates: identifier *validity* (checksum),
 * identifier *attribution* (does this model code belong to this product) and
 * physical *authenticity* (which no database can decide).
 */

const SERIAL_RE = /\b(?=[A-Z0-9]*[A-Z])(?=[A-Z0-9]*\d)[A-Z0-9]{7,17}\b/g;

const PRICE_FLOOR: Record<string, number> = {
  Smartphone: 130, Laptop: 260, Charger: 9, "Audio accessory": 40,
  "Home appliance": 150, "Footwear / apparel": 45,
};

interface SpecAttribute {
  label: string;
  /** Catalogue spec fields that document this attribute; other fields are never read ("10Gb/s" is not storage). */
  fields: string[];
  /** Captures the claimed number (1) and, where units differ, the unit (2). */
  inputRe: RegExp;
  /** Captures a number or slash list "8/16/24" (1) and, where units differ, the unit (2). */
  catalogRe: RegExp;
  /** Converts units to a common base so "1 TB" equals "1024 GB" and "1.24 kg" equals "1240 g". */
  scale?: Record<string, number>;
  /** Accepts any value inside a documented range ("256 GB – 2 TB") or above a documented minimum ("from 1.12 kg"). */
  ranged?: boolean;
}

const SPEC_ATTRIBUTES: SpecAttribute[] = [
  { label: "Display size", fields: ["display"], inputRe: /(?<![\d.])(\d{1,2}(?:\.\d)?)[\s-]*(?:inch|inches|"|″)/i, catalogRe: /(?<![\d.])(\d{1,2}(?:\.\d)?)\s*in\b/i },
  { label: "Battery capacity", fields: ["battery"], inputRe: /(?<![\d.])(\d{3,5})\s*mah\b/i, catalogRe: /(?<![\d.])(\d{3,5})\s*mah\b/i },
  { label: "Memory", fields: ["memory", "ram"], inputRe: /(?<![\d.])(\d{1,2})\s*gb\s*(?:ram|memory|lpddr)/i, catalogRe: /(?<![\d.])(\d{1,2}(?:\s*\/\s*\d{1,2})*)\s*gb\b/i },
  { label: "Storage", fields: ["storage"], inputRe: /(?<![\d.])(\d{2,4}|\d(?=\s*tb))\s*(gb|tb)\b(?!\s*(?:ram|memory|lpddr|unified))/i, catalogRe: /(?<![\d.])(\d{1,4}(?:\s*\/\s*\d{1,4})*)\s*(gb|tb)\b/i, scale: { gb: 1, tb: 1024 }, ranged: true },
  { label: "Main camera", fields: ["camera"], inputRe: /(?<![\d.])(\d{2,3})\s*mp\b/i, catalogRe: /(?<![\d.])(\d{2,3})\s*mp\b/i },
  { label: "Weight", fields: ["weight"], inputRe: /(?<![\d.])(\d{2,4}(?:\.\d{1,2})?|\d(?:\.\d{1,2})?(?=\s*kg))\s*(kg|g)\b/i, catalogRe: /(?<![\d.])(\d{1,4}(?:\.\d{1,2})?)\s*(kg|g)\b/i, scale: { g: 1, kg: 1000 }, ranged: true },
  { label: "Charging power", fields: ["charging", "output"], inputRe: /(?<![\d.])(\d{2,3})\s*w\b/i, catalogRe: /(?<![\d.])(\d{2,3})\s*w\b/i },
];

/** "1.86–2.0 kg" → "1.86 kg–2.0 kg", so the first end of a range keeps its unit. */
const RANGE_UNIT_RE = /(\d+(?:\.\d+)?)\s*([–—]|-(?=\s*\d)|\bto\b)\s*(\d+(?:\.\d+)?)\s*([a-z]+)/gi;

/** Every number `re` finds in `text`, slash lists expanded, converted to the attribute's base unit. */
function specValues(text: string, re: RegExp, scale?: Record<string, number>): number[] {
  return [...text.replace(RANGE_UNIT_RE, "$1 $4$2$3 $4").matchAll(new RegExp(re.source, "gi"))].flatMap((m) => {
    const factor = scale?.[(m[2] ?? "").toLowerCase()] ?? 1;
    return m[1].split("/").map((n) => Math.round(Number.parseFloat(n) * factor * 1000) / 1000);
  });
}

async function loadCatalog(): Promise<{ entries: CatalogEntry[]; fromDb: boolean }> {
  try {
    const rows = await db.select().from(productCatalog).limit(400);
    if (rows.length) {
      return {
        fromDb: true,
        entries: rows.map((r) => ({
          brand: r.brand,
          model: r.model,
          family: r.family ?? undefined,
          category: r.category,
          identifiers: (r.identifiers as CatalogEntry["identifiers"]) ?? { models: [] },
          specs: (r.specs as Record<string, string>) ?? {},
          knownCounterfeitSignals: (r.knownCounterfeitSignals as string[]) ?? [],
          officialUrl: r.officialUrl ?? "",
          source: r.source,
        })),
      };
    }
  } catch {
    /* fall through to the bundled seed */
  }
  return { entries: CATALOG_SEED, fromDb: false };
}

function priceValue(raw: string): number | null {
  const n = Number(raw.replace(/[^\d.]/g, "").replace(/(\.\d{2}).*$/, "$1"));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function verifyProduct(input: ModuleInput): Promise<ModuleOutput> {
  const timer = new StepTimer();
  const findings: ReportFinding[] = [];
  const sources: EvidenceSource[] = [];
  const providers: ProviderCall[] = [];
  const limitations: string[] = [];
  const retailLinks: RetailLink[] = [];
  const text = input.raw;

  const ctx: {
    imei: ReturnType<typeof inspectImei>;
    barcode: ReturnType<typeof inspectBarcode>;
    serial: string | null;
    model: string | null;
    matched: ReturnType<typeof matchCatalog>[number] | null;
    alternatives: ReturnType<typeof matchCatalog>;
    catalogFromDb: boolean;
  } = {
    imei: { found: false }, barcode: { found: false }, serial: null, model: null,
    matched: null, alternatives: [], catalogFromDb: false,
  };

  await timer.run("Extract product identifiers", "Locate IMEI, GTIN/barcode, model code and serial candidates.", async () => {
    ctx.imei = inspectImei(text);
    ctx.barcode = inspectBarcode(text);
    const serials = [...new Set(text.toUpperCase().match(SERIAL_RE) ?? [])]
      .filter((s) => !ctx.imei.value?.includes(s) && s !== ctx.barcode.value);
    ctx.serial = serials[0] ?? null;
    ctx.model = (() => {
      const explicit = text.match(/(?:model|model\s*(?:no|number|#)|type)\s*[:#]?\s*([A-Z0-9][A-Z0-9/.\-\s]{2,24})/i);
      if (explicit?.[1]) return explicit[1].trim();
      return modelCodesInText(text)[0] ?? null;
    })();

    const found = [
      ctx.imei.found ? "IMEI" : null,
      ctx.barcode.found ? ctx.barcode.format : null,
      ctx.model ? "model code" : null,
      ctx.serial ? "serial candidate" : null,
    ].filter(Boolean);
    findings.push(makeFinding("extract", found.length ? `Identifiers located: ${found.join(", ")}` : "No structured identifier located",
      found.length
        ? `${ctx.imei.value ? `IMEI ${ctx.imei.value} · ` : ""}${ctx.barcode.value ? `${ctx.barcode.format} ${ctx.barcode.value} · ` : ""}${ctx.model ? `model ${ctx.model} · ` : ""}${ctx.serial ? `serial ${ctx.serial}` : ""}`
        : "Describe the product, paste the listing text, or enter the model number printed on the device or box.",
      found.length ? "info" : "unknown", found.length ? 0.2 : 0.4));
    return "done";
  });

  await timer.run("Validate identifier mathematics", "Luhn (IMEI) and GS1 modulo-10 (GTIN) check digits.", async () => {
    if (ctx.imei.found) {
      if (ctx.imei.checksumValid) {
        findings.push(makeFinding("checksum", "IMEI Luhn checksum passes",
          `${ctx.imei.detail} TAC (type allocation code) = ${ctx.imei.tac}.`, "positive", 0.7));
        sources.push({
          provider: "heuristics", title: `IMEI ${ctx.imei.value} — Luhn verification`,
          excerpt: ctx.imei.detail ?? "", stance: "supports",
          retrievedAt: new Date().toISOString(), trustTier: "official",
        });
      } else {
        findings.push(makeFinding("checksum", "IMEI checksum FAILS",
          ctx.imei.detail ?? "", "risk", 1.5));
        sources.push({
          provider: "heuristics", title: `IMEI ${ctx.imei.value} — Luhn verification failed`,
          excerpt: ctx.imei.detail ?? "", stance: "contradicts",
          retrievedAt: new Date().toISOString(), trustTier: "official",
        });
      }
    }
    if (ctx.barcode.found) {
      if (ctx.barcode.checksumValid) {
        findings.push(makeFinding("checksum", `${ctx.barcode.format} check digit is valid`,
          ctx.barcode.detail ?? "", "positive", 0.55));
        if (ctx.barcode.prefixMeaning) {
          findings.push(makeFinding("checksum", `GS1 prefix ${ctx.barcode.gs1Prefix}`,
            ctx.barcode.prefixMeaning, "info", 0.2));
        }
      } else {
        findings.push(makeFinding("checksum", `${ctx.barcode.format} check digit is INVALID`,
          ctx.barcode.detail ?? "", "risk", 1.6));
      }
    }
    if (!ctx.imei.found && !ctx.barcode.found) {
      findings.push(makeFinding("checksum", "No checksum-bearing identifier supplied",
        "Without an IMEI or GTIN there is no mathematical validity test to run. Model codes and serial numbers are not checksummed by manufacturers.",
        "unknown", 0.35));
    }
    return "done";
  });

  await timer.run("Match against the product catalogue", "Compare normalised identifiers with known brand/model records.", async () => {
    const { entries, fromDb } = await loadCatalog();
    ctx.catalogFromDb = fromDb;
    providers.push({
      provider: "catalog", operation: fromDb ? "postgres:product_catalog" : "bundled-seed",
      status: "ok", latencyMs: 0, costUsd: 0,
      detail: `${entries.length} catalogue records loaded from ${fromDb ? "PostgreSQL" : "the bundled starter dataset"}.`,
    });
    const query = [ctx.model ?? "", ctx.barcode?.value ?? "", text].filter(Boolean).join(" ");
    ctx.alternatives = matchCatalog(query, entries, 4);
    ctx.matched = ctx.alternatives[0] ?? null;

    if (!ctx.matched) {
      findings.push(makeFinding("catalog", "No catalogue record matched",
        `Nothing in the ${entries.length}-record catalogue matched "${truncate(query, 80)}". The catalogue is a starter dataset, not a manufacturer feed — absence here is not evidence of counterfeiting.`,
        "unknown", 0.6));
      limitations.push("The internal catalogue covers a limited set of popular electronics. A non-match means the record is absent, not that the product does not exist.");
      return "done";
    }

    const entry = ctx.matched.entry;
    sources.push({
      provider: "catalog",
      url: entry.officialUrl,
      title: `${entry.brand} ${entry.model} — official specification reference`,
      publisher: entry.brand,
      excerpt: `Model codes: ${entry.identifiers.models.join(", ") || entry.identifiers.skuPattern || "n/a"} · Category: ${entry.category}`,
      stance: "supports",
      retrievedAt: new Date().toISOString(),
      trustTier: "official",
      meta: { matchScore: round(ctx.matched.score), matchedOn: ctx.matched.matchedOn },
    });
    findings.push(makeFinding("catalog", `Matched ${entry.brand} ${entry.model}`,
      `Match strength ${round(ctx.matched.score)}/2.6 · matched on ${ctx.matched.matchedOn.join("; ")}.`,
      ctx.matched.score >= 1.4 ? "positive" : "info",
      Math.min(1.2, 0.35 + ctx.matched.score * 0.4)));

    if (ctx.imei.found && entry.identifiers.models.length) {
      findings.push(makeFinding("catalog", "IMEI TAC was not resolvable to a model",
        `The TAC ${ctx.imei.tac} was not checked against a GSMA type-allocation database in this deployment, so it could not be tied to ${entry.model}.`,
        "unknown", 0.4));
      limitations.push("No GSMA / manufacturer TAC database is licensed in this deployment, so an IMEI could not be mapped to a specific model.");
    }
    return "done";
  });

  await timer.run("Cross-check claimed specifications", "Compare numbers in the submission against the matched record.", async () => {
    const entry = ctx.matched?.entry;
    if (!entry) return "skipped";
    let contradictions = 0;
    let confirmations = 0;

    for (const attr of SPEC_ATTRIBUTES) {
      const inputMatch = text.match(attr.inputRe);
      if (!inputMatch) continue;
      const documentedText = attr.fields.map((f) => entry.specs[f]).filter(Boolean).join(" · ");
      const documented = specValues(documentedText, attr.catalogRe, attr.scale);
      if (!documented.length) continue;
      const claimedText = inputMatch[0].trim();
      const [claimed] = specValues(claimedText, attr.inputRe, attr.scale);
      const lowest = Math.min(...documented);
      const inRange = Boolean(attr.ranged) && claimed >= lowest && (
        (documented.length >= 2 && /[–—…-]|\bto\b/.test(documentedText) && claimed <= Math.max(...documented))
        || /\bfrom\b/i.test(documentedText));
      if (documented.includes(claimed) || inRange) {
        confirmations += 1;
        findings.push(makeFinding("specs", `${attr.label} agrees with the official record`,
          `Submitted ${claimedText}; ${entry.brand} ${entry.model} is documented with ${documentedText}.`,
          "positive", 0.45));
      } else {
        contradictions += 1;
        findings.push(makeFinding("specs", `${attr.label} contradicts the official record`,
          `Submitted ${claimedText}, but ${entry.brand} ${entry.model} is documented as ${documentedText}. A specification that the manufacturer never shipped is a strong counterfeit indicator.`,
          "risk", 0.9));
      }
    }

    for (const code of entry.identifiers.models) {
      if (text.toUpperCase().includes(normalizeModel(code)) || text.toUpperCase().includes(code.toUpperCase())) {
        findings.push(makeFinding("specs", `Model code "${code}" is a documented variant`,
          `${entry.brand} publishes this code for ${entry.model}. Counterfeiters copy real codes, so this confirms attribution of the code, not the device.`,
          "positive", 0.5));
        break;
      }
    }

    if (!contradictions && !confirmations) {
      findings.push(makeFinding("specs", "No numeric specifications supplied to compare",
        "Add the display size, battery capacity, memory, storage or camera resolution printed on the box or listing so they can be compared with the official record.",
        "unknown", 0.4));
    }
    if (contradictions) {
      findings.push(makeFinding("specs", `${contradictions} specification contradiction(s)`,
        "Contradicting specifications are the most reliable catalogue-based counterfeit signal available without physical inspection.",
        "risk", 0.5 + contradictions * 0.3));
    }
    return "done";
  });

  await timer.run("Price and seller plausibility", "Compare quoted price with the category floor and scan listing language.", async () => {
    const entry = ctx.matched?.entry;
    const prices = extractPrices(text).map(priceValue).filter((p): p is number => p !== null);
    if (prices.length && entry) {
      const floor = PRICE_FLOOR[entry.category] ?? 50;
      const lowest = Math.min(...prices);
      if (lowest < floor * 0.35) {
        findings.push(makeFinding("price", `Quoted price is implausibly low for a ${entry.category}`,
          `A price of ${lowest.toFixed(2)} is far below the ${floor} currency-unit wholesale/retail floor for ${entry.category} products. Genuine stock is not sold below the cost of its components.`,
          "risk", 0.95));
      } else if (lowest < floor * 0.7) {
        findings.push(makeFinding("price", "Price is below the plausible retail floor",
          `${lowest.toFixed(2)} is unusually low for this category; verify the seller's return policy and the payment method before purchasing.`,
          "warning", 0.5));
      } else {
        findings.push(makeFinding("price", "Price is within a plausible range",
          `${lowest.toFixed(2)} is not below the ${floor} category floor used by this engine. Price alone is never proof either way.`,
          "positive", 0.3));
      }
    }

    const listingHits = SCAM_SIGNALS.filter((s) => s.re.test(text));
    for (const h of listingHits) {
      findings.push(makeFinding("seller", h.label, h.why, h.weight >= 0.2 ? "risk" : "warning", h.weight * 0.9));
    }
    if (!listingHits.length && text.length > 60) {
      findings.push(makeFinding("seller", "No manipulative listing language detected",
        "The submitted text does not use urgency, counterfeit-grade marketing terms, irreversible payment methods or artificial scarcity.",
        "positive", 0.4));
    }
    if (input.classification.urls.length) {
      findings.push(makeFinding("seller", "A listing or seller URL was supplied",
        "This submission also fits the Website & Scam Identifier. Run the same text in that module for domain age, DNS, TLS, redirect and reputation evidence.",
        "info", 0.2));
    }
    return "done";
  });

  await timer.run("AI specification comparison", "Optional AI pass to compare messy listing text with the catalogue record.", async () => {
    const entry = ctx.matched?.entry;
    if (!entry || !input.flags.expensiveEnabled) {
      providers.push({ provider: "ai-analysis", operation: "product-compare", status: "disabled", latencyMs: 0, costUsd: 0, detail: "No match, or expensive operations switched off." });
      return "skipped";
    }
    const { json, call } = await aiStructured<{ discrepancies?: string[]; consistent?: string[]; summary?: string }>({
      reportId: input.reportId,
      operation: "product-compare",
      system: "You compare a product listing against a manufacturer specification record. You never invent specifications.",
      schemaHint: `{"consistent": string[], "discrepancies": string[], "summary": string}`,
      user: `LISTING / USER TEXT:\n${truncate(text, 2500)}\n\nCATALOGUE RECORD:\n${entry.brand} ${entry.model}\n${Object.entries(entry.specs).map(([k, v]) => `- ${k}: ${v}`).join("\n")}`,
    });
    providers.push(call);
    for (const d of json?.discrepancies ?? []) {
      findings.push(makeFinding("ai", "AI-detected discrepancy", truncate(d, 300), "warning", 0.4));
    }
    for (const c of json?.consistent ?? []) {
      findings.push(makeFinding("ai", "AI-detected consistency", truncate(c, 300), "info", 0.15));
    }
    if (json?.summary) findings.push(makeFinding("ai", "AI analyst summary", truncate(json.summary, 500), "info", 0.2));
    return json ? "done" : "skipped";
  });

  const entry = ctx.matched?.entry;
  if (entry) {
    findings.push(makeFinding("fieldcheck", `Known counterfeit signals for ${entry.brand} ${entry.model}`,
      entry.knownCounterfeitSignals.map((s, i) => `${i + 1}. ${s}`).join("\n"),
      "info", 0.2));
    retailLinks.push({
      retailer: `${entry.brand} official store`,
      label: `Compare with the official ${entry.brand} page for ${entry.model}`,
      destination: entry.officialUrl,
      productRef: `${entry.brand}-${entry.model}`.replace(/\s+/g, "-").toLowerCase(),
      disclosed: true,
    });
    retailLinks.push({
      retailer: "Authorised retailer search",
      label: `Find authorised sellers of ${entry.brand} ${entry.model}`,
      destination: `https://www.google.com/search?q=${encodeURIComponent(`"${entry.brand} ${entry.model}" authorised retailer site:${new URL(entry.officialUrl).hostname || entry.brand.toLowerCase() + ".com"}`)}`,
      productRef: `${entry.brand}-${entry.model}-retailers`.replace(/\s+/g, "-").toLowerCase(),
      disclosed: true,
    });
  }

  limitations.push(LIMITATION_LIBRARY.serialInsufficient, LIMITATION_LIBRARY.physicalInspection, LIMITATION_LIBRARY.pointInTime);
  if (!ctx.catalogFromDb) {
    limitations.push("The catalogue used was the bundled starter dataset, not a licensed manufacturer or GS1 feed.");
  }
  limitations.push("SG16 Identifier is not affiliated with, endorsed by, or acting on behalf of any manufacturer named in this report.");

  const scored = score({
    findings,
    sources,
    category: "product",
    authoritativeHit: Boolean(entry),
    definitiveNegative:
      ctx.imei.found === true && ctx.imei.checksumValid === false ||
      ctx.barcode.found === true && ctx.barcode.checksumValid === false,
    definitivePositive: false, // a catalogue match is never proof of authenticity
  });

  const headline =
    scored.status === "suspicious" ? "Suspicious — identifier or specification problems found"
    : scored.status === "likely_authentic" ? "Consistent with official records — physical check still required"
    : scored.status === "verified" ? "Identifier validated against available records"
    : "Unable to verify authenticity from the information supplied";

  const summary = [
    entry ? `${entry.brand} ${entry.model} (${entry.category}).` : "No catalogue record matched.",
    headline + ".",
    scored.explanation,
    ctx.imei.found ? `IMEI checksum ${ctx.imei.checksumValid ? "valid" : "INVALID"}.` : "",
    ctx.barcode.found ? `${ctx.barcode.format} check digit ${ctx.barcode.checksumValid ? "valid" : "INVALID"}.` : "",
  ].filter(Boolean).join(" ");

  const nextSteps = entry
    ? [
        `Open the official ${entry.brand} specification page (${entry.officialUrl}) and compare every number printed on the box.`,
        entry.knownCounterfeitSignals[0] ?? "Run the manufacturer's own device diagnostics.",
        "Measure the item: weight and material density are the two fastest physical discriminators.",
        "If a serial or IMEI was supplied, enter it on the manufacturer's own warranty/coverage checker — not on a link the seller gives you.",
        "Ask the seller for a dated photo of the item next to a handwritten reference; refusal is itself a signal.",
      ]
    : [
        "Supply the exact model code printed on the device, box or invoice (for example SM-S928B or A3113).",
        "If you have a barcode, enter the digits below the bars so the GS1 check digit can be validated.",
        "Check the manufacturer's own product page for the specification list before paying.",
        "Flag this report if you believe the catalogue should include this model; SG16 adds records on review.",
      ];

  return {
    category: "product",
    status: scored.status,
    confidence: scored.confidence,
    headline,
    summary: truncate(summary, 900),
    findings,
    sources,
    limitations,
    nextSteps,
    retailLinks,
    payload: {
      imei: ctx.imei.found ? ctx.imei : null,
      barcode: ctx.barcode.found ? ctx.barcode : null,
      serial: ctx.serial,
      modelCode: ctx.model,
      matchedEntry: entry ? { brand: entry.brand, model: entry.model, category: entry.category, officialUrl: entry.officialUrl, specs: entry.specs, identifiers: entry.identifiers } : null,
      alternatives: ctx.alternatives.slice(1).map((a) => ({ brand: a.entry.brand, model: a.entry.model, score: round(a.score), matchedOn: a.matchedOn })),
      catalogFromDb: ctx.catalogFromDb,
      supportScore: scored.supportScore,
      riskScore: scored.riskScore,
    },
    workflow: timer.list,
    providers,
    authoritativeHit: Boolean(entry),
    definitiveNegative:
      (ctx.imei.found && ctx.imei.checksumValid === false) ||
      (ctx.barcode.found && ctx.barcode.checksumValid === false),
  };
}

export async function ensureCatalogSeeded(): Promise<number> {
  try {
    const existing = await db.select({ id: productCatalog.id }).from(productCatalog).limit(1);
    if (existing.length) return 0;
    await db.insert(productCatalog).values(
      CATALOG_SEED.map((e) => ({
        id: newId(),
        brand: e.brand,
        model: e.model,
        family: e.family ?? null,
        category: e.category,
        identifiers: e.identifiers,
        specs: e.specs,
        knownCounterfeitSignals: e.knownCounterfeitSignals,
        officialUrl: e.officialUrl,
        source: e.source,
      })),
    );
    return CATALOG_SEED.length;
  } catch {
    return 0;
  }
}
