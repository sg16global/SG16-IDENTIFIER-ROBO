import { setting } from "@/lib/settings";
import { assertPublicResolution, hostnameLooksInternal } from "@/lib/security/url-guard";

/**
 * URLs supplied by an API caller (x-vitex-base-url, /v1/forward): any public
 * http(s) server of any company is allowed. Private, loopback and internal
 * addresses are refused unless the operator sets VITEX_ALLOW_PRIVATE_TARGETS —
 * otherwise any key holder could reach this deployment's own network.
 */

export function privateTargetsAllowed(): boolean {
  return ["1", "true", "yes", "on"].includes((setting("VITEX_ALLOW_PRIVATE_TARGETS") ?? "").trim().toLowerCase());
}

export type CallerUrlCheck = { ok: true; url: URL } | { ok: false; reason: string; status: 400 | 403 };

export async function checkCallerUrl(raw: string): Promise<CallerUrlCheck> {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, status: 400, reason: `"${raw.slice(0, 200)}" is not an absolute URL` };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { ok: false, status: 400, reason: `${url.protocol} URLs are not supported (http and https only)` };
  }
  if (url.username || url.password) return { ok: false, status: 400, reason: "put credentials in headers, not in the URL" };
  if (privateTargetsAllowed()) return { ok: true, url };

  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (hostnameLooksInternal(host)) return { ok: false, status: 403, reason: `${host} is a private or internal host` };
  const resolution = await assertPublicResolution(host);
  if (!resolution.ok) {
    // Addresses present means it resolved somewhere private; none means it did not resolve.
    return { ok: false, status: resolution.addresses.length ? 403 : 400, reason: resolution.reason ?? `${host} did not resolve` };
  }
  return { ok: true, url };
}
