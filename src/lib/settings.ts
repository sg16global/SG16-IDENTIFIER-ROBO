import { env } from "cloudflare:workers";

/**
 * A plain-text setting: a "vars" entry in wrangler.jsonc or a secret
 * (`wrangler secret put NAME`; .dev.vars locally). undefined when unset.
 * Worker code only — the browser bundle never imports this module.
 */
export function setting(name: string): string | undefined {
  const value = (env as unknown as Record<string, unknown>)[name];
  return typeof value === "string" ? value : undefined;
}
