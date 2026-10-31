import type { DbExec, MigrationEntry } from "@agent-native/core/db";

import { ISO_TIMESTAMP_DEFAULT_SQL } from "./timestamps.js";

// `runMigrations` splits a SQL string and executes each statement on its own,
// outside a transaction. This migration therefore runs through `exec.transaction`,
// which holds one connection for the whole callback (Postgres `BEGIN`/`COMMIT`,
// or one PGlite transaction). Re-running it is a no-op: defaults are set to the
// same expression, and only values that are not already ISO UTC are rewritten.
const ISO_UTC_SQL =
  "^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\\.[0-9]{3}Z$";

const IDENT = /^[a-z_]+$/;

function ident(name: string) {
  if (!IDENT.test(name)) throw new Error(`Unsafe SQL identifier: ${name}`);
  return name;
}

function asIso(column: string) {
  return `to_char((${ident(column)}::timestamptz AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;
}

function setIsoDefault(table: string, column: string) {
  return `ALTER TABLE ${ident(table)} ALTER COLUMN ${ident(column)} SET DEFAULT ${ISO_TIMESTAMP_DEFAULT_SQL}`;
}

function normalizeTimestamps(
  table: string,
  columns: { name: string; nullable: boolean }[],
) {
  const sets = columns.map((column) => {
    const name = ident(column.name);
    const keep = column.nullable
      ? `${name} IS NULL OR ${name} ~ '${ISO_UTC_SQL}'`
      : `${name} ~ '${ISO_UTC_SQL}'`;
    return `${name} = CASE WHEN ${keep} THEN ${name} ELSE ${asIso(name)} END`;
  });
  const where = columns
    .map((column) => {
      const name = ident(column.name);
      return column.nullable
        ? `(${name} IS NOT NULL AND ${name} !~ '${ISO_UTC_SQL}')`
        : `${name} !~ '${ISO_UTC_SQL}'`;
    })
    .join(" OR ");
  return `UPDATE ${ident(table)} SET ${sets.join(", ")} WHERE ${where}`;
}

const ISO_DEFAULTS: [string, string][] = [
  ["briefs", "updated_at"],
  ["briefs", "created_at"],
  ["brief_shares", "created_at"],
  ["citations", "created_at"],
  ["review_items", "created_at"],
  ["dike_desk_seed_markers", "applied_at"],
];

const ISO_COLUMNS: [string, { name: string; nullable: boolean }[]][] = [
  [
    "briefs",
    [
      { name: "updated_at", nullable: false },
      { name: "created_at", nullable: false },
    ],
  ],
  [
    "brief_shares",
    [
      { name: "created_at", nullable: false },
      { name: "notified_at", nullable: true },
    ],
  ],
  ["citations", [{ name: "created_at", nullable: false }]],
  [
    "review_items",
    [
      { name: "created_at", nullable: false },
      { name: "decided_at", nullable: true },
    ],
  ],
  ["dike_desk_seed_markers", [{ name: "applied_at", nullable: false }]],
];

export function isoTimestampMigrationStatements() {
  return [
    ...ISO_DEFAULTS.map(([table, column]) => setIsoDefault(table, column)),
    ...ISO_COLUMNS.map(([table, columns]) =>
      normalizeTimestamps(table, columns),
    ),
  ];
}

function citationAnchorStatements() {
  return [
    `ALTER TABLE review_items ADD COLUMN IF NOT EXISTS citation_raw TEXT`,
    `UPDATE review_items AS ri
     SET citation_raw = c.raw
     FROM citations AS c
     WHERE ri.citation_id = c.id
       AND ri.brief_id = c.brief_id
       AND ri.citation_raw IS NULL`,
  ];
}

export async function applyIsoTimestampMigration(exec: DbExec) {
  if (!exec.transaction) {
    throw new Error(
      "ISO timestamp migration requires DbExec.transaction so the default changes and row updates commit on one connection.",
    );
  }
  await exec.transaction(async (tx) => {
    for (const statement of [
      ...isoTimestampMigrationStatements(),
      ...citationAnchorStatements(),
    ])
      await tx.execute(statement);
  });
}

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
  {
    version: 3,
    name: "iso-timestamps-and-citation-anchors",
    // Empty object: no follow-up SQL. The runner would execute a string
    // outside the transaction opened by `run`.
    sql: {},
    run: applyIsoTimestampMigration,
  },
];
