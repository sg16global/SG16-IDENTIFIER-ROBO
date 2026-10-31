/**
 * SG16 Identifier — shared report contract.
 * Every verification module returns this same core structure (blueprint §6)
 * so the UI, API and database never special-case a category.
 */

export type VerificationCategory = "claim" | "website" | "product" | "media";

/**
 * Deliberately *not* "real / fake". The taxonomy separates what was checked
 * from what remains unknown (blueprint §3).
 */
export type VerdictStatus =
  | "verified"
  | "likely_authentic"
  | "supported"
  | "suspicious"
  | "disputed"
  | "misleading"
  | "high_risk"
  | "contradicted"
  | "unable_to_verify";

export type FindingSeverity = "positive" | "warning" | "risk" | "unknown" | "info";
export type EvidenceStance = "supports" | "contradicts" | "context" | "neutral";
export type TrustTier = "official" | "reputable" | "mixed" | "unrated";

export interface EvidenceSource {
  provider: string;
  url?: string;
  title?: string;
  publisher?: string;
  excerpt?: string;
  stance: EvidenceStance;
  publishedAt?: string | null;
  retrievedAt: string;
  trustTier?: TrustTier;
  meta?: Record<string, unknown>;
}

export interface ReportFinding {
  kind: string;
  title: string;
  detail: string;
  severity: FindingSeverity;
  weight: number;
  sourceRefs?: number[];
}

export interface ProviderCall {
  provider: string;
  operation: string;
  status: "ok" | "skipped" | "error" | "disabled";
  latencyMs: number;
  costUsd: number;
  tokensIn?: number;
  tokensOut?: number;
  error?: string;
  detail?: string;
}

export interface WorkflowStep {
  index: number;
  label: string;
  detail: string;
  status: "done" | "skipped" | "failed";
  ms: number;
}

export interface VerificationReport {
  reportId: string;
  publicId: string;
  category: VerificationCategory;
  status: VerdictStatus;
  confidence: number | null;
  summary: string;
  headline: string;
  input: {
    kind: string;
    text?: string;
    url?: string;
    fileName?: string;
    bytes?: number;
  };
  findings: ReportFinding[];
  sources: EvidenceSource[];
  limitations: string[];
  nextSteps: string[];
  payload?: Record<string, unknown>;
  workflow: WorkflowStep[];
  providers: ProviderCall[];
  checkedAt: string;
  latencyMs: number;
  costUsd: number;
  retailLinks?: RetailLink[];
}

export interface RetailLink {
  retailer: string;
  label: string;
  destination: string;
  productRef: string;
  disclosed: boolean;
}

export interface VerifyRequest {
  input: string;
  category?: VerificationCategory | "auto";
  file?: { name: string; type: string; bytes: number; base64?: string } | null;
  shareable?: boolean;
}

export const VERDICT_LABEL: Record<VerdictStatus, string> = {
  verified: "Verified against available sources",
  likely_authentic: "Consistent with official records",
  supported: "Supported by retrieved evidence",
  suspicious: "Suspicious — further checking needed",
  disputed: "Disputed by credible sources",
  misleading: "Misleading / out of context",
  high_risk: "High risk — do not interact",
  contradicted: "Contradicted by the evidence",
  unable_to_verify: "Unable to verify",
};

export const VERDICT_TONE: Record<
  VerdictStatus,
  "ok" | "warn" | "risk" | "unknown"
> = {
  verified: "ok",
  likely_authentic: "ok",
  supported: "ok",
  suspicious: "warn",
  disputed: "warn",
  misleading: "warn",
  high_risk: "risk",
  contradicted: "risk",
  unable_to_verify: "unknown",
};

export const CATEGORY_LABEL: Record<VerificationCategory, string> = {
  claim: "News & Claim Identifier",
  website: "Website & Scam Identifier",
  product: "Product Identifier",
  media: "Image & Video Identifier",
};

export const CATEGORY_SHORT: Record<VerificationCategory, string> = {
  claim: "News",
  website: "Websites",
  product: "Products",
  media: "Media",
};

/** Live figures for the homepage engine panel (GET /api/stats). */
export interface EngineStats {
  /** false when the database could not be read — every figure below is then meaningless. */
  available: boolean;
  reports: number;
  cost: number;
  /** Median report latency in ms; null until a report with a latency exists. */
  latency: number | null;
  /** Median calibrated confidence over reports that stated one; null when none did. */
  confidence: number | null;
  /** Reports that stated a confidence (the rest abstained with null). */
  scored: number;
  last: string | null;
  catalog: number;
  providerCalls: number;
}

/** AI Pioneers read live from the SG16 cloud (GET /api/pioneers). */
export type Pioneer = {
  name: string;
  role: string;
  photo: string;
};

export type PioneersPayload = {
  source: string;
  fetchedAt: string;
  pioneers: Pioneer[];
};
