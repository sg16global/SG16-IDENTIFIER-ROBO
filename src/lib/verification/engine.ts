import type {
  ProviderCall,
  VerificationCategory,
  VerificationReport,
  VerifyRequest,
  WorkflowStep,
} from "@/lib/types";
import { CATEGORY_LABEL } from "@/lib/types";
import { classifyInput } from "@/lib/verification/classify";
import { verifyClaim } from "@/lib/verification/modules/claim";
import { verifyMedia } from "@/lib/verification/modules/media";
import { ensureCatalogSeeded, verifyProduct } from "@/lib/verification/modules/product";
import { verifyWebsite } from "@/lib/verification/modules/website";
import {
  type ModuleInput,
  type ModuleOutput,
  type UploadedFile,
} from "@/lib/verification/module";
import { validateUpload } from "@/lib/security/uploads";
import { ensureFlagsSeeded, getEngineFlags, persistReport } from "@/lib/db/reports";
import { base64ToBytes, newId, newPublicId, round } from "@/lib/utils";
import { getProviderConfigs } from "@/lib/providers/registry";

export interface EngineResult {
  ok: boolean;
  report?: VerificationReport;
  error?: string;
  status?: number;
}

const MODULES: Record<VerificationCategory, (input: ModuleInput) => Promise<ModuleOutput>> = {
  claim: verifyClaim,
  website: verifyWebsite,
  product: verifyProduct,
  media: verifyMedia,
};

export function resolveCategory(
  requested: VerificationCategory | "auto" | undefined,
  auto: VerificationCategory,
): { category: VerificationCategory; overridden: boolean } {
  if (requested && requested !== "auto") return { category: requested, overridden: requested !== auto };
  return { category: auto, overridden: false };
}

async function prepareFile(
  file: VerifyRequest["file"],
): Promise<{ uploaded: UploadedFile | null; error?: string }> {
  if (!file) return { uploaded: null };
  if (!file.base64) return { uploaded: null, error: "File payload was empty." };
  let raw: Uint8Array;
  try {
    raw = base64ToBytes(file.base64);
  } catch {
    return { uploaded: null, error: "File payload is not valid base64." };
  }
  const validation = await validateUpload(file.type ?? "application/octet-stream", raw);
  if (!validation.ok) return { uploaded: null, error: validation.reason };
  return {
    uploaded: {
      name: validation.internalName,
      mime: validation.mime,
      kind: validation.kind,
      bytes: raw.byteLength,
      sha256: validation.sha256,
      data: new Uint8Array(raw),
    },
  };
}

let bootstrapped = false;
async function bootstrapOnce(): Promise<void> {
  if (bootstrapped) return;
  bootstrapped = true;
  try {
    await Promise.all([ensureFlagsSeeded(), ensureCatalogSeeded()]);
  } catch {
    bootstrapped = false;
  }
}

export async function runVerification(
  request: VerifyRequest,
  opts: { ipFingerprint?: string } = {},
): Promise<EngineResult> {
  const startedAt = Date.now();
  await bootstrapOnce();
  const raw = (request.input ?? "").slice(0, 20000);

  if (!raw.trim() && !request.file) {
    return { ok: false, error: "Provide text, a URL, an identifier, or attach a file.", status: 400 };
  }

  const flags = await getEngineFlags();
  const classification = classifyInput(raw, request.file ? { name: request.file.name } : null);
  const { category, overridden } = resolveCategory(request.category, classification.category);

  const { uploaded, error } = await prepareFile(request.file);
  if (error) return { ok: false, error, status: 415 };

  const reportId = newId();
  const moduleInput: ModuleInput = {
    raw,
    classification,
    file: uploaded,
    reportId,
    flags,
  };

  let output: ModuleOutput;
  try {
    output = await MODULES[category](moduleInput);
  } catch (err) {
    return {
      ok: false,
      status: 500,
      error: `The ${CATEGORY_LABEL[category]} workflow failed: ${(err as Error).message}`,
    };
  }

  const providers: ProviderCall[] = [...output.providers];
  const workflow: WorkflowStep[] = [...output.workflow];
  const findings = [...output.findings];
  const sources = [...output.sources];
  const limitations = [...output.limitations];

  // Combined run: a product listing with a URL also needs seller/domain checks.
  if (category === "product" && classification.urls.length) {
    const secondary = await verifyWebsite({ ...moduleInput, raw: classification.urls.join(" ") });
    let stepOffset = workflow.length;
    for (const step of secondary.workflow) {
      stepOffset += 1;
      workflow.push({ ...step, index: stepOffset, label: `[Seller check] ${step.label}` });
    }
    providers.push(...secondary.providers);
    findings.push(...secondary.findings.map((f) => ({ ...f, kind: `seller:${f.kind}` })));
    sources.push(...secondary.sources);
    limitations.push(...secondary.limitations.filter((l) => !limitations.includes(l)));
  }

  const costUsd = round(providers.reduce((sum, p) => sum + (p.costUsd || 0), 0), 6);
  const latencyMs = Date.now() - startedAt;
  const nowIso = new Date().toISOString();

  const report: VerificationReport = {
    reportId,
    publicId: newPublicId(),
    category,
    status: output.status,
    confidence: output.confidence,
    summary: output.summary,
    headline: output.headline,
    input: {
      kind: uploaded ? "image" : classification.inputKind,
      text: uploaded ? undefined : raw.slice(0, 2000),
      url: classification.urls[0],
      fileName: uploaded?.name,
      bytes: uploaded?.bytes,
    },
    findings,
    sources,
    limitations,
    nextSteps: output.nextSteps,
    payload: {
      ...output.payload,
      headline: output.headline,
      classification: {
        category: classification.category,
        confidence: round(classification.confidence),
        inputKind: classification.inputKind,
        reasons: classification.reasons,
        alternatives: classification.alternatives,
        overridden,
        requested: request.category ?? "auto",
      },
      providersAvailable: getProviderConfigs().map((p) => ({ id: p.id, enabled: p.enabled, reason: p.reason })),
    },
    workflow,
    providers,
    checkedAt: nowIso,
    latencyMs,
    costUsd,
    retailLinks: output.retailLinks,
  };

  await persistReport(report, opts.ipFingerprint);
  return { ok: true, report };
}
