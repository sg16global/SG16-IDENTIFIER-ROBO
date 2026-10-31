import { env } from "cloudflare:workers";
import { loadReport } from "@/lib/db/reports";
import { REPORT_ID_RE, pageTitle, routeMeta, type PageMeta } from "@/lib/seo";
import { VERDICT_LABEL } from "@/lib/types";

/** A report page's title names its verdict, read from the report store. */
async function metaFor(pathname: string): Promise<PageMeta> {
  const meta = routeMeta(pathname);
  const match = /^\/report\/([^/]+)\/?$/.exec(pathname);
  if (!match) return meta;
  const publicId = decodeURIComponent(match[1]).trim().toUpperCase();
  if (!REPORT_ID_RE.test(publicId)) return meta;
  try {
    const report = await loadReport(publicId);
    if (!report) return { ...meta, title: pageTitle("Report not found") };
    return {
      ...meta,
      title: pageTitle(`${report.publicId} — ${VERDICT_LABEL[report.status]}`),
      description: report.summary.slice(0, 180),
    };
  } catch {
    return { ...meta, title: pageTitle("Report unavailable") };
  }
}

/**
 * Serves the single-page app's index.html for a page URL, with that page's
 * title, description and robots directive written in, so crawlers and link
 * previews see them without running JavaScript. Paths no page renders get
 * HTTP 404 (the app shows its not-found page).
 */
export async function renderPage(request: Request, url: URL): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method Not Allowed", { status: 405, headers: { allow: "GET, HEAD" } });
  }
  const [shell, meta] = await Promise.all([env.ASSETS.fetch(new URL("/", url)), metaFor(url.pathname)]);
  if (!shell.ok || !shell.body) return shell;

  const headers = new Headers(shell.headers);
  // The body changes below, so the shell's length and validators no longer describe it.
  headers.delete("content-length");
  headers.delete("etag");
  headers.set("content-type", "text/html; charset=utf-8");
  headers.set("cache-control", "no-cache");
  if (meta.robots.startsWith("noindex")) headers.set("x-robots-tag", "noindex, nofollow");
  if (request.method === "HEAD") return new Response(null, { status: meta.status, headers });

  return new HTMLRewriter()
    .on("title", { element: (el) => void el.setInnerContent(meta.title) })
    .on('meta[name="description"]', { element: (el) => void el.setAttribute("content", meta.description) })
    .on('meta[name="robots"]', { element: (el) => void el.setAttribute("content", meta.robots) })
    .transform(new Response(shell.body, { status: meta.status, headers }));
}
