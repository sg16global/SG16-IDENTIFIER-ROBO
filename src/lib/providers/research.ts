import type { EvidenceSource, ProviderCall } from "@/lib/types";
import { disabled, meter, skipped } from "@/lib/providers/registry";
import { truncate } from "@/lib/utils";
import { setting } from "@/lib/settings";

/**
 * News & claim research adapters (blueprint §5).
 *  - Google Fact Check Tools API → existing ClaimReviews
 *  - licensed web search          → primary sources & corroborating reporting
 * Both degrade to a recorded "skipped/disabled" provider call, never a crash.
 */

export interface FactCheckHit {
  claimText: string;
  claimant?: string;
  rating?: string;
  reviewer?: string;
  reviewUrl?: string;
  reviewDate?: string;
  languageCode?: string;
}

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  source: string;
  publishedAt?: string;
}

const OFFICIAL_DOMAIN_HINTS = [
  ".gov", ".int", ".edu", ".mil", ".nhs.uk", ".ac.uk", ".gc.ca", ".europa.eu",
];

export function trustTierFor(url: string): "official" | "reputable" | "mixed" | "unrated" {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (OFFICIAL_DOMAIN_HINTS.some((s) => host.endsWith(s))) return "official";
    const reputable = [
      "reuters.com", "apnews.com", "afp.com", "bbc.com", "bbc.co.uk", "theguardian.com",
      "nature.com", "sciencedirect.org", "who.int", "snopes.com", "politifact.com",
      "factcheck.org", "fullfact.org", "aap.com.au", "dpa-factchecking.com", "maldita.es",
      "nytimes.com", "washingtonpost.com", "ft.com", "economist.com", "arstechnica.com",
      "ieee.org", "acm.org", "nih.gov", "cdc.gov", "consumerreports.org",
    ];
    if (reputable.some((d) => host === d || host.endsWith(`.${d}`))) return "reputable";
    const lowTrust = ["pinterest.", "facebook.com", "x.com", "twitter.com", "reddit.com",
      "tiktok.com", "instagram.com", "youtube.com", "quora.com", "blogspot.com", "medium.com"];
    if (lowTrust.some((d) => host.includes(d))) return "mixed";
    return "unrated";
  } catch {
    return "unrated";
  }
}

function normalizeRating(rating?: string): "supports" | "contradicts" | "context" {
  if (!rating) return "context";
  const r = rating.toLowerCase();
  if (/^(true|correct|accurate|pants on fire|false|mostly false|wrong|scam|debunked|hoax|fabricated)/.test(r)) {
    // "True" supports the claim; "False" contradicts it.
    return /^(true|correct|accurate)/.test(r) ? "supports" : "contradicts";
  }
  if (/(mixture|half true|partly|partially|missing context|out of context|misleading|needs context|mostly true)/.test(r)) {
    return "context";
  }
  return "context";
}

export async function fetchFactChecks(
  query: string,
  opts: { reportId?: string; pageSize?: number } = {},
): Promise<{ hits: FactCheckHit[]; call: ProviderCall }> {
  const key = setting("GOOGLE_FACTCHECK_API_KEY");
  if (!key) {
    return {
      hits: [],
      call: disabled(
        "google-factcheck",
        "claims:search",
        "GOOGLE_FACTCHECK_API_KEY is not configured, so no published ClaimReviews were retrieved.",
      ),
    };
  }
  try {
    const { data, call } = await meter("google-factcheck", "claims:search", async () => {
      const url = new URL("https://factchecktools.googleapis.com/v1alpha1/claims:search");
      url.searchParams.set("key", key);
      url.searchParams.set("query", query);
      url.searchParams.set("pageSize", String(opts.pageSize ?? 10));
      url.searchParams.set("languageCode", "en-US");
      const res = await fetch(url.toString(), { signal: AbortSignal.timeout(9000) });
      if (!res.ok) throw new Error(`Fact Check Tools API responded ${res.status}`);
      return (await res.json()) as { claims?: Array<Record<string, any>> };
    }, { reportId: opts.reportId });

    const hits: FactCheckHit[] = (data.claims ?? []).flatMap((claim) =>
      (claim.claimReview ?? []).map((review: Record<string, any>) => ({
        claimText: String(claim.text ?? query),
        claimant: claim.claimant,
        rating: review.textualRating,
        reviewer: review.publisher?.name,
        reviewUrl: review.url ?? review.title,
        reviewDate: review.reviewDate,
        languageCode: review.languageCode,
      })),
    );
    return { hits, call };
  } catch (error) {
    return {
      hits: [],
      call: {
        provider: "google-factcheck",
        operation: "claims:search",
        status: "error",
        latencyMs: 0,
        costUsd: 0,
        error: (error as Error).message,
      },
    };
  }
}

export async function searchWeb(
  query: string,
  opts: { reportId?: string; maxResults?: number } = {},
): Promise<{ results: SearchResult[]; answer?: string; call: ProviderCall }> {
  const tavily = setting("TAVILY_API_KEY");
  const serper = setting("SERPER_API_KEY");
  const bing = setting("BING_SEARCH_KEY");

  if (!tavily && !serper && !bing) {
    return {
      results: [],
      call: skipped(
        "web-search",
        "query",
        "No search provider key is configured. Corroborating sources were not retrieved for this check.",
      ),
    };
  }

  const operation = tavily ? "tavily:search" : serper ? "serper:search" : "bing:search";
  try {
    const { data, call } = await meter("web-search", operation, async () => {
      if (tavily) {
        const res = await fetch("https://api.tavily.com/search", {
          method: "POST",
          signal: AbortSignal.timeout(10000),
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            api_key: tavily,
            query,
            max_results: opts.maxResults ?? 8,
            search_depth: "advanced",
            include_answer: true,
          }),
        });
        if (!res.ok) throw new Error(`Tavily responded ${res.status}`);
        const json = (await res.json()) as any;
        return {
          answer: json.answer as string | undefined,
          results: (json.results ?? []).map((r: any) => ({
            title: r.title ?? r.url,
            url: r.url,
            snippet: truncate(String(r.content ?? ""), 400),
            source: new URL(r.url).hostname,
            publishedAt: r.published_date,
          })) as SearchResult[],
        };
      }
      if (serper) {
        const res = await fetch("https://google.serper.dev/search", {
          method: "POST",
          signal: AbortSignal.timeout(10000),
          headers: { "content-type": "application/json", "x-api-key": serper },
          body: JSON.stringify({ q: query, num: opts.maxResults ?? 8, gl: "us", hl: "en" }),
        });
        if (!res.ok) throw new Error(`Serper responded ${res.status}`);
        const json = (await res.json()) as any;
        return {
          answer: json.answerBox?.answer as string | undefined,
          results: (json.organic ?? []).map((r: any) => ({
            title: r.title ?? r.link,
            url: r.link,
            snippet: truncate(String(r.snippet ?? ""), 400),
            source: r.source ?? new URL(r.link).hostname,
            publishedAt: r.date,
          })) as SearchResult[],
        };
      }
      const url = new URL("https://api.bing.microsoft.com/v7.0/search");
      url.searchParams.set("q", query);
      url.searchParams.set("count", String(opts.maxResults ?? 8));
      url.searchParams.set("textFormat", "Raw");
      const res = await fetch(url.toString(), {
        signal: AbortSignal.timeout(10000),
        headers: { "Ocp-Apim-Subscription-Key": bing! },
      });
      if (!res.ok) throw new Error(`Bing responded ${res.status}`);
      const json = (await res.json()) as any;
      return {
        results: (json.webPages?.value ?? []).map((r: any) => ({
          title: r.name,
          url: r.url,
          snippet: truncate(String(r.snippet ?? ""), 400),
          source: new URL(r.url).hostname,
          publishedAt: r.dateLastCrawled,
        })) as SearchResult[],
      };
    }, { reportId: opts.reportId });

    return { results: data.results, answer: data.answer, call };
  } catch (error) {
    return {
      results: [],
      call: {
        provider: "web-search",
        operation,
        status: "error",
        latencyMs: 0,
        costUsd: 0,
        error: (error as Error).message,
      },
    };
  }
}

export function searchResultsToEvidence(results: SearchResult[]): EvidenceSource[] {
  return results.map((r) => ({
    provider: "web-search",
    url: r.url,
    title: r.title,
    publisher: r.source,
    excerpt: r.snippet,
    stance: "context" as const,
    publishedAt: r.publishedAt ?? null,
    retrievedAt: new Date().toISOString(),
    trustTier: trustTierFor(r.url),
  }));
}

export function factChecksToEvidence(hits: FactCheckHit[]): EvidenceSource[] {
  return hits.map((h) => ({
    provider: "google-factcheck",
    url: h.reviewUrl,
    title: truncate(h.claimText, 180),
    publisher: h.reviewer,
    excerpt: `Rating: ${h.rating ?? "unrated"}${h.claimant ? ` · Claimant: ${h.claimant}` : ""}`,
    stance: normalizeRating(h.rating),
    publishedAt: h.reviewDate ?? null,
    retrievedAt: new Date().toISOString(),
    trustTier: "reputable" as const,
    meta: { rating: h.rating ?? null },
  }));
}
