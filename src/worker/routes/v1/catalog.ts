import { and, sql } from "drizzle-orm";
import { db } from "@/db";
import { productCatalog } from "@/db/schema";
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
    const rows = await db
      .select()
      .from(productCatalog)
      .where(and(sql`lower(${productCatalog.brand}) = ${brand.trim().toLowerCase()}`, sql`lower(${productCatalog.model}) = ${model.trim().toLowerCase()}`))
      .limit(1);
    if (!rows[0]) return errorResponse(request, 404, `No catalogue record for ${brand} ${model}.`, "not_found");
    return jsonResponse(request, { ok: true, record: rows[0] });
  } catch (error) {
    return errorResponse(request, 500, (error as Error).message, "server_error");
  }
}

export function OPTIONS(request: Request) {
  return preflight(request);
}
