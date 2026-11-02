import { db, parseJson } from "@/db";
import { admit, errorResponse, jsonResponse, preflight } from "@/lib/universal/gateway";

type Ctx = { params: Promise<{ brand: string; model: string }> };

/** The normalised catalogue record SG16 matches products against, with its provenance. */
export async function GET(request: Request, ctx: Ctx) {
  const admission = await admit(request);
  if (admission instanceof Response) return admission;

  const { brand, model } = await ctx.params;
  if (!brand.trim() || !model.trim() || brand.length > 96 || model.length > 160) {
    return errorResponse(request, 400, "Brand and model are required.", "invalid_request_error");
  }
  try {
    const row = await db.first<Record<string, unknown>>(
      "select * from product_catalog where lower(brand) = ? and lower(model) = ? limit 1",
      brand.trim().toLowerCase(),
      model.trim().toLowerCase(),
    );
    if (!row) return errorResponse(request, 404, `No catalogue record for ${brand} ${model}.`, "not_found");
    return jsonResponse(request, {
      ok: true,
      record: {
        ...row,
        identifiers: parseJson(row.identifiers),
        specs: parseJson(row.specs),
        known_counterfeit_signals: parseJson(row.known_counterfeit_signals),
      },
    });
  } catch (error) {
    return errorResponse(request, 500, (error as Error).message, "server_error");
  }
}

export function OPTIONS(request: Request) {
  return preflight(request);
}
