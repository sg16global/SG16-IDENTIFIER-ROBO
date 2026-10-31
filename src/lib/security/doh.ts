/**
 * DNS over HTTPS (RFC 8484, JSON form) through Cloudflare's public resolver —
 * the Workers replacement for node:dns. Failures carry the same error codes
 * node:dns used (ENOTFOUND, ENODATA, ESERVFAIL, ETIMEOUT), so the text that
 * reaches reports is unchanged.
 */

const ENDPOINT = "https://cloudflare-dns.com/dns-query";

const TYPES = { A: 1, NS: 2, CNAME: 5, SOA: 6, MX: 15, TXT: 16, AAAA: 28 } as const;
export type RecordType = keyof typeof TYPES;

export class DnsError extends Error {
  constructor(
    readonly code: "ENOTFOUND" | "ENODATA" | "ESERVFAIL" | "ETIMEOUT" | "EREFUSED" | "EBADRESP",
    hostname: string,
  ) {
    super(`query ${code} ${hostname}`);
    this.name = "DnsError";
  }
}

interface DohResponse {
  Status: number;
  Answer?: Array<{ name: string; type: number; TTL: number; data: string }>;
}

/** Raw answer strings of one type ("10 mx.example.com.", "\"v=spf1 -all\"", …). Throws DnsError. */
export async function resolveRaw(hostname: string, type: RecordType, timeoutMs = 4000): Promise<string[]> {
  const url = `${ENDPOINT}?name=${encodeURIComponent(hostname)}&type=${type}`;
  let body: DohResponse;
  try {
    const res = await fetch(url, { headers: { accept: "application/dns-json" }, signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) throw new DnsError("ESERVFAIL", hostname);
    body = (await res.json()) as DohResponse;
  } catch (error) {
    if (error instanceof DnsError) throw error;
    const name = (error as { name?: string }).name;
    throw new DnsError(name === "TimeoutError" || name === "AbortError" ? "ETIMEOUT" : "EBADRESP", hostname);
  }
  // RCODEs: 0 NOERROR, 2 SERVFAIL, 3 NXDOMAIN, 5 REFUSED.
  if (body.Status === 3) throw new DnsError("ENOTFOUND", hostname);
  if (body.Status === 5) throw new DnsError("EREFUSED", hostname);
  if (body.Status !== 0) throw new DnsError("ESERVFAIL", hostname);
  // Answers can include the CNAME chain that led to the records asked for.
  const answers = (body.Answer ?? []).filter((a) => a.type === TYPES[type]).map((a) => a.data);
  if (!answers.length) throw new DnsError("ENODATA", hostname);
  return answers;
}

const stripDot = (name: string) => name.replace(/\.$/, "");

/** Every A and AAAA address of a hostname (what node:dns lookup({ all: true }) returns). */
export async function lookupAll(hostname: string): Promise<string[]> {
  const [v4, v6] = await Promise.allSettled([resolveRaw(hostname, "A"), resolveRaw(hostname, "AAAA")]);
  const addresses = [...(v4.status === "fulfilled" ? v4.value : []), ...(v6.status === "fulfilled" ? v6.value : [])];
  if (addresses.length) return addresses;
  const failure = [v4, v6].find((r): r is PromiseRejectedResult => r.status === "rejected" && (r.reason as DnsError).code !== "ENODATA");
  throw failure ? failure.reason : new DnsError("ENODATA", hostname);
}

export async function resolveNs(hostname: string): Promise<string[]> {
  return (await resolveRaw(hostname, "NS")).map(stripDot);
}

export async function resolveCname(hostname: string): Promise<string[]> {
  return (await resolveRaw(hostname, "CNAME")).map(stripDot);
}

export async function resolveMx(hostname: string): Promise<Array<{ priority: number; exchange: string }>> {
  return (await resolveRaw(hostname, "MX")).map((data) => {
    const [priority, exchange = ""] = data.split(/\s+/);
    return { priority: Number(priority), exchange: stripDot(exchange) };
  });
}

/** Each TXT record as its character-strings, as node:dns resolveTxt returns them. */
export async function resolveTxt(hostname: string): Promise<string[][]> {
  return (await resolveRaw(hostname, "TXT")).map((data) => {
    const parts = [...data.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1].replace(/\\(.)/g, "$1"));
    return parts.length ? parts : [data];
  });
}

export async function resolveSoa(hostname: string): Promise<{ nsname: string; hostmaster: string; serial: number; refresh: number }> {
  const [data] = await resolveRaw(hostname, "SOA");
  const [nsname = "", hostmaster = "", serial = "0", refresh = "0"] = data.split(/\s+/);
  return { nsname: stripDot(nsname), hostmaster: stripDot(hostmaster), serial: Number(serial), refresh: Number(refresh) };
}
