import { LEGAL_DOCS } from "@/content/legal";
import { TOOL_PAGES } from "@/content/tools";

/**
 * Per-route document metadata, shared by the Worker (which writes it into the
 * HTML shell, so search engines and link previews see it without running JS)
 * and the app (which keeps document.title right as visitors navigate).
 */

export const SITE_NAME = "SG16 Identifier";
export const DEFAULT_TITLE = "SG16 Identifier — Verify products, news, websites and media with evidence";
export const DEFAULT_DESCRIPTION =
  "SG16 Identifier is a free public verification engine for counterfeit products, unverified news claims, scam websites and manipulated media. Every report shows its evidence, sources, confidence and limitations.";
const INDEX = "index, follow";
const NO_INDEX = "noindex, nofollow";

export interface PageMeta {
  /** Full <title> text. */
  title: string;
  description: string;
  robots: string;
  /** 404 for paths no route renders. */
  status: 200 | 404;
}

/** Page titles use the root layout's template. */
export function pageTitle(title?: string): string {
  return title ? `${title} · ${SITE_NAME}` : DEFAULT_TITLE;
}

function meta(title: string | undefined, description = DEFAULT_DESCRIPTION, robots = INDEX, status: 200 | 404 = 200): PageMeta {
  return { title: pageTitle(title), description, robots, status };
}

const STATIC: Record<string, PageMeta> = {
  "/": meta(undefined),
  "/identify": meta(
    "Identify — universal verification console",
    "Submit text, a URL, a product identifier or an image and receive an evidence-backed SG16 verification report with findings, sources, confidence and limitations.",
  ),
  "/business": meta(
    "Business verification & API",
    "Paid business services for SG16 Identifier: bulk product checks, domain monitoring, private dashboards and a metered verification API. The public service stays free.",
  ),
  "/blueprint": meta(
    "Project blueprint",
    "The complete SG16 Identifier specification: product vision, five services, MVP scope, architecture, API and data-source strategy, database design, security, operating costs, revenue model, roadmap, deployment, quality metrics and risk register.",
  ),
  "/admin": meta(
    "Operator console",
    "SG16 Identifier operator console: service health, provider cost, corrections queue and emergency switches.",
    NO_INDEX,
  ),
};

export const REPORT_ID_RE = /^SG16-[A-Z0-9]{4}-[A-Z0-9]{4}$/;

/** Metadata for a pathname; report pages get their verdict-specific title once the report is read. */
export function routeMeta(pathname: string): PageMeta {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  const exact = STATIC[path];
  if (exact) return exact;

  const [, section, slug, extra] = path.split("/");
  if (slug && extra === undefined) {
    const key = decodeURIComponent(slug);
    if (section === "legal") {
      const doc = LEGAL_DOCS[key];
      return doc ? meta(doc.title, doc.lede.slice(0, 170)) : meta("Document not found", undefined, NO_INDEX, 404);
    }
    if (section === "tools") {
      const page = TOOL_PAGES[key];
      return page
        ? meta(`${page.title} — ${page.eyebrow.split("— ")[1]}`, page.lede.slice(0, 180))
        : meta("Module not found", undefined, NO_INDEX, 404);
    }
    if (section === "report") return meta("Report", undefined, NO_INDEX);
  }
  return meta("Page not found", undefined, NO_INDEX, 404);
}
