import { fetchLivePioneers } from "@/lib/pioneers";

/** AI Pioneers, read live from the SG16 cloud (see src/lib/pioneers.ts). */
export async function GET() {
  try {
    const payload = await fetchLivePioneers();
    return Response.json(
      { ok: true, ...payload },
      { headers: { "cache-control": "public, max-age=300, stale-while-revalidate=3600" } },
    );
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Pioneers source unreachable" },
      { status: 502, headers: { "cache-control": "no-store" } },
    );
  }
}
