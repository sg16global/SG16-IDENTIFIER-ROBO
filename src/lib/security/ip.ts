/**
 * IP literal checks with Web-standard parsing (node:net is not used on Workers).
 * Same answers as Node's net.isIPv4 / net.isIPv6 for the inputs this app sees.
 */

const OCTET = "(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)";
const IPV4_RE = new RegExp(`^${OCTET}(?:\\.${OCTET}){3}$`);

export function isIPv4(value: string): boolean {
  return IPV4_RE.test(value);
}

export function isIPv6(value: string): boolean {
  if (!value.includes(":") || /[^0-9a-f:.]/i.test(value)) return false;
  try {
    // The WHATWG URL parser accepts exactly the valid IPv6 literals.
    new URL(`http://[${value}]/`);
    return true;
  } catch {
    return false;
  }
}

/** 4, 6, or 0 when `value` is not an IP literal. */
export function isIP(value: string): 0 | 4 | 6 {
  return isIPv4(value) ? 4 : isIPv6(value) ? 6 : 0;
}
