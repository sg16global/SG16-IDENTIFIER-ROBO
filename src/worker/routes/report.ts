import { loadReport, recordFeedback } from "@/lib/db/reports";
import { POLICIES, consumeRateLimit, requestFingerprint } from "@/lib/security/rate-limit";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const publicId = id.trim().toUpperCase();
  if (!/^SG16-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(publicId)) {
    return Response.json({ ok: false, error: "Malformed report reference." }, { status: 400 });
  }
  try {
    const report = await loadReport(publicId);
    if (!report) {
      return Response.json(
        { ok: false, error: `No report exists for ${publicId}. Reports are retained for the configured window and then deleted.` },
        { status: 404 },
      );
    }
    return Response.json({ ok: true, report }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return Response.json({ ok: false, error: (error as Error).message }, { status: 500 });
  }
}

/** Correction / dispute submission (blueprint §3 "flag an incorrect result"). */
export async function POST(request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const fingerprint = requestFingerprint(request.headers);
  const limit = await consumeRateLimit(fingerprint, POLICIES.feedback);
  if (!limit.allowed) {
    return Response.json({ ok: false, error: "Too many submissions. Try again shortly." }, { status: 429 });
  }

  let body: { kind?: string; message?: string; contact?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const kind = String(body.kind ?? "correction").slice(0, 32);
  const message = (body.message ?? "").toString().trim();
  if (!message) {
    return Response.json({ ok: false, error: "Please describe what is wrong with this result." }, { status: 400 });
  }
  const publicId = id.trim().toUpperCase();
  let reportId: string | null = null;
  try {
    const report = await loadReport(publicId);
    reportId = report?.reportId ?? null;
  } catch {
    /* keep the feedback even if the report is gone */
  }

  await recordFeedback({
    reportId,
    publicId,
    kind,
    message,
    contact: body.contact ? String(body.contact).slice(0, 160) : null,
  });

  return Response.json({
    ok: true,
    message: "Correction received. SG16 reviews disputed results and republishes where the evidence was wrong.",
  });
}
