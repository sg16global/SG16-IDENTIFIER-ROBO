import { env } from "cloudflare:workers";
import { afterResponse } from "@/lib/request-scope";
import { IMAGE_SOURCE_RE, IMAGE_WIDTHS } from "@/lib/images";

type OutputFormat = "image/avif" | "image/webp" | "image/png" | "image/jpeg" | "image/gif";

/**
 * Resizes a local image (public/assets) with the Cloudflare Images binding and
 * returns AVIF or WebP when the browser accepts it. Only the fixed width list
 * and local files are accepted, so this cannot be used to fetch or amplify
 * arbitrary content. Results are kept in the edge cache.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const src = url.searchParams.get("url") ?? "";
  const width = Number(url.searchParams.get("w"));
  const quality = Number(url.searchParams.get("q") ?? "75");
  if (!IMAGE_SOURCE_RE.test(src) || !IMAGE_WIDTHS.includes(width) || !Number.isInteger(quality) || quality < 1 || quality > 100) {
    return Response.json({ ok: false, error: "Unsupported image request." }, { status: 400 });
  }

  const accept = request.headers.get("accept") ?? "";
  const negotiated: OutputFormat | null = accept.includes("image/avif") ? "image/avif" : accept.includes("image/webp") ? "image/webp" : null;
  const cache = caches.default;
  const cacheKey = new Request(`${url.origin}/api/image?url=${encodeURIComponent(src)}&w=${width}&q=${quality}&f=${negotiated ?? "original"}`);
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const original = await env.ASSETS.fetch(new URL(src, url.origin));
  if (!original.ok || !original.body) return new Response("Image not found", { status: 404 });
  const originalType = (original.headers.get("content-type") ?? "image/png").split(";")[0] as OutputFormat;

  let body: Response;
  try {
    const result = await env.IMAGES.input(original.body)
      .transform({ width, fit: "scale-down" })
      .output({ format: negotiated ?? originalType, quality });
    body = result.response();
  } catch (error) {
    // Unoptimised beats broken: serve the original file.
    console.error("[image] transform failed:", error);
    body = await env.ASSETS.fetch(new URL(src, url.origin));
  }

  const headers = new Headers(body.headers);
  headers.set("cache-control", "public, max-age=86400, stale-while-revalidate=604800");
  headers.set("vary", "accept");
  headers.set("x-content-type-options", "nosniff");
  const response = new Response(body.body, { status: 200, headers });
  afterResponse(cache.put(cacheKey, response.clone()));
  return response;
}
