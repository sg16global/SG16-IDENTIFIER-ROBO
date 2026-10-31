import { AsyncLocalStorage } from "node:async_hooks";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

/**
 * Per-request state for code deep in the call stack (the database client,
 * work that must finish after the response). AsyncLocalStorage is implemented
 * natively by the Workers runtime; it carries the scope through every await.
 */

export interface RequestScope {
  ctx: ExecutionContext;
  /** This request's database client, opened on first use (src/db/index.ts). */
  db?: NodePgDatabase;
}

const storage = new AsyncLocalStorage<RequestScope>();

export function runInRequestScope<T>(ctx: ExecutionContext, fn: () => T): T {
  return storage.run({ ctx }, fn);
}

/** Re-enters a captured scope, e.g. from a stream callback the runtime invokes later. */
export function runInScope<T>(scope: RequestScope, fn: () => T): T {
  return storage.run(scope, fn);
}

export function requestScope(): RequestScope | undefined {
  return storage.getStore();
}

/** Keeps `task` running after the response is sent, for the life of the request. */
export function afterResponse(task: Promise<unknown>, scope = requestScope()): void {
  scope?.ctx.waitUntil(task.catch(() => {}));
}
