import {
  createSharesTable,
  ownableColumns,
} from "@agent-native/core/db/schema";
import { integer, pgTable, text } from "drizzle-orm/pg-core";

import { isoTimestampDefault } from "./timestamps.js";

export const dikeDeskSeedMarkers = pgTable("dike_desk_seed_markers", {
  key: text("key").primaryKey(),
  appliedAt: text("applied_at").notNull().default(isoTimestampDefault),
});

// A brief (escrito) is the shareable resource. Citations and review events are
// children: they inherit the brief's access and are scoped by brief_id.
export const briefs = pgTable("briefs", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  body: text("body").notNull().default(""),
  // Last engine verdict: null until verified, then TODAS_VERIFICADAS / CON_PROBLEMAS.
  verdict: text("verdict"),
  // Engine metadata from the last run (as_of, pack_hash, counters), JSON text.
  verificationMeta: text("verification_meta"),
  // Latest commitment emitted by the engine, JSON text. Never edited by the app.
  commitmentJson: text("commitment_json"),
  updatedAt: text("updated_at").notNull().default(isoTimestampDefault),
  createdAt: text("created_at").notNull().default(isoTimestampDefault),
  ...ownableColumns(),
});
export const briefShares = createSharesTable("brief_shares");

export const CITATION_STATUSES = [
  "verified",
  "ambiguous",
  "refused",
  "stale",
] as const;
export type CitationStatus = (typeof CITATION_STATUSES)[number];

// One row per citation the engine reported on the last verification run.
// `status` comes only from Diké; the app and the agent never upgrade it.
export const citations = pgTable("citations", {
  id: text("id").primaryKey(),
  briefId: text("brief_id").notNull(),
  position: integer("position").notNull(),
  raw: text("raw").notNull(),
  // Character offsets of `raw` inside the brief body at verification time
  // (-1 when the engine reported text the app could not locate).
  start: integer("start").notNull(),
  end: integer("end").notNull(),
  status: text("status", { enum: CITATION_STATUSES }).notNull(),
  resolution: text("resolution"),
  gid: text("gid"),
  // Engine's machine-readable vigencia code (IN_FORCE, OUT_OF_FORCE,
  // UNKNOWN_BEFORE_SNAPSHOT, ...) and historical-text availability,
  // kept verbatim for the certificate and the cards.
  vigencia: text("vigencia"),
  historicalTextState: text("historical_text_state"),
  label: text("label"),
  textSha256: text("text_sha256"),
  sourceUrl: text("source_url"),
  retrievedAt: text("retrieved_at"),
  ownerEmail: text("owner_email").notNull(),
  orgId: text("org_id"),
  createdAt: text("created_at").notNull().default(isoTimestampDefault),
});

export const SUGGESTION_STATES = [
  "pending",
  "accepted",
  "rejected",
  "expired",
] as const;
export type SuggestionState = (typeof SUGGESTION_STATES)[number];

// Review-graph style ledger: every proposal, decision and comment leaves a row.
// Rejected suggestions are kept on purpose; they are memory, not noise.
export const reviewItems = pgTable("review_items", {
  id: text("id").primaryKey(),
  briefId: text("brief_id").notNull(),
  citationId: text("citation_id"),
  // The citation text at the time of the ledger row. Survives re-verification
  // even when the citation row itself is gone.
  citationRaw: text("citation_raw"),
  kind: text("kind", {
    enum: ["comment", "suggestion", "decision", "agent_note"],
  }).notNull(),
  author: text("author", { enum: ["user", "agent", "engine"] }).notNull(),
  body: text("body").notNull(),
  // Suggestions only: the exact replacement text proposed for the citation.
  replacement: text("replacement"),
  state: text("state", { enum: SUGGESTION_STATES }),
  ownerEmail: text("owner_email").notNull(),
  orgId: text("org_id"),
  createdAt: text("created_at").notNull().default(isoTimestampDefault),
  decidedAt: text("decided_at"),
});
