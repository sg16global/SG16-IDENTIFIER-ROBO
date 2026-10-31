import { CERTIFICATE_BASE64, CERTIFICATE_MIME } from "@/lib/legal/certificate-image";
import { POLICIES, consumeRateLimit, requestFingerprint } from "@/lib/security/rate-limit";

// The certificate is compiled into the server bundle (scripts/embed-certificate.mjs),
// so it has no static URL and needs no file system — Cloudflare Workers have none.
let certificateBytes: Uint8Array<ArrayBuffer> | null = null;
function certificate() {
  certificateBytes ??= Uint8Array.from(atob(CERTIFICATE_BASE64), (c) => c.charCodeAt(0));
  return certificateBytes;
}

/**
 * The Saif Tech Global LLC Certificate of Organization, for the footer's viewer.
 * Only same-origin fetch() calls are served: opening the URL in a tab
 * (Sec-Fetch-Dest: document) or embedding it as an <img> elsewhere is refused.
 * This deters casual saving and hotlinking; it cannot stop a determined client
 * that forges headers, or a screenshot.
 */
export async function GET(request: Request) {
  const site = request.headers.get("sec-fetch-site");
  const dest = request.headers.get("sec-fetch-dest");
  if (site !== "same-origin" || dest !== "empty") {
    return Response.json({ ok: false, error: "Viewable only on sg16identifier.com." }, { status: 403, headers: { "cache-control": "no-store" } });
  }

  const limit = await consumeRateLimit(requestFingerprint(request.headers), POLICIES.certificate);
  if (!limit.allowed) {
    return Response.json({ ok: false, error: "Too many requests." }, { status: 429, headers: { "cache-control": "no-store" } });
  }

  return new Response(certificate(), {
    headers: {
      "content-type": CERTIFICATE_MIME,
      "content-disposition": "inline",
      "cache-control": "private, no-store, max-age=0",
      "cross-origin-resource-policy": "same-origin",
      "x-content-type-options": "nosniff",
      "x-robots-tag": "noindex, noimageindex, noarchive",
    },
  });
}
