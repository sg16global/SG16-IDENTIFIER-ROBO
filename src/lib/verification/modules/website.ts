import type { EvidenceSource, ProviderCall, ReportFinding } from "@/lib/types";
import {
  collectDnsProfile,
  collectTlsProfile,
  domainEvidence,
  hostnameDeceptionSignals,
  hostnameHasBrand,
  isUrlShortenerOrFreeHost,
  lookupWebRisk,
  probeHttp,
  registrableDomain,
  tldRiskScore,
  type DnsProfile,
  type HttpProbe,
  type TlsProfile,
} from "@/lib/providers/risk";
import { parseUntrustedUrl } from "@/lib/security/url-guard";
import { IMPERSONATED_BRANDS, SCAM_SIGNALS, URL_SCAM_SIGNALS } from "@/lib/verification/lexicon";
import {
  StepTimer,
  extractPrices,
  type ModuleInput,
  type ModuleOutput,
} from "@/lib/verification/module";
import { LIMITATION_LIBRARY, makeFinding, score } from "@/lib/verification/scoring";
import { truncate } from "@/lib/utils";

export async function verifyWebsite(input: ModuleInput): Promise<ModuleOutput> {
  const timer = new StepTimer();
  const findings: ReportFinding[] = [];
  const sources: EvidenceSource[] = [];
  const providers: ProviderCall[] = [];
  const limitations: string[] = [];
  const text = input.raw;

  const urls = input.classification.urls;
  const primaryRaw = urls[0] ?? (parseUntrustedUrl(text).ok ? text.trim() : null);
  const parsed = primaryRaw ? parseUntrustedUrl(primaryRaw) : null;
  const hostname = parsed?.url?.hostname.toLowerCase() ?? null;

  const ctx: {
    profile: DnsProfile | null;
    tls: TlsProfile | null;
    probe: HttpProbe | null;
    threats: string[];
  } = { profile: null, tls: null, probe: null, threats: [] };

  await timer.run("Parse and screen the target", "Validate scheme, strip credentials and reject internal addresses before any network call.", async () => {
    if (!primaryRaw) {
      findings.push(makeFinding("target", "No URL supplied",
        "The submission contained message text but no link. Scam-language analysis was run on the text alone; paste the URL to add domain, DNS, TLS and page-behaviour evidence.",
        "unknown", 0.4));
      return "skipped";
    }
    if (!parsed?.ok || !parsed.url) {
      findings.push(makeFinding("target", "URL rejected by the SSRF guard",
        `${parsed?.reason ?? "Invalid URL"} — SG16 will not resolve or fetch this target.`,
        "risk", 1.2));
      limitations.push("The target could not be inspected because it failed server-side safety validation.");
      return "failed";
    }
    findings.push(makeFinding("target", "Target parsed and permitted",
      `Scheme ${parsed.url.protocol.replace(":", "")} · host ${hostname} · registrable domain ${registrableDomain(hostname!)} · path ${truncate(parsed.url.pathname || "/", 80)}`,
      "info", 0.2));
    return "done";
  });

  await timer.run("Structural URL analysis", "Hostname shape, TLD abuse rate, punycode and trust-word patterns.", async () => {
    if (!hostname) return "skipped";
    const tld = tldRiskScore(hostname);
    if (tld.score) {
      findings.push(makeFinding("url", `Elevated-abuse TLD (.${tld.tld})`, tld.note, "warning", tld.score));
    }
    const shortener = isUrlShortenerOrFreeHost(hostname);
    if (shortener) {
      findings.push(makeFinding("url", "URL shortener or free-hosting domain",
        `The link routes through ${shortener}, which hides the true destination and is common in phishing delivery.`,
        "warning", 0.35));
    }
    for (const signal of URL_SCAM_SIGNALS) {
      if (signal.re.test(primaryRaw ?? "")) {
        findings.push(makeFinding("url", signal.label, signal.why, signal.weight >= 0.2 ? "risk" : "warning", signal.weight));
      }
    }
    const deception = hostnameDeceptionSignals(hostname, IMPERSONATED_BRANDS);
    for (const d of deception) {
      findings.push(makeFinding("impersonation", "Possible brand impersonation", d, "risk", 0.55));
    }
    const brandInHost = IMPERSONATED_BRANDS.filter((b) => hostnameHasBrand(hostname, b));
    if (brandInHost.length && !deception.length) {
      const registrable = registrableDomain(hostname);
      const body = registrable.split(".")[0];
      // Multi-word brands register without the space: "royal mail" → royalmail.com / royal-mail.com.
      const exact = brandInHost.some((brand) => {
        const b = brand.replace(/[\s-]+/g, "");
        const name = body.replace(/-/g, "");
        return name === b || name === `${b}online` || name === `${b}official`;
      });
      if (!exact) {
        findings.push(makeFinding("impersonation", "Brand name inside an unrelated domain",
          `"${brandInHost[0]}" appears in ${hostname}, but the registered domain is ${registrable}. Official brand sites use the brand as the registered domain itself.`,
          "risk", 0.6));
      }
    }
    if (!deception.length && !tld.score && !shortener) {
      findings.push(makeFinding("url", "No structural deception patterns matched",
        "The hostname does not use punycode, excess hyphens, digit substitution, bare IPs or trust-word subdomains.",
        "positive", 0.45));
    }
    return "done";
  });

  await timer.run("DNS & email-posture intelligence", "Resolve A/AAAA, NS, SOA, MX, SPF, DMARC and CNAME records.", async () => {
    if (!hostname || !input.flags.dnsEnabled) {
      providers.push({ provider: "domain-intel", operation: "dns", status: "disabled", latencyMs: 0, costUsd: 0, detail: "DNS lookups are disabled in this deployment." });
      return "skipped";
    }
    ctx.profile = await collectDnsProfile(hostname);
    sources.push(...domainEvidence(ctx.profile, null));
    if (ctx.profile.addresses.length) {
      findings.push(makeFinding("dns", `Host resolves to ${ctx.profile.addresses.length} public address(es)`,
        `${ctx.profile.addresses.join(", ")} · name servers: ${ctx.profile.nameServers.join(", ") || "not published"}`,
        "positive", 0.3));
    } else {
      findings.push(makeFinding("dns", "Host did not resolve to a public address",
        ctx.profile.errors.join("; ") || "No usable A/AAAA record was returned.", "risk", 1.0));
    }
    if (!ctx.profile.spf) {
      findings.push(makeFinding("dns", "No SPF record published",
        "Without SPF anyone can send mail claiming to be from this domain — a common precondition for impersonation campaigns.",
        "warning", 0.3));
    }
    if (!ctx.profile.dmarc) {
      findings.push(makeFinding("dns", "No DMARC policy published",
        "The domain publishes no DMARC policy, so receiving mail servers cannot reliably reject spoofed mail from it.",
        "warning", 0.25));
    }
    if (ctx.profile.spf && ctx.profile.dmarc) {
      findings.push(makeFinding("dns", "Email authentication is configured",
        `SPF: ${truncate(ctx.profile.spf, 160)} · DMARC: ${truncate(ctx.profile.dmarc, 160)}`, "positive", 0.4));
    }
    if (ctx.profile.mx.length === 0 && ctx.profile.txt.length === 0 && ctx.profile.nameServers.length) {
      findings.push(makeFinding("dns", "Domain has name servers but no mail or TXT records",
        "A domain registered only to host a single page, with no mail infrastructure, is typical of short-lived scam sites.",
        "warning", 0.3));
    }
    return "done";
  });

  await timer.run("TLS certificate inspection", "Read the host's current certificate from Certificate Transparency logs.", async () => {
    if (!hostname || !input.flags.dnsEnabled) return "skipped";
    ctx.tls = await collectTlsProfile(hostname);
    if (ctx.tls.unsupported) {
      // Not evidence about the site either way: record the gap, not a warning.
      limitations.push(`The certificate's issuer, age and trust chain could not be inspected (${ctx.tls.error}).`);
      return "skipped";
    }
    if (!ctx.tls.ok) {
      findings.push(makeFinding("tls", "No usable TLS certificate",
        `No currently valid certificate from a publicly trusted authority was found (${ctx.tls.error}). Browsers would show a security warning.`,
        "warning", 0.5));
      return "done";
    }
    sources.push(...domainEvidence(ctx.profile!, ctx.tls).slice(-1));
    if (ctx.tls.selfSigned) {
      findings.push(makeFinding("tls", "Certificate appears self-signed or untrusted",
        `Issuer "${ctx.tls.issuer}" for subject "${ctx.tls.subject}". A public site should be signed by a recognised CA.`,
        "risk", 0.7));
    } else if (ctx.tls.ageDays !== undefined && ctx.tls.ageDays <= 14) {
      findings.push(makeFinding("tls", "Certificate issued very recently",
        `Issued ${ctx.tls.validFrom?.slice(0, 10)} — ${ctx.tls.ageDays} day(s) before this check. Short-lived certificates on new domains are typical of phishing infrastructure.`,
        "warning", 0.45));
    } else {
      findings.push(makeFinding("tls", "Valid certificate from a recognised issuer",
        `${ctx.tls.issuer} · CN=${ctx.tls.subject} · valid until ${ctx.tls.validTo?.slice(0, 10)} · covers ${ctx.tls.sanCount} name(s).`,
        "positive", 0.35));
    }
    if ((ctx.tls.sanCount ?? 0) > 40) {
      findings.push(makeFinding("tls", "Certificate covers a very large number of hostnames",
        `${ctx.tls.sanCount} SANs — typical of shared/bulletproof hosting where hundreds of unrelated sites share one certificate.`,
        "warning", 0.35));
    }
    return "done";
  });

  await timer.run("Commercial URL reputation lookup", "Google Web Risk / Safe Browsing threat categories.", async () => {
    if (!primaryRaw || !input.flags.expensiveEnabled) {
      providers.push({ provider: "web-risk", operation: "uris:search", status: "disabled", latencyMs: 0, costUsd: 0, detail: "No key configured or expensive operations switched off." });
      limitations.push("No commercial URL-reputation lookup was performed for this check.");
      return "skipped";
    }
    const result = await lookupWebRisk(primaryRaw, input.reportId);
    providers.push(result.call);
    ctx.threats = result.threats;
    if (ctx.threats.length) {
      findings.push(makeFinding("reputation", `Listed threat type(s): ${ctx.threats.join(", ")}`,
        "A commercial URL-intelligence provider returned one or more threat classifications for this address. Do not submit credentials or payment details here.",
        "risk", 1.6));
      sources.push({
        provider: "web-risk",
        title: "Commercial URL reputation lookup",
        excerpt: `Threat categories returned: ${ctx.threats.join(", ")}`,
        stance: "contradicts",
        retrievedAt: new Date().toISOString(),
        trustTier: "official",
        url: primaryRaw,
      });
    } else {
      findings.push(makeFinding("reputation", "No threat classification returned",
        "The reputation provider returned no MALWARE, SOCIAL_ENGINEERING or UNWANTED_SOFTWARE classification. Absence from a blocklist is not an endorsement — coverage is incomplete and new domains take time to be classified.",
        "info", 0.15));
    }
    return ctx.threats.length ? "done" : "done";
  });

  await timer.run("Sandboxed page fetch", "Retrieve the page through the SSRF guard and inspect behaviour.", async () => {
    if (!primaryRaw) return "skipped";
    if (!input.flags.outboundFetchEnabled) {
      providers.push({ provider: "http-probe", operation: "safeFetch", status: "disabled", latencyMs: 0, costUsd: 0, detail: "Outbound fetching of user-submitted URLs is disabled." });
      limitations.push(LIMITATION_LIBRARY.noFetch);
      return "skipped";
    }
    const result = await probeHttp(primaryRaw, input.reportId);
    providers.push(result.call);
    ctx.probe = result.probe;

    if (!ctx.probe.ok) {
      findings.push(makeFinding("fetch", "Server-side fetch did not succeed",
        `${ctx.probe.reason ?? "No response"} — the page could not be inspected, so on-page behaviour is unknown.`,
        "unknown", 0.35));
      limitations.push(LIMITATION_LIBRARY.noFetch);
      return "failed";
    }
    sources.push({
      provider: "http-probe",
      url: ctx.probe.finalUrl,
      title: ctx.probe.titleSnippets[0] ?? "Fetched page",
      excerpt: `HTTP ${ctx.probe.status} · ${ctx.probe.bytes ?? 0} bytes · server: ${ctx.probe.server ?? "not disclosed"}`,
      stance: "context",
      retrievedAt: new Date().toISOString(),
      trustTier: "unrated",
    });
    findings.push(makeFinding("fetch", `Page responded with HTTP ${ctx.probe.status}`,
      `Final URL: ${ctx.probe.finalUrl ?? primaryRaw}${ctx.probe.redirectChain.length > 1 ? ` after ${ctx.probe.redirectChain.length - 1} redirect(s)` : ""}. Content-Type: ${ctx.probe.contentType ?? "unknown"}.`,
      ctx.probe.status && ctx.probe.status < 400 ? "positive" : "warning",
      ctx.probe.status && ctx.probe.status < 400 ? 0.2 : 0.35));

    if (ctx.probe.redirectChain.length > 2) {
      findings.push(makeFinding("fetch", "Multiple redirects before landing",
        ctx.probe.redirectChain.map((r, i) => `${i + 1}. ${truncate(r, 120)}`).join("\n"),
        "warning", 0.3));
      const finalHost = (() => { try { return new URL(ctx.probe!.finalUrl ?? "").hostname; } catch { return ""; } })();
      if (finalHost && hostname && registrableDomain(finalHost) !== registrableDomain(hostname)) {
        findings.push(makeFinding("fetch", "Redirect crosses to a different registered domain",
          `The chain starts at ${registrableDomain(hostname)} and ends at ${registrableDomain(finalHost)}. Domain-hopping redirects defeat link previews and hide the real destination.`,
          "risk", 0.8));
      }
    }
    if (ctx.probe.credentialFormDetected) {
      findings.push(makeFinding("fetch", "Password field detected on the landing page",
        "The page contains a login form. Combined with any impersonation or urgency signal this is a credential-capture pattern.",
        "warning", 0.5));
    }
    if (ctx.probe.paymentKeywords.length) {
      findings.push(makeFinding("fetch", "Irreversible-payment vocabulary on the page",
        `Matched: ${ctx.probe.paymentKeywords.join(", ")}.`, "risk", 0.55));
    }
    if (!ctx.probe.hsts) {
      findings.push(makeFinding("fetch", "No HSTS header",
        "The site does not send Strict-Transport-Security, so a first visit can be downgraded. Established retailers and banks almost always send it.",
        "warning", 0.2));
    } else {
      findings.push(makeFinding("fetch", "HSTS enforced", "The server sends Strict-Transport-Security, which prevents protocol downgrade.", "positive", 0.2));
    }
    return "done";
  });

  await timer.run("Message-language analysis", "Apply the scam lexicon to the submitted text.", async () => {
    const hits = SCAM_SIGNALS.filter((s) => s.re.test(text));
    for (const h of hits) {
      findings.push(makeFinding("language", h.label, h.why, h.weight >= 0.2 ? "risk" : "warning", h.weight));
    }
    if (hits.length >= 4) {
      findings.push(makeFinding("language", `${hits.length} independent scam-language signals`,
        "Multiple distinct manipulation techniques appear in the same message. Individual phrases can be innocent; their combination rarely is.",
        "risk", 0.35 + hits.length * 0.08));
    }
    if (!hits.length && text.length > 40) {
      findings.push(makeFinding("language", "No scam-language signals matched",
        "The submitted text does not use urgency, prize, payment-method, credential or guaranteed-return framing from the SG16 lexicon.",
        "positive", 0.5));
    }
    const prices = extractPrices(text);
    if (prices.length) {
      findings.push(makeFinding("language", "Price information present",
        `${prices.join(" · ")} — compare against the manufacturer's own retail price before accepting any discount claim.`,
        "info", 0.15));
    }
    return "done";
  });

  limitations.push(LIMITATION_LIBRARY.pointInTime, LIMITATION_LIBRARY.legalReview);
  if (!ctx.profile) limitations.push("No DNS evidence was collected, so domain registration and infrastructure age could not be assessed.");
  limitations.push("WHOIS registration data was not queried in this deployment, so the domain's creation date and registrar are unknown.");

  const scored = score({
    findings,
    sources,
    category: "website",
    authoritativeHit: Boolean(ctx.profile?.addresses.length) || ctx.threats.length > 0,
    definitiveNegative:
      ctx.threats.length > 0 ||
      findings.some((f) => f.kind === "target" && f.severity === "risk"),
  });

  const headline =
    scored.status === "high_risk" ? "High risk — do not interact with this link"
    : scored.status === "suspicious" ? "Suspicious — several warning signs found"
    : scored.status === "verified" ? "Infrastructure checks passed"
    : "Unable to verify this destination";

  const summary = [
    hostname ? `${hostname} (registered domain ${registrableDomain(hostname)}).` : "No URL was supplied.",
    headline + ".",
    scored.explanation,
    ctx.threats.length ? `Commercial reputation lookup returned: ${ctx.threats.join(", ")}.` : "",
  ].filter(Boolean).join(" ");

  const nextSteps = hostname
    ? [
        `Look up ${registrableDomain(hostname)} on a WHOIS service and check the creation date — most scam domains are weeks old.`,
        "Do not enter credentials or card details on this page until the destination is confirmed.",
        "If the message claims to be from a known organisation, open that organisation's app or type its address manually instead of following the link.",
        "Report the link to the impersonated brand's abuse team and to your national fraud-reporting centre.",
        "Search the exact phone number, sender address or product title in quotation marks to find other reports.",
      ]
    : [
        "Paste the full link, email header or listing URL to add domain, DNS, TLS and page-behaviour evidence.",
        "Never rely on the display name of a sender — check the actual address in the email headers.",
        "Flag this report if you believe a conclusion is wrong; SG16 reviews corrections.",
      ];

  return {
    category: "website",
    status: scored.status,
    confidence: scored.confidence,
    headline,
    summary: truncate(summary, 900),
    findings,
    sources,
    limitations,
    nextSteps,
    payload: {
      hostname,
      registrableDomain: hostname ? registrableDomain(hostname) : null,
      dns: ctx.profile ? { addresses: ctx.profile.addresses, nameServers: ctx.profile.nameServers, spf: ctx.profile.spf ?? null, dmarc: ctx.profile.dmarc ?? null, mx: ctx.profile.mx, soa: ctx.profile.soa ?? null, errors: ctx.profile.errors } : null,
      tls: ctx.tls,
      probe: ctx.probe ? { status: ctx.probe.status, finalUrl: ctx.probe.finalUrl, redirectChain: ctx.probe.redirectChain, server: ctx.probe.server, hsts: ctx.probe.hsts, credentialForm: ctx.probe.credentialFormDetected, paymentKeywords: ctx.probe.paymentKeywords, bytes: ctx.probe.bytes, reason: ctx.probe.reason } : null,
      threats: ctx.threats,
      supportScore: scored.supportScore,
      riskScore: scored.riskScore,
    },
    workflow: timer.list,
    providers,
    authoritativeHit: Boolean(ctx.profile?.addresses.length),
    definitiveNegative: ctx.threats.length > 0,
  };
}
