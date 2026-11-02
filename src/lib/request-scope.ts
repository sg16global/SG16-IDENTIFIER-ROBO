import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Per-request state for code deep in the call stack (work that must finish
 * after the response). AsyncLocalStorage is implemented natively by the
 * Workers runtime; it carries the scope through every await.
 * The D1 binding needs no per-request client: the runtime scopes it already.
 */

export interface RequestScope {
  ctx: ExecutionContext;
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
