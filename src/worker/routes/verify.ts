import type { VerifyRequest } from "@/lib/types";
import { runVerification } from "@/lib/verification/engine";
import {
  POLICIES,
  budgetExhausted,
  consumeRateLimit,
  noteBudgetBlock,
  requestFingerprint,
} from "@/lib/security/rate-limit";
import { getFlagStates, FLAG_KEYS } from "@/lib/db/reports";
import { verifyRequestProblem } from "@/lib/verification/request";

export async function POST(request: Request) {
  const fingerprint = requestFingerprint(request.headers);
  const limit = await consumeRateLimit(fingerprint, POLICIES.verify);
  if (!limit.allowed) {
    return Response.json(
      {
        ok: false,
        error: `Rate limit reached (${limit.limit} checks per minute). Retry in ${Math.ceil(limit.retryAfterMs / 1000)}s.`,
        retryAfterMs: limit.retryAfterMs,
      },
      { status: 429, headers: { "retry-after": String(Math.ceil(limit.retryAfterMs / 1000)) } },
    );
  }

  let body: VerifyRequest;
  try {
    body = (await request.json()) as VerifyRequest;
  } catch {
    return Response.json({ ok: false, error: "Request body must be valid JSON." }, { status: 400 });
  }

  const problem = verifyRequestProblem(body);
  if (problem) {
    return Response.json({ ok: false, error: problem.error }, { status: problem.status });
  }

  const flags = await getFlagStates();
  if (flags[FLAG_KEYS.intake] === false) {
    return Response.json(
      { ok: false, error: "Public intake is temporarily paused by the operator. Existing reports remain available." },
      { status: 503 },
    );
  }
  if (await budgetExhausted()) {
    await noteBudgetBlock();
    return Response.json(
      { ok: false, error: "Today's variable-cost budget is exhausted. Free local checks resume at 00:00 UTC." },
      { status: 429 },
    );
  }

  const result = await runVerification(body, { ipFingerprint: fingerprint });
  if (!result.ok || !result.report) {
    return Response.json({ ok: false, error: result.error ?? "Verification failed." }, { status: result.status ?? 500 });
  }

  return Response.json(
    { ok: true, report: result.report, rateLimit: { remaining: limit.remaining, limit: limit.limit } },
    { headers: { "cache-control": "no-store" } },
  );
}
