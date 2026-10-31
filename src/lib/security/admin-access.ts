import { env } from "cloudflare:workers";
import { constantTimeEqual } from "@/lib/security/compare";
import { setting } from "@/lib/settings";
import { sha256Hex } from "@/lib/utils";
import type { GuardState } from "@/worker/guard";

/**
 * Operator-console access with first-login rotation.
 *
 * There is deliberately no default credential: the temporary code lives only
 * in the ADMIN_ACCESS_CODE secret (Cloudflare dashboard / `wrangler secret
 * put`), never in code — this repo is public, so a code in source would be a
 * backdoor into every deployment.
 *
 * Flow: the first login with the temporary code succeeds but is flagged
 * `mustChange`, and the console then requires setting a permanent code. The
 * permanent code is stored only as a SHA-256 hash in the GUARD Durable
 * Object. If a permanent code exists, the temporary code still works as
 * break-glass recovery, but every such login is again flagged `mustChange`.
 */

export interface AdminAuth {
  ok: boolean;
  mustChange: boolean;
}

function guardNamespace(): DurableObjectNamespace<GuardState> | undefined {
  return (env as { GUARD?: DurableObjectNamespace<GuardState> }).GUARD;
}

async function adminGuard(): Promise<DurableObjectStub<GuardState> | undefined> {
  const ns = guardNamespace();
  if (!ns) return undefined;
  try {
    return ns.get(ns.idFromName("admin-access"));
  } catch {
    return undefined;
  }
}

export async function storedAdminCodeHash(): Promise<string | null> {
  const stub = await adminGuard();
  if (!stub) return null;
  try {
    return await stub.adminCodeHash();
  } catch {
    return null;
  }
}

export async function storeAdminCodeHash(hash: string): Promise<void> {
  const stub = await adminGuard();
  if (!stub) throw new Error("GuardState Durable Object unavailable");
  await stub.setAdminCode(hash);
}

/** The dashboard-set temporary code. Empty string = console closed to everyone. */
export function temporaryAdminCode(): string {
  return setting("ADMIN_ACCESS_CODE") ?? "";
}

export async function checkAdminAuth(request: Request): Promise<AdminAuth> {
  // Header only: a code in the URL would be written to server and CDN logs.
  const supplied = request.headers.get("x-sg16-admin") ?? "";
  if (!supplied) return { ok: false, mustChange: false };
  const temp = temporaryAdminCode();
  const storedHash = await storedAdminCodeHash();
  if (storedHash) {
    if (constantTimeEqual(await sha256Hex(supplied), storedHash)) return { ok: true, mustChange: false };
    if (temp && constantTimeEqual(supplied, temp)) return { ok: true, mustChange: true };
    return { ok: false, mustChange: false };
  }
  if (temp && constantTimeEqual(supplied, temp)) return { ok: true, mustChange: true };
  return { ok: false, mustChange: false };
}
