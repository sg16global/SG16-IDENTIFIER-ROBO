import type {
  EvidenceSource,
  ProviderCall,
  ReportFinding,
  RetailLink,
  VerificationCategory,
  VerdictStatus,
  WorkflowStep,
} from "@/lib/types";
import type { Classification } from "@/lib/verification/classify";

export interface UploadedFile {
  name: string;
  mime: string;
  kind: string;
  bytes: number;
  sha256: string;
  data: Uint8Array;
}

export interface EngineFlags {
  /** Emergency switch: disables paid provider calls (blueprint §8). */
  expensiveEnabled: boolean;
  /** Whether the server may perform outbound HTTP against untrusted URLs. */
  outboundFetchEnabled: boolean;
  /** Whether DNS/TLS lookups are permitted. */
  dnsEnabled: boolean;
}

export interface ModuleInput {
  raw: string;
  classification: Classification;
  file?: UploadedFile | null;
  reportId?: string;
  flags: EngineFlags;
}

export interface ModuleOutput {
  category: VerificationCategory;
  status: VerdictStatus;
  confidence: number | null;
  headline: string;
  summary: string;
  findings: ReportFinding[];
  sources: EvidenceSource[];
  limitations: string[];
  nextSteps: string[];
  payload: Record<string, unknown>;
  workflow: WorkflowStep[];
  providers: ProviderCall[];
  retailLinks?: RetailLink[];
  definitiveNegative?: boolean;
  definitivePositive?: boolean;
  authoritativeHit?: boolean;
}

export class StepTimer {
  private steps: WorkflowStep[] = [];
  private index = 0;

  async run(label: string, detail: string, fn: () => Promise<"done" | "skipped" | "failed">): Promise<void> {
    const started = Date.now();
    let status: WorkflowStep["status"] = "done";
    try {
      status = await fn();
    } catch {
      status = "failed";
    }
    this.index += 1;
    this.steps.push({ index: this.index, label, detail, status, ms: Date.now() - started });
  }

  get list(): WorkflowStep[] {
    return this.steps;
  }

  get totalMs(): number {
    return this.steps.reduce((sum, s) => sum + s.ms, 0);
  }
}

/* ------------------------- text analysis helpers ------------------------- */

const SENTENCE_RE = /(?<=[.!?…])\s+(?=[A-Z0-9"'“([])/g;

/** Deterministic claim decomposition used when no AI provider is configured. */
export function splitClaims(text: string, limit = 6): string[] {
  const cleaned = text
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const sentences = cleaned.split(SENTENCE_RE).map((s) => s.trim()).filter((s) => s.length > 24);
  const scored = sentences.map((s) => {
    let score = 0;
    if (/\d/.test(s)) score += 2;
    if (/\b(said|says|claimed|announced|confirmed|denied|reported)\b/i.test(s)) score += 2;
    if (/\b(causes?|leads to|prevents|cures|banned|approved|signed|died|elected)\b/i.test(s)) score += 1.5;
    if (/[A-Z][a-z]+(?:\s[A-Z][a-z]+)+/.test(s)) score += 1; // proper nouns
    if (/\b(all|never|always|every|no one|everyone)\b/i.test(s)) score += 1;
    if (s.length > 60 && s.length < 300) score += 1;
    if (/^\s*(and|but|so|also|however)\b/i.test(s)) score -= 1;
    return { s, score };
  });
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .filter((x) => x.score > 0.5)
    .map((x) => x.s);
}

const DATE_RE = /\b(?:(?:\d{1,2}\s)?(?:January|February|March|April|May|June|July|August|September|October|November|December)\s\d{1,2}?,?\s?\d{4}|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4})\b/gi;

export function extractDates(text: string): string[] {
  return [...new Set(text.match(DATE_RE) ?? [])].slice(0, 8);
}

const QUOTE_RE = /["“]([^"”]{12,220})["”]/g;
export function extractQuotes(text: string): string[] {
  return [...new Set([...text.matchAll(QUOTE_RE)].map((m) => m[1].trim()))].slice(0, 5);
}

export function extractNumbers(text: string): string[] {
  return [...new Set(text.match(/\b\d[\d.,]*\s?(?:%|percent|million|billion|thousand|k\b)?/gi) ?? [])].slice(0, 12);
}

const PRICE_RE = /(?:[$€£¥₹]|usd|eur|gbp|ngn|kes|zar|ghs)\s?\d[\d,]*(?:\.\d{2})?/gi;
export function extractPrices(text: string): string[] {
  return [...new Set(text.match(PRICE_RE) ?? [])].slice(0, 6);
}

export function sentenceCase(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
