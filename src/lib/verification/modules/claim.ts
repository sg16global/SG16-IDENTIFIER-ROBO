import type { EvidenceSource, ProviderCall, ReportFinding } from "@/lib/types";
import { aiStructured } from "@/lib/providers/ai";
import {
  factChecksToEvidence,
  fetchFactChecks,
  searchResultsToEvidence,
  searchWeb,
} from "@/lib/providers/research";
import { CLAIM_HEDGES, OUT_OF_CONTEXT_SIGNALS } from "@/lib/verification/lexicon";
import {
  StepTimer,
  extractDates,
  extractNumbers,
  extractQuotes,
  splitClaims,
  type ModuleInput,
  type ModuleOutput,
} from "@/lib/verification/module";
import { LIMITATION_LIBRARY, makeFinding, score } from "@/lib/verification/scoring";
import { round, truncate } from "@/lib/utils";

interface AiClaimAnalysis {
  atomicClaims?: Array<{ text: string; type: string; checkable: boolean }>;
  summary?: string;
  evidenceAssessment?: string;
  missingContext?: string[];
  verdictHint?: "supported" | "contradicted" | "misleading" | "disputed" | "insufficient";
}

export async function verifyClaim(input: ModuleInput): Promise<ModuleOutput> {
  const timer = new StepTimer();
  const findings: ReportFinding[] = [];
  const sources: EvidenceSource[] = [];
  const providers: ProviderCall[] = [];
  const limitations: string[] = [];
  const text = input.raw.replace(/\s+/g, " ").trim();

  let atomicClaims: string[] = [];
  let dates: string[] = [];
  let quotes: string[] = [];
  let numbers: string[] = [];

  await timer.run("Decompose input", "Split the submission into atomic, checkable claims.", async () => {
    atomicClaims = splitClaims(text);
    dates = extractDates(text);
    quotes = extractQuotes(text);
    numbers = extractNumbers(text);
    if (atomicClaims.length) {
      findings.push(makeFinding(
        "structure",
        `${atomicClaims.length} checkable claim${atomicClaims.length === 1 ? "" : "s"} isolated`,
        atomicClaims.map((c, i) => `${i + 1}. ${truncate(c, 220)}`).join("\n"),
        "info", 0.4,
      ));
    } else {
      findings.push(makeFinding(
        "structure",
        "No independently checkable claim isolated",
        "The text is too short, too fragmentary, or purely opinion/emotive to decompose into a verifiable proposition.",
        "unknown", 0.6,
      ));
    }
    if (dates.length) {
      findings.push(makeFinding("structure", `Date references found: ${dates.length}`,
        dates.join(" · "), "info", 0.2));
    }
    if (quotes.length) {
      findings.push(makeFinding("structure", `${quotes.length} direct quotation(s) present`,
        quotes.map((q) => `“${truncate(q, 180)}”`).join("\n"), "info", 0.3));
    }
    if (numbers.length) {
      findings.push(makeFinding("structure", "Quantitative assertions present",
        numbers.join(" · ") + " — numbers require a stated denominator, reference date and primary source.",
        "info", 0.3));
    }
    return "done";
  });

  let factCheckHits = 0;
  let supportingReviews = 0;
  let contradictingReviews = 0;
  let mixedReviews = 0;

  await timer.run("Retrieve published fact-checks", "Query the Google Fact Check Tools API for existing ClaimReviews.", async () => {
    if (!input.flags.expensiveEnabled) {
      providers.push({ provider: "google-factcheck", operation: "claims:search", status: "disabled", latencyMs: 0, costUsd: 0, detail: "Expensive operations are switched off by the administrator." });
      limitations.push("Fact-check retrieval was disabled by the service switch for this run.");
      return "skipped";
    }
    const query = truncate(atomicClaims[0] ?? text, 180);
    const { hits, call } = await fetchFactChecks(query, { reportId: input.reportId });
    providers.push(call);
    factCheckHits = hits.length;
    const evidence = factChecksToEvidence(hits);
    sources.push(...evidence);
    for (const e of evidence) {
      if (e.stance === "supports") supportingReviews += 1;
      else if (e.stance === "contradicts") contradictingReviews += 1;
      else mixedReviews += 1;
    }
    if (hits.length) {
      findings.push(makeFinding(
        "factcheck",
        `${hits.length} published claim review(s) retrieved`,
        hits.slice(0, 5).map((h) => `${h.reviewer ?? "Unknown reviewer"} rated a matching claim "${h.rating ?? "unrated"}"${h.reviewDate ? ` on ${h.reviewDate}` : ""}.`).join("\n"),
        contradictingReviews > supportingReviews ? "risk" : "positive",
        0.8 + Math.min(hits.length, 4) * 0.15,
      ));
      if (contradictingReviews) {
        findings.push(makeFinding("factcheck", "Fact-checkers contradicted this claim",
          `${contradictingReviews} retrieved review(s) carry a false/debunked-class rating.`, "risk", 1.2));
      }
      if (mixedReviews) {
        findings.push(makeFinding("factcheck", "Ratings include context-dependent verdicts",
          `${mixedReviews} review(s) rated the claim as mixture / missing context / partly true — the underlying facts are real but the framing is not.`, "warning", 0.8));
      }
      if (supportingReviews && !contradictingReviews) {
        findings.push(makeFinding("factcheck", "Retrieved reviews rated the claim true",
          `${supportingReviews} review(s) support the claim as stated.`, "positive", 1.1));
      }
    } else {
      findings.push(makeFinding(
        "factcheck",
        "No existing claim review matched",
        call.status === "disabled"
          ? "The Fact Check Tools API is not configured in this deployment."
          : "No fact-checking organisation in the queried index has reviewed a claim matching this text. This is not evidence that the claim is true.",
        "unknown", 0.7,
      ));
      limitations.push(LIMITATION_LIBRARY.noFactCheckNotProof);
    }
    return hits.length ? "done" : call.status === "disabled" ? "skipped" : "done";
  });

  let searchHits = 0;
  let officialHits = 0;

  await timer.run("Search for corroborating sources", "Look for primary sources, official statements and independent reporting.", async () => {
    if (!input.flags.expensiveEnabled) {
      providers.push({ provider: "web-search", operation: "query", status: "disabled", latencyMs: 0, costUsd: 0, detail: "Expensive operations are switched off by the administrator." });
      return "skipped";
    }
    const query = truncate(`${atomicClaims[0] ?? text} — official statement or fact check`, 170);
    const { results, answer, call } = await searchWeb(query, { reportId: input.reportId, maxResults: 8 });
    providers.push(call);
    searchHits = results.length;
    const evidence = searchResultsToEvidence(results);
    sources.push(...evidence);
    officialHits = evidence.filter((e) => e.trustTier === "official").length;
    if (results.length) {
      const reputable = evidence.filter((e) => e.trustTier === "reputable" || e.trustTier === "official");
      findings.push(makeFinding(
        "sources",
        `${results.length} retrieved source(s), ${reputable.length} rated official/reputable`,
        reputable.slice(0, 5).map((e) => `${e.publisher ?? e.url} — ${truncate(e.excerpt ?? "", 160)}`).join("\n") || "Retrieved sources were not from rated publishers.",
        reputable.length >= 2 ? "positive" : "info",
        0.3 + reputable.length * 0.25,
      ));
      const social = evidence.filter((e) => e.trustTier === "mixed");
      if (social.length && reputable.length === 0) {
        findings.push(makeFinding("sources", "Only social/user-generated sources found",
          "The retrieved corpus consists of social platforms and user-generated sites. Repetition across such sources is not corroboration.",
          "warning", 0.7));
      }
      if (officialHits) {
        findings.push(makeFinding("sources", "Official-domain source retrieved",
          `${officialHits} source(s) on a government, intergovernmental or academic domain.`, "positive", 0.6));
      }
      if (answer) {
        findings.push(makeFinding("sources", "Search provider synthesis", truncate(answer, 500), "info", 0.2));
      }
    } else {
      limitations.push(LIMITATION_LIBRARY.noProviderKey);
      findings.push(makeFinding("sources", "No corroborating sources retrieved",
        "Corroborating reporting could not be fetched in this deployment.", "unknown", 0.5));
    }
    return results.length ? "done" : "skipped";
  });

  await timer.run("Analyse language and framing", "Apply claim-framing rules to detect unverifiable assertions.", async () => {
    let framingWeight = 0;
    for (const signal of CLAIM_HEDGES) {
      if (signal.re.test(text)) {
        framingWeight += signal.weight;
        findings.push(makeFinding("framing", signal.label, signal.why, signal.weight >= 0.12 ? "warning" : "info", signal.weight));
      }
    }
    for (const signal of OUT_OF_CONTEXT_SIGNALS) {
      if (signal.re.test(text)) {
        framingWeight += signal.weight;
        findings.push(makeFinding("framing", signal.label, signal.why, "warning", signal.weight));
      }
    }
    if (!framingWeight) {
      findings.push(makeFinding("framing", "No manipulative framing patterns matched",
        "The submission did not match the absolute-quantifier, unnamed-authority, suppression-narrative or emotive-amplification lexicons.",
        "positive", 0.35));
    }
    if (text.length < 140) {
      findings.push(makeFinding("framing", "Submission is very short",
        "Short posts usually lack the attribution, date and context needed to verify them. Paste the full article or the original caption where possible.",
        "unknown", 0.4));
      limitations.push("Only a fragment of the original content was supplied; the surrounding context may change the meaning.");
    }
    return "done";
  });

  let aiNote = "";
  await timer.run("AI evidence comparison", "Compare the isolated claims against retrieved evidence and draft the explanation.", async () => {
    if (!input.flags.expensiveEnabled) {
      providers.push({ provider: "ai-analysis", operation: "claim-compare", status: "disabled", latencyMs: 0, costUsd: 0, detail: "Expensive operations are switched off by the administrator." });
      return "skipped";
    }
    const { json, call, reasoning } = await aiStructured<AiClaimAnalysis>({
      reportId: input.reportId,
      operation: "claim-compare",
      system: "You are a careful fact-check analyst. You separate what evidence shows from what remains unknown.",
      schemaHint: `{
  "atomicClaims": [{"text": string, "type": "factual|opinion|prediction|quote", "checkable": boolean}],
  "summary": string (2-4 sentences, plain English, no new facts),
  "evidenceAssessment": string (what the supplied evidence does and does not establish),
  "missingContext": string[],
  "verdictHint": "supported"|"contradicted"|"misleading"|"disputed"|"insufficient"
}`,
      user: `CLAIM UNDER REVIEW:\n${truncate(text, 2500)}\n\nRETRIEVED EVIDENCE (the ONLY sources you may cite):\n${sources.map((s, i) => `${i + 1}. [${s.trustTier ?? "unrated"}] ${s.publisher ?? s.provider} — ${s.title ?? s.url ?? ""} :: ${truncate(s.excerpt ?? "", 260)}`).join("\n").slice(0, 6000) || "(none)"}`,
    });
    providers.push(call);
    aiNote = reasoning;
    if (json?.summary) {
      findings.push(makeFinding("ai", "AI analyst assessment", `${json.summary}\n\n${json.evidenceAssessment ?? ""}`, "info", 0.2));
    }
    for (const missing of json?.missingContext ?? []) {
      limitations.push(`Missing context identified by the analyst: ${missing}`);
    }
    if (json?.atomicClaims?.length) {
      const opinions = json.atomicClaims.filter((c) => !c.checkable);
      if (opinions.length) {
        findings.push(makeFinding("ai", `${opinions.length} portion(s) are not factually checkable`,
          opinions.map((o) => `“${truncate(o.text, 160)}” (${o.type})`).join("\n"), "info", 0.25));
      }
    }
    return json ? "done" : "skipped";
  });

  limitations.push(LIMITATION_LIBRARY.pointInTime, LIMITATION_LIBRARY.legalReview);
  if (!sources.length) limitations.push(LIMITATION_LIBRARY.noProviderKey);

  const scored = score({
    findings,
    sources,
    category: "claim",
    authoritativeHit: officialHits > 0,
    definitiveNegative: contradictingReviews > 0,
  });

  const headline =
    scored.status === "contradicted" ? "Contradicted by retrieved fact-checks"
    : scored.status === "misleading" ? "Misleading framing detected"
    : scored.status === "disputed" ? "Disputed — credible sources disagree"
    : scored.status === "supported" ? "Supported by retrieved evidence"
    : "Unable to verify this claim";

  const summary = [
    headline + ".",
    scored.explanation,
    factCheckHits ? `${factCheckHits} published claim review(s) and ${searchHits} retrieved source(s) were examined.` : `No published claim review matched; ${searchHits} source(s) were retrieved.`,
    aiNote,
  ].filter(Boolean).join(" ");

  const nextSteps = [
    "Open the cited sources yourself and read the full article, not the headline.",
    "Check the publication date of any image or video attached to the claim — recycled media is more common than fabrication.",
    "Look for the primary source (the study, the court filing, the official statement) behind any number quoted.",
    "If the claim names an organisation, search that organisation's own newsroom for a statement.",
    "Flag this report if you believe a conclusion is wrong; SG16 reviews corrections.",
  ];

  return {
    category: "claim",
    status: scored.status,
    confidence: scored.confidence,
    headline,
    summary: truncate(summary, 900),
    findings,
    sources,
    limitations,
    nextSteps,
    payload: {
      atomicClaims,
      dates,
      quotes,
      numbers,
      factCheckHits,
      searchHits,
      officialHits,
      supportScore: scored.supportScore,
      riskScore: scored.riskScore,
      aiNote,
    },
    workflow: timer.list,
    providers,
    authoritativeHit: officialHits > 0,
    definitiveNegative: contradictingReviews > 0,
  };
}

export function claimQuickStats(text: string) {
  return {
    words: text.split(/\s+/).filter(Boolean).length,
    claims: splitClaims(text).length,
    dates: extractDates(text).length,
    numbers: extractNumbers(text).length,
    trustHint: round(CLAIM_HEDGES.filter((h) => h.re.test(text)).length, 0),
  };
}
