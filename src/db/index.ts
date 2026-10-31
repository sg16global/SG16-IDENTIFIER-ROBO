import { env } from "cloudflare:workers";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { requestScope } from "@/lib/request-scope";
import { setting } from "@/lib/settings";

/*
 * PostgreSQL through Drizzle on Cloudflare Workers.
 *
 * Production connects through Hyperdrive (bind HYPERDRIVE in wrangler.jsonc),
 * Cloudflare's connection pooler, using node-postgres as Cloudflare documents
 * for Hyperdrive; without the binding, DATABASE_URL is used directly.
 *
 * A Worker's socket belongs to the request that opened it, so nothing is
 * pooled across requests (a shared pool makes the next request hang): each
 * request gets one connection, opened on its first query and closed by the
 * runtime when the request ends. Queries within a request run in sequence.
 */

function connectionString(): string {
  const hyperdrive = (env as { HYPERDRIVE?: Hyperdrive }).HYPERDRIVE;
  const url = hyperdrive?.connectionString ?? setting("DATABASE_URL");
  if (!url) throw new Error("DATABASE_URL is required (or a HYPERDRIVE binding)");
  return url;
}

function connect(): NodePgDatabase {
  return drizzle(new Pool({ connectionString: connectionString(), max: 1 }));
}

function currentDb(): NodePgDatabase {
  const scope = requestScope();
  // Outside a request nothing may be shared, so each use gets its own client.
  if (!scope) return connect();
  return (scope.db ??= connect());
}

/** Drizzle client for the current request. */
export const db: NodePgDatabase = new Proxy({} as NodePgDatabase, {
  get(_target, property) {
    const instance = currentDb();
    const value = Reflect.get(instance, property, instance);
    return typeof value === "function" ? value.bind(instance) : value;
  },
});
