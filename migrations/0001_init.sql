-- SG16 Identifier — D1 (SQLite) schema, migration 0001.
-- Applied by `wrangler deploy` (or `npx wrangler d1 migrations apply sg16-identifier-robo-db --remote`).
-- Conventions: timestamps are ISO-8601 TEXT (UTC, lexicographically sortable),
-- booleans are INTEGER 0/1, JSON payloads are TEXT holding JSON.

CREATE TABLE IF NOT EXISTS verification_reports (
  id TEXT PRIMARY KEY,
  public_id TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL,
  status TEXT NOT NULL,
  confidence REAL,
  summary TEXT NOT NULL,
  input_text TEXT,
  input_url TEXT,
  input_kind TEXT,
  payload TEXT,
  workflow TEXT,
  limitations TEXT,
  next_steps TEXT,
  shareable INTEGER NOT NULL DEFAULT 0,
  flagged INTEGER NOT NULL DEFAULT 0,
  latency_ms INTEGER,
  cost_usd REAL NOT NULL DEFAULT 0,
  providers_used TEXT,
  ip_fingerprint TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  checked_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  retention_expires_at TEXT
);
CREATE INDEX IF NOT EXISTS verification_reports_category_idx ON verification_reports (category);
CREATE INDEX IF NOT EXISTS verification_reports_created_at_idx ON verification_reports (created_at);
CREATE INDEX IF NOT EXISTS verification_reports_status_idx ON verification_reports (status);

CREATE TABLE IF NOT EXISTS evidence_sources (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL REFERENCES verification_reports (id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  url TEXT,
  title TEXT,
  publisher TEXT,
  excerpt TEXT,
  stance TEXT NOT NULL DEFAULT 'neutral',
  published_at TEXT,
  retrieved_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  trust_tier TEXT,
  meta TEXT
);
CREATE INDEX IF NOT EXISTS evidence_sources_report_idx ON evidence_sources (report_id);

CREATE TABLE IF NOT EXISTS report_findings (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL REFERENCES verification_reports (id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  detail TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info',
  weight REAL NOT NULL DEFAULT 1,
  source_refs TEXT,
  position INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS report_findings_report_idx ON report_findings (report_id);

CREATE TABLE IF NOT EXISTS product_catalog (
  id TEXT PRIMARY KEY,
  brand TEXT NOT NULL,
  model TEXT NOT NULL,
  family TEXT,
  category TEXT NOT NULL,
  identifiers TEXT NOT NULL,
  specs TEXT NOT NULL,
  known_counterfeit_signals TEXT,
  official_url TEXT,
  source TEXT NOT NULL,
  last_reviewed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (brand, model)
);
CREATE INDEX IF NOT EXISTS product_catalog_brand_idx ON product_catalog (brand);
CREATE INDEX IF NOT EXISTS product_catalog_category_idx ON product_catalog (category);

CREATE TABLE IF NOT EXISTS provider_usage (
  id TEXT PRIMARY KEY,
  report_id TEXT,
  provider TEXT NOT NULL,
  operation TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ok',
  latency_ms INTEGER,
  tokens_in INTEGER,
  tokens_out INTEGER,
  cost_usd REAL NOT NULL DEFAULT 0,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS provider_usage_provider_idx ON provider_usage (provider);
CREATE INDEX IF NOT EXISTS provider_usage_created_idx ON provider_usage (created_at);

CREATE TABLE IF NOT EXISTS feedback (
  id TEXT PRIMARY KEY,
  report_id TEXT,
  public_id TEXT,
  kind TEXT NOT NULL,
  message TEXT,
  contact TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS feedback_status_idx ON feedback (status);

CREATE TABLE IF NOT EXISTS affiliate_events (
  id TEXT PRIMARY KEY,
  report_id TEXT,
  retailer TEXT NOT NULL,
  product_ref TEXT,
  destination TEXT NOT NULL,
  disclosed INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS affiliate_events_created_idx ON affiliate_events (created_at);

CREATE TABLE IF NOT EXISTS business_accounts (
  id TEXT PRIMARY KEY,
  organization TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  plan TEXT NOT NULL DEFAULT 'starter',
  monthly_quota INTEGER NOT NULL DEFAULT 1000,
  used_this_month INTEGER NOT NULL DEFAULT 0,
  api_key_prefix TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS service_flags (
  key TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 1,
  detail TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  actor TEXT NOT NULL DEFAULT 'system',
  action TEXT NOT NULL,
  meta TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS audit_events_created_idx ON audit_events (created_at);

CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  interest TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
