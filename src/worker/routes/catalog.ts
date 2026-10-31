import { sql } from "drizzle-orm";
import { db } from "@/db";
import { productCatalog } from "@/db/schema";

/** The normalised product records listed on /tools/products. */
export async function GET() {
  try {
    const rows = await db
      .select({
        brand: productCatalog.brand,
        model: productCatalog.model,
        category: productCatalog.category,
        identifiers: productCatalog.identifiers,
        specs: productCatalog.specs,
      })
      .from(productCatalog)
      .orderBy(sql`${productCatalog.brand}`)
      .limit(40);
    return Response.json({ ok: true, rows }, { headers: { "cache-control": "no-store" } });
  } catch {
    // The page renders without the catalogue rather than failing.
    return Response.json({ ok: false, rows: [] }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
