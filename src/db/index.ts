import { env } from "cloudflare:workers";

/*
 * Persistence on Cloudflare D1 (SQLite), bound as `DB` in wrangler.jsonc
 * (database sg16-identifier-robo-db, schema in migrations/0001_init.sql).
 *
 * The binding is per request, so no pooling or request scoping is needed.
 * Conventions (see migrations/0001_init.sql): timestamps are ISO-8601 TEXT,
 * booleans are INTEGER 0/1, JSON payloads are TEXT holding JSON.
 */

type BindValue = null | number | string | ArrayBuffer;
type Param = BindValue | boolean | Date | undefined;

/** D1 accepts only null/number/string/ArrayBuffer; adapt the friendlier types. */
function normalize(value: Param): BindValue {
  if (value === undefined || value === null) return null;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (value instanceof Date) return value.toISOString();
  return value;
}

function d1(): D1Database {
  const binding = (env as { DB?: D1Database }).DB;
  if (!binding) throw new Error("D1 binding DB is not configured (d1_databases in wrangler.jsonc)");
  return binding;
}

export interface RunResult {
  changes: number;
}

export const db = {
  async all<T = Record<string, unknown>>(query: string, ...params: Param[]): Promise<T[]> {
    const res = await d1().prepare(query).bind(...params.map(normalize)).all();
    return res.results as T[];
  },

  async first<T = Record<string, unknown>>(query: string, ...params: Param[]): Promise<T | null> {
    const row = await d1().prepare(query).bind(...params.map(normalize)).first();
    return (row as T | null) ?? null;
  },

  async run(query: string, ...params: Param[]): Promise<RunResult> {
    const res = await d1().prepare(query).bind(...params.map(normalize)).run();
    return { changes: res.meta.changes ?? 0 };
  },

  /** Atomic multi-statement execution (D1 batch = one transaction). */
  async batch(statements: Array<{ query: string; params?: Param[] }>): Promise<void> {
    const client = d1();
    await client.batch(statements.map((s) => client.prepare(s.query).bind(...(s.params ?? []).map(normalize))));
  },
};

/** Write helper for JSON columns (stored as TEXT). */
export const json = (value: unknown): string | null =>
  value === null || value === undefined ? null : JSON.stringify(value);

/** Read helper for JSON columns. */
export function parseJson<T>(raw: unknown): T | null {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw !== "string") return raw as T;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export const isoNow = (): string => new Date().toISOString();
