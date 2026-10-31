import { FLAG_KEYS } from "@/lib/db/reports";
import type { VerifyRequest } from "@/lib/types";
import { admit, errorResponse, jsonResponse, preflight } from "@/lib/universal/gateway";
import { runVerification } from "@/lib/verification/engine";
import { verifyRequestProblem } from "@/lib/verification/request";

/**
 * The SG16 verification engine for API key holders: same body and report as
 * /api/verify, metered per key instead of per visitor, and subject to the
 * same operator intake switch and daily budget.
 */
export async function POST(request: Request) {
  const admission = await admit(request, { flag: FLAG_KEYS.intake });
  if (admission instanceof Response) return admission;

  let body: VerifyRequest;
  try {
    body = (await request.json()) as VerifyRequest;
  } catch {
    return errorResponse(request, 400, "Request body must be valid JSON.", "invalid_request_error");
  }
  const problem = verifyRequestProblem(body);
  if (problem) return errorResponse(request, problem.status, problem.error, "invalid_request_error");

  const result = await runVerification(body, { ipFingerprint: admission.principal });
  if (!result.ok || !result.report) {
    const status = result.status ?? 500;
    return errorResponse(request, status, result.error ?? "Verification failed.", status >= 500 ? "server_error" : "invalid_request_error");
  }
  return jsonResponse(request, { ok: true, report: result.report });
}

export function OPTIONS(request: Request) {
  return preflight(request);
}
