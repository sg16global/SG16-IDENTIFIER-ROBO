import { loadReport } from "@/lib/db/reports";
import { admit, errorResponse, jsonResponse, preflight } from "@/lib/universal/gateway";

type Ctx = { params: Promise<{ id: string }> };

/** A stored report by its public reference, identical in shape to /api/report/[id]. */
export async function GET(request: Request, ctx: Ctx) {
  const admission = await admit(request);
  if (admission instanceof Response) return admission;

  const publicId = (await ctx.params).id.trim().toUpperCase();
  if (!/^SG16-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(publicId)) {
    return errorResponse(request, 400, "Malformed report reference.", "invalid_request_error");
  }
  try {
    const report = await loadReport(publicId);
    if (!report) {
      return errorResponse(request, 404, `No report exists for ${publicId}. Reports are deleted after the retention window.`, "not_found");
    }
    return jsonResponse(request, { ok: true, report });
  } catch (error) {
    return errorResponse(request, 500, (error as Error).message, "server_error");
  }
}

export function OPTIONS(request: Request) {
  return preflight(request);
}
