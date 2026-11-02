import { db, parseJson } from "@/db";

/** The normalised product records listed on /tools/products. */
export async function GET() {
  try {
    const rows = await db.all<{
      brand: string;
      model: string;
      category: string;
      identifiers: string;
      specs: string;
    }>(
      "select brand, model, category, identifiers, specs from product_catalog order by brand limit 40",
    );
    return Response.json(
      { ok: true, rows: rows.map((r) => ({ ...r, identifiers: parseJson(r.identifiers), specs: parseJson(r.specs) })) },
      { headers: { "cache-control": "no-store" } },
    );
  } catch {
    // The page renders without the catalogue rather than failing.
    return Response.json({ ok: false, rows: [] }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
