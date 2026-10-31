import { DnsError, resolveCname, resolveMx, resolveNs, resolveSoa, resolveTxt } from "@/lib/security/doh";
import type { EvidenceSource, ProviderCall } from "@/lib/types";
import { disabled, meter } from "@/lib/providers/registry";
import { assertPublicResolution, parseUntrustedUrl, safeFetch } from "@/lib/security/url-guard";
import { foldHomoglyphs } from "@/lib/identifiers/checksums";
import { setting } from "@/lib/settings";

/** Website & scam intelligence adapters (blueprint §5). */

export interface DnsProfile {
  hostname: string;
  registrableDomain: string;
  addresses: string[];
  soa?: { nsname: string; hostmaster: string; serial: number; refresh: number };
  nameServers: string[];
  mx: string[];
  txt: string[];
  spf?: string;
  dmarc?: string;
  cname?: string[];
  errors: string[];
}

const MULTI_PART_TLDS = [
  "co.uk", "org.uk", "ac.uk", "gov.uk", "me.uk", "net.au", "com.au", "org.au", "gov.au",
  "co.nz", "co.za", "com.br", "com.mx", "co.in", "com.tr", "com.sg", "com.hk", "com.tw",
  "co.jp", "or.jp", "ne.jp", "com.cn", "com.my", "co.id", "com.ph", "com.vn", "co.kr",
  "com.ar", "com.co", "com.ec", "com.uy", "co.ke", "com.ng", "com.gh", "com.eg",
];

export function registrableDomain(hostname: string): string {
  const labels = hostname.toLowerCase().replace(/\.$/, "").split(".");
  if (labels.length <= 2) return labels.join(".");
  const lastTwo = labels.slice(-2).join(".");
  const lastThree = labels.slice(-3).join(".");
  return MULTI_PART_TLDS.includes(lastTwo) ? lastThree : lastTwo;
}

const RISKY_TLDS = new Map<string, number>([
  ["zip", 0.5], ["mov", 0.5], ["tk", 0.45], ["ml", 0.45], ["ga", 0.4], ["cf", 0.4],
  ["gq", 0.4], ["xyz", 0.2], ["top", 0.28], ["icu", 0.3], ["click", 0.35], ["link", 0.2],
  ["loan", 0.4], ["work", 0.22], ["rest", 0.2], ["country", 0.3], ["stream", 0.25],
  ["download", 0.3], ["win", 0.3], ["bid", 0.3], ["party", 0.28], ["racing", 0.25],
  ["review", 0.2], ["science", 0.22], ["cricket", 0.25], ["faith", 0.25], ["date", 0.2],
  ["accountant", 0.3], ["kim", 0.1], ["buzz", 0.18], ["cyou", 0.2], ["shop", 0.05],
]);

const FREE_SUBDOMAIN_HOSTS = [
  "duckdns.org", "no-ip.com", "noip.com", "dynu.com", "ddns.net", "dyndns.org",
  "freedns.afraid.org", "000webhostapp.com", "blogspot.com", "weebly.com",
  "wixsite.com", "sites.google.com", "netlify.app", "vercel.app", "page.link",
  "bit.ly", "tinyurl.com", "t.co", "rb.gy", "cutt.ly", "is.gd", "ow.ly", "buff.ly",
  "shorturl.at", "rebrand.ly", "telegra.ph", "docs.google.com", "drive.google.com",
  "forms.gle", "wa.me", "t.me", "discord.gg", "linktr.ee", "s.id", "reurl.cc",
];

export function isUrlShortenerOrFreeHost(hostname: string): string | null {
  const h = hostname.toLowerCase();
  return FREE_SUBDOMAIN_HOSTS.find((d) => h === d || h.endsWith(`.${d}`)) ?? null;
}

export async function collectDnsProfile(hostname: string): Promise<DnsProfile> {
  const profile: DnsProfile = {
    hostname,
    registrableDomain: registrableDomain(hostname),
    addresses: [],
    nameServers: [],
    mx: [],
    txt: [],
    errors: [],
  };
  const resolution = await assertPublicResolution(hostname);
  profile.addresses = resolution.addresses;
  if (!resolution.ok) profile.errors.push(resolution.reason ?? "resolution failed");

  const attempts: Array<[string, () => Promise<void>]> = [
    ["SOA", async () => {
      const soa = await resolveSoa(profile.registrableDomain);
      profile.soa = { nsname: soa.nsname, hostmaster: soa.hostmaster, serial: soa.serial, refresh: soa.refresh };
    }],
    ["NS", async () => { profile.nameServers = await resolveNs(profile.registrableDomain); }],
    ["MX", async () => {
      const mx = await resolveMx(profile.registrableDomain);
      profile.mx = mx.map((m) => `${m.priority} ${m.exchange}`);
    }],
    ["TXT", async () => {
      const txt = await resolveTxt(profile.registrableDomain);
      profile.txt = txt.map((parts) => parts.join(""));
      profile.spf = profile.txt.find((t) => t.startsWith("v=spf1"));
    }],
    ["DMARC", async () => {
      const dmarc = await resolveTxt(`_dmarc.${profile.registrableDomain}`);
      profile.dmarc = dmarc.map((p) => p.join("")).find((t) => t.startsWith("v=DMARC1"));
    }],
    ["CNAME", async () => { profile.cname = await resolveCname(hostname); }],
  ];

  await Promise.all(
    attempts.map(async ([label, fn]) => {
      try {
        await fn();
      } catch (error) {
        const code = error instanceof DnsError ? error.code : "";
        profile.errors.push(`${label}: ${code || (error as Error).message}`);
      }
    }),
  );
  return profile;
}

export interface TlsProfile {
  ok: boolean;
  issuer?: string;
  subject?: string;
  validFrom?: string;
  validTo?: string;
  ageDays?: number;
  selfSigned?: boolean;
  sanCount?: number;
  error?: string;
  /** The certificate source could not be consulted (says nothing about the site). */
  unsupported?: boolean;
}

/*
 * Certificate details come from Certificate Transparency (crt.sh), not a TLS
 * handshake: Workers cannot read a peer certificate, but browsers accept a
 * publicly trusted certificate only if it is logged in CT, so the host's
 * currently valid certificate (issuer, subject, validity, names) is read from
 * the logs. A host with no valid logged certificate is one browsers would warn
 * about. If the CT service cannot be reached, that is a gap in this check —
 * reported as `unsupported` — not evidence about the site.
 */
const CRTSH_ENDPOINT = "https://crt.sh/";
const CERTSPOTTER_ENDPOINT = "https://api.certspotter.com/v1/issuances";
const CT_TIMEOUT_MS = 5000;
const CT_USER_AGENT = "Mozilla/5.0 (compatible; SG16-Identifier/1.0; +https://sg16identifier.com/bot)";
const CT_MAX_BYTES = 4 * 1024 * 1024;
const CT_MEMO_MS = 60 * 60 * 1000;
const ctMemo = new Map<string, { at: number; profile: TlsProfile }>();

interface CtEntry {
  issuer_name?: string;
  common_name?: string;
  name_value?: string;
  not_before?: string;
  not_after?: string;
}

function dnField(dn: string | undefined, key: "O" | "CN"): string | undefined {
  const value = dn?.match(new RegExp(`(?:^|,\\s*)${key}=("[^"]*"|[^,]*)`))?.[1];
  return value?.replace(/^"|"$/g, "").trim() || undefined;
}

/** crt.sh timestamps are UTC without a zone designator. */
function ctTime(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const ms = Date.parse(/[zZ]$|[+-]\d\d:?\d\d$/.test(value) ? value : `${value}Z`);
  return Number.isNaN(ms) ? undefined : ms;
}

function ctNames(entry: CtEntry): string[] {
  return [...new Set((entry.name_value ?? "").split("\n").map((n) => n.trim().toLowerCase()).filter(Boolean))];
}

async function readCtJson(url: string, service: string, headers: Record<string, string> = {}): Promise<unknown[]> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(CT_TIMEOUT_MS),
    headers: { accept: "application/json", "user-agent": CT_USER_AGENT, ...headers },
  });
  if (!res.ok) throw new Error(`${service} responded ${res.status}`);
  const text = await res.text();
  if (text.length > CT_MAX_BYTES) throw new Error(`${service} returned more than can be inspected`);
  const parsed: unknown = JSON.parse(text || "[]");
  return Array.isArray(parsed) ? parsed : [];
}

/** crt.sh: one query per identity (the host, and the wildcard that would cover it). */
async function crtshEntries(identities: string[]): Promise<CtEntry[]> {
  const lists = await Promise.all(
    identities.map((identity) =>
      readCtJson(`${CRTSH_ENDPOINT}?q=${encodeURIComponent(identity)}&output=json&exclude=expired&deduplicate=Y`, "crt.sh"),
    ),
  );
  return lists.flat() as CtEntry[];
}

/** Cert Spotter (SSLMate): unexpired issuances for the host, wildcards included. Set CERTSPOTTER_API_KEY for a higher quota. */
async function certspotterEntries(host: string): Promise<CtEntry[]> {
  const key = setting("CERTSPOTTER_API_KEY");
  const url = `${CERTSPOTTER_ENDPOINT}?domain=${encodeURIComponent(host)}&match_wildcards=true&expand=dns_names&expand=issuer`;
  const issuances = (await readCtJson(url, "Cert Spotter", key ? { authorization: `Bearer ${key}` } : {})) as Array<{
    dns_names?: string[];
    issuer?: { name?: string };
    not_before?: string;
    not_after?: string;
  }>;
  return issuances.map((i) => ({
    issuer_name: i.issuer?.name,
    common_name: i.dns_names?.[0],
    name_value: (i.dns_names ?? []).join("\n"),
    not_before: i.not_before,
    not_after: i.not_after,
  }));
}

function ctFailure(error: unknown): string {
  const name = (error as { name?: string }).name;
  return name === "TimeoutError" || name === "AbortError" ? `no answer within ${CT_TIMEOUT_MS / 1000}s` : (error as Error).message;
}

export async function collectTlsProfile(hostname: string): Promise<TlsProfile> {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  const memo = ctMemo.get(host);
  if (memo && Date.now() - memo.at < CT_MEMO_MS) return memo.profile;

  // A wildcard certificate for the parent domain also covers a one-label subdomain.
  const labels = host.split(".");
  const identities = labels.length > 2 ? [host, `*.${labels.slice(1).join(".")}`] : [host];
  // Two independent CT search services: the second is asked only when the first cannot answer.
  let entries: CtEntry[];
  try {
    entries = await crtshEntries(identities);
  } catch (first) {
    try {
      entries = await certspotterEntries(host);
    } catch (second) {
      return { ok: false, unsupported: true, error: `Certificate Transparency lookup unavailable: ${ctFailure(first)}; ${ctFailure(second)}` };
    }
  }

  const now = Date.now();
  const covers = (name: string) =>
    name === host || (name.startsWith("*.") && host.endsWith(name.slice(1)) && name.split(".").length === labels.length);
  const valid = entries.filter((entry) => {
    const from = ctTime(entry.not_before);
    const to = ctTime(entry.not_after);
    return from !== undefined && to !== undefined && from <= now && to > now && ctNames(entry).some(covers);
  });

  let profile: TlsProfile;
  if (!valid.length) {
    profile = { ok: false, error: `no currently valid, publicly trusted certificate for ${host} is logged in Certificate Transparency` };
  } else {
    // The oldest still-valid certificate. CT logs a certificate before the site deploys it,
    // so the newest one is often not yet served (github.com serves a months-old certificate
    // while a fresh one is already logged). "Issued very recently" then means every valid
    // certificate for the host is new — the pattern of a newly stood-up site. Certificates
    // issued *for* the host (subject CN) are preferred over ones that merely list it.
    const ownCertificates = valid.filter((entry) => covers((entry.common_name ?? "").toLowerCase()));
    const current = (ownCertificates.length ? ownCertificates : valid).reduce((a, b) =>
      ctTime(b.not_before)! < ctTime(a.not_before)! ? b : a,
    );
    const validFrom = ctTime(current.not_before)!;
    profile = {
      ok: true,
      issuer: dnField(current.issuer_name, "O") ?? dnField(current.issuer_name, "CN") ?? "unknown",
      subject: current.common_name ?? host,
      validFrom: new Date(validFrom).toISOString(),
      validTo: new Date(ctTime(current.not_after)!).toISOString(),
      ageDays: Math.round((now - validFrom) / 86400000),
      // Only certificates from publicly trusted CAs are logged in CT.
      selfSigned: false,
      sanCount: ctNames(current).length,
    };
  }
  ctMemo.set(host, { at: now, profile });
  return profile;
}

export interface WebRiskResult {
  threats: string[];
  call: ProviderCall;
}

export async function lookupWebRisk(url: string, reportId?: string): Promise<WebRiskResult> {
  const key = setting("WEB_RISK_API_KEY") ?? setting("SAFE_BROWSING_API_KEY");
  if (!key) {
    return {
      threats: [],
      call: disabled(
        "web-risk",
        "uris:search",
        "No Web Risk / Safe Browsing key configured — no commercial URL reputation lookup was performed.",
      ),
    };
  }
  const parsed = parseUntrustedUrl(url);
  if (!parsed.ok || !parsed.url) {
    return {
      threats: [],
      call: { provider: "web-risk", operation: "uris:search", status: "skipped", latencyMs: 0, costUsd: 0, detail: parsed.reason },
    };
  }
  try {
    const { data } = await meter("web-risk", "uris:search", async () => {
      const endpoint = new URL("https://webrisk.googleapis.com/v1/uris:search");
      endpoint.searchParams.set("uri", parsed.url!.toString());
      endpoint.searchParams.append("threatTypes", "MALWARE");
      endpoint.searchParams.append("threatTypes", "SOCIAL_ENGINEERING");
      endpoint.searchParams.append("threatTypes", "UNWANTED_SOFTWARE");
      endpoint.searchParams.set("key", key);
      const res = await fetch(endpoint.toString(), { signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error(`Web Risk responded ${res.status}`);
      return (await res.json()) as { threat?: { threatTypes?: string[] } };
    }, { reportId });
    return { threats: data.threat?.threatTypes ?? [], call: { provider: "web-risk", operation: "uris:search", status: "ok", latencyMs: 0, costUsd: 0.005 } };
  } catch (error) {
    return {
      threats: [],
      call: { provider: "web-risk", operation: "uris:search", status: "error", latencyMs: 0, costUsd: 0, error: (error as Error).message },
    };
  }
}

export interface HttpProbe {
  ok: boolean;
  status?: number;
  finalUrl?: string;
  redirectChain: string[];
  server?: string;
  contentType?: string;
  poweredBy?: string;
  setCookieDomains?: string[];
  hsts?: boolean;
  titleSnippets: string[];
  credentialFormDetected: boolean;
  paymentKeywords: string[];
  reason?: string;
  bytes?: number;
}

const PAYMENT_KEYWORDS = [
  "western union", "moneygram", "gift card", "bitcoin", "usdt", "cryptocurrency payment",
  "wire transfer", "paypal friends and family", "cashapp", "zelle", "paysafecard",
];

/**
 * Fetches a submitted URL *only* through the SSRF guard. The body is treated as
 * untrusted data, never as instructions (prompt-injection defence, §8).
 */
export async function probeHttp(raw: string, reportId?: string): Promise<{ probe: HttpProbe; call: ProviderCall }> {
  const probe: HttpProbe = {
    ok: false,
    redirectChain: [],
    titleSnippets: [],
    credentialFormDetected: false,
    paymentKeywords: [],
  };
  try {
    const { data } = await meter("http-probe", "safeFetch", async () => {
      return safeFetch(raw, { maxRedirects: 3, timeoutMs: 8000, maxBytes: 256 * 1024 });
    }, { reportId, costOverride: 0 });

    probe.ok = data.ok;
    probe.status = data.status;
    probe.finalUrl = data.finalUrl;
    probe.redirectChain = data.redirectChain ?? [];
    probe.reason = data.reason;
    probe.bytes = data.bytes;
    const h = data.headers ?? {};
    probe.server = h["server"];
    probe.contentType = h["content-type"];
    probe.poweredBy = h["x-powered-by"];
    probe.hsts = Boolean(h["strict-transport-security"]);
    probe.setCookieDomains = (h["set-cookie"] ?? "").length ? [h["set-cookie"].slice(0, 200)] : [];

    if (data.body) {
      // Strip tags before any pattern matching so markup cannot fake a signal.
      const text = data.body
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      const titleMatch = data.body.match(/<title[^>]*>([\s\S]{0,200}?)<\/title>/i);
      const h1 = data.body.match(/<h1[^>]*>([\s\S]{0,200}?)<\/h1>/gi) ?? [];
      probe.titleSnippets = [titleMatch?.[1], ...h1.map((x) => x.replace(/<[^>]+>/g, ""))]
        .filter(Boolean)
        .map((s) => s!.replace(/\s+/g, " ").trim().slice(0, 160))
        .slice(0, 4);
      probe.credentialFormDetected = /<input[^>]+type=["']?password/i.test(data.body) &&
        /<form/i.test(data.body);
      const lower = text.toLowerCase();
      probe.paymentKeywords = PAYMENT_KEYWORDS.filter((k) => lower.includes(k));
      probe.titleSnippets.push(text.slice(0, 240));
    }
    return { probe, call: { provider: "http-probe", operation: "safeFetch", status: data.ok ? "ok" : "error", latencyMs: 0, costUsd: 0, detail: data.reason } };
  } catch (error) {
    probe.reason = (error as Error).message;
    return {
      probe,
      call: { provider: "http-probe", operation: "safeFetch", status: "error", latencyMs: 0, costUsd: 0, error: (error as Error).message },
    };
  }
}

export function tldRiskScore(hostname: string): { tld: string; score: number; note: string } {
  const parts = hostname.toLowerCase().split(".");
  const tld = parts[parts.length - 1] ?? "";
  const score = RISKY_TLDS.get(tld) ?? 0;
  return {
    tld,
    score,
    note: score
      ? `The .${tld} TLD carries an elevated abuse rate in phishing corpora.`
      : `The .${tld} TLD is not on the elevated-abuse list used by this engine.`,
  };
}

// Words scam domains glue straight onto a brand ("paypalsecure", "dpdtrack").
const BRAND_AFFIXES = [
  "login", "signin", "secure", "verify", "account", "auth", "id", "support", "help", "care",
  "service", "online", "official", "update", "alert", "app", "store", "shop", "pay", "payment",
  "billing", "refund", "wallet", "bank", "delivery", "parcel", "track", "tracking", "customs",
];

/**
 * Whether `brand` appears in the hostname as a whole word: a label or a
 * hyphen-separated part ("paypal-login", "royal-mail"), or glued to a common
 * scam word ("paypalsecure"). Never as a fragment of an unrelated word ("x" is
 * not in example.com, "ups" not in groups.google.com, "chase" not in
 * purchase.com), and never in the public suffix ("gov" in nhs.gov.uk).
 */
export function hostnameHasBrand(hostname: string, brand: string): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, "");
  const registrable = registrableDomain(h);
  const suffix = registrable.slice(registrable.indexOf(".") + 1);
  const name = registrable.includes(".") ? h.slice(0, -(suffix.length + 1)) : h;
  const parts = name.split(/[.-]+/).filter(Boolean);
  const words = brand.toLowerCase().split(/[\s-]+/).filter(Boolean);
  const compact = words.join("");
  return parts.some((part, i) => {
    if (part === compact) return true;
    if (words.length > 1 && parts.slice(i, i + words.length).join(" ") === words.join(" ")) return true;
    // Gluing is too loose for one- and two-letter brands ("x", "hp", "lg").
    return compact.length >= 3 && BRAND_AFFIXES.some((a) => part === compact + a || part === a + compact);
  });
}

export function hostnameDeceptionSignals(hostname: string, knownBrands: string[]): string[] {
  const signals: string[] = [];
  const h = hostname.toLowerCase();
  const folded = foldHomoglyphs(h);
  if (folded !== h.normalize("NFKC").toLowerCase()) {
    signals.push("Hostname contains characters that visually resemble other characters (homoglyph / IDN substitution risk).");
  }
  const labels = h.split(".");
  const main = labels.slice(0, -1).join(".");
  if (main.length > 25) signals.push(`Unusually long hostname label chain ("${main}").`);
  if ((h.match(/-/g) ?? []).length >= 2) signals.push("Multiple hyphens in the hostname — a common brand-impersonation pattern.");
  if (/\d{2,}/.test(main)) signals.push("Digits embedded in the brand portion of the hostname.");

  for (const brand of knownBrands) {
    if (hostnameHasBrand(h, brand)) continue;
    if (hostnameHasBrand(folded, brand)) {
      signals.push(`After homoglyph folding the hostname contains the brand "${brand}" but the raw hostname does not.`);
    }
    // brand appears as a subdomain of an unrelated registrable domain
    const registrable = registrableDomain(h);
    const regBody = registrable.split(".")[0];
    if (regBody !== brand && hostnameHasBrand(registrable, brand)) {
      signals.push(`"${brand}" is used as a subdomain of ${registrable}, not as the registered domain itself.`);
    }
  }
  return signals;
}

export function domainEvidence(profile: DnsProfile, tlsProfile: TlsProfile | null): EvidenceSource[] {
  const out: EvidenceSource[] = [];
  if (profile.addresses.length) {
    out.push({
      provider: "domain-intel",
      title: `DNS A/AAAA records for ${profile.hostname}`,
      excerpt: profile.addresses.join(", "),
      stance: "context",
      retrievedAt: new Date().toISOString(),
      trustTier: "official",
    });
  }
  if (profile.nameServers.length) {
    out.push({
      provider: "domain-intel",
      title: `Authoritative name servers for ${profile.registrableDomain}`,
      excerpt: profile.nameServers.join(", "),
      stance: "context",
      retrievedAt: new Date().toISOString(),
      trustTier: "official",
    });
  }
  if (profile.soa) {
    out.push({
      provider: "domain-intel",
      title: "SOA record",
      excerpt: `nsname=${profile.soa.nsname} · serial=${profile.soa.serial} · refresh=${profile.soa.refresh}s`,
      stance: "context",
      retrievedAt: new Date().toISOString(),
      trustTier: "official",
    });
  }
  out.push({
    provider: "domain-intel",
    title: "Email authentication posture",
    excerpt: `SPF: ${profile.spf ?? "absent"} · DMARC: ${profile.dmarc ?? "absent"} · MX: ${profile.mx.length ? profile.mx.join(", ") : "none"}`,
    stance: profile.spf && profile.dmarc ? "supports" : "context",
    retrievedAt: new Date().toISOString(),
    trustTier: "official",
  });
  if (tlsProfile?.ok) {
    out.push({
      provider: "domain-intel",
      title: `TLS certificate logged for ${profile.hostname}`,
      excerpt: `Subject CN=${tlsProfile.subject} · Issuer=${tlsProfile.issuer} · valid ${tlsProfile.validFrom?.slice(0, 10)} → ${tlsProfile.validTo?.slice(0, 10)} · ${tlsProfile.sanCount ?? 0} SAN(s)`,
      stance: tlsProfile.selfSigned ? "contradicts" : "context",
      retrievedAt: new Date().toISOString(),
      trustTier: "official",
    });
  }
  return out;
}
