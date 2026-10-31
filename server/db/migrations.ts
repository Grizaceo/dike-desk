import type { MigrationEntry } from "@agent-native/core/db";

// The schema DDL as runMigrations entries, shared by the db plugin and tests.
export const MIGRATIONS: MigrationEntry[] = [
  {
    version: 1,
    name: "briefs-citations-review",
    sql: `CREATE TABLE IF NOT EXISTS briefs (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  verdict TEXT,
  verification_meta TEXT,
  commitment_json TEXT,
  updated_at TEXT NOT NULL DEFAULT (now()),
  created_at TEXT NOT NULL DEFAULT (now()),
  owner_email TEXT NOT NULL DEFAULT 'local@localhost',
  org_id TEXT,
  visibility TEXT NOT NULL DEFAULT 'private'
);
CREATE TABLE IF NOT EXISTS brief_shares (
  id TEXT PRIMARY KEY,
  resource_id TEXT NOT NULL,
  principal_type TEXT NOT NULL,
  principal_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer',
  created_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (now()),
  notified_at TEXT
);
CREATE TABLE IF NOT EXISTS citations (
  id TEXT PRIMARY KEY,
  brief_id TEXT NOT NULL REFERENCES briefs(id),
  position INTEGER NOT NULL,
  raw TEXT NOT NULL,
  start INTEGER NOT NULL,
  "end" INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('verified', 'ambiguous', 'refused', 'stale')),
  resolution TEXT,
  gid TEXT,
  label TEXT,
  text_sha256 TEXT,
  source_url TEXT,
  retrieved_at TEXT,
  owner_email TEXT NOT NULL,
  org_id TEXT,
  created_at TEXT NOT NULL DEFAULT (now())
);
CREATE TABLE IF NOT EXISTS review_items (
  id TEXT PRIMARY KEY,
  brief_id TEXT NOT NULL REFERENCES briefs(id),
  citation_id TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('comment', 'suggestion', 'decision', 'agent_note')),
  author TEXT NOT NULL CHECK (author IN ('user', 'agent', 'engine')),
  body TEXT NOT NULL,
  replacement TEXT,
  state TEXT CHECK (state IS NULL OR state IN ('pending', 'accepted', 'rejected', 'expired')),
  owner_email TEXT NOT NULL,
  org_id TEXT,
  created_at TEXT NOT NULL DEFAULT (now()),
  decided_at TEXT
);
CREATE INDEX IF NOT EXISTS briefs_owner_org_idx ON briefs (owner_email, org_id, updated_at);
CREATE INDEX IF NOT EXISTS brief_shares_resource_idx ON brief_shares (resource_id, principal_type, principal_id);
CREATE INDEX IF NOT EXISTS citations_brief_idx ON citations (brief_id, position);
CREATE INDEX IF NOT EXISTS review_items_brief_idx ON review_items (brief_id, created_at)`,
  },
  {
    version: 2,
    name: "legal-team-seed-markers",
    sql: `CREATE TABLE IF NOT EXISTS dike_desk_seed_markers (
  key TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (now())
)`,
  },
];
