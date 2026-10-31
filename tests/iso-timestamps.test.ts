import { runWithRequestContext } from "@agent-native/core/server";
import { PGlite } from "@electric-sql/pglite";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MIGRATIONS } from "../server/db/migrations.js";
import * as schema from "../server/db/schema.js";
import { ISO_UTC_TIMESTAMP } from "../server/db/timestamps.js";
import {
  applyMigration,
  createTestDb,
  pgliteExec,
  type TestDb,
} from "./helpers/test-db.js";

const holder = vi.hoisted(() => ({
  db: null as TestDb | null,
  runConstancia: vi.fn(),
}));

vi.mock("../server/db/index.js", async () => {
  const dbSchema = await import("../server/db/schema.js");
  return { getDb: () => holder.db, schema: dbSchema };
});

vi.mock("../server/lib/dike.js", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../server/lib/dike.js")>();
  return { ...mod, runConstancia: holder.runConstancia };
});

const { default: createBrief } = await import("../actions/create-brief.js");
const { default: addComment } = await import("../actions/add-comment.js");
const { default: proposeFix } = await import("../actions/propose-fix.js");
const { default: decideSuggestion } =
  await import("../actions/decide-suggestion.js");
const { default: verifyBrief } = await import("../actions/verify-brief.js");
const { default: listBriefs } = await import("../actions/list-briefs.js");

const LAWYER = "lawyer@example.invalid";
const CTX = { userEmail: LAWYER, caller: "frontend" as const };
const DB_DEFAULT = "db-default";

async function forceDefault(table: string, column: string) {
  await holder.db!.execute(
    sql.raw(
      `ALTER TABLE ${table} ALTER COLUMN ${column} SET DEFAULT '${DB_DEFAULT}'`,
    ),
  );
}

function asLawyer<T>(fn: () => T): T {
  return runWithRequestContext({ userEmail: LAWYER, orgId: undefined }, fn);
}

const v3 = MIGRATIONS.find((migration) => migration.version === 3);

function legacyDb() {
  const client = new PGlite();
  return client.waitReady.then(async () => {
    for (const migration of MIGRATIONS)
      if (migration.version < 3) await applyMigration(client, migration);
    return client;
  });
}

describe("ISO UTC timestamps", () => {
  let db: TestDb;

  beforeEach(async () => {
    db = await createTestDb();
    holder.db = db;
    holder.runConstancia.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("app inserts write ISO explicitly", () => {
    it("create-brief stores createdAt and updatedAt as the same ISO instant", async () => {
      await forceDefault("briefs", "created_at");
      await forceDefault("briefs", "updated_at");
      const created = await asLawyer(() =>
        createBrief.run({ title: "Nuevo", body: "" }, CTX),
      );
      const [row] = await db
        .select()
        .from(schema.briefs)
        .where(eq(schema.briefs.id, created.id));
      expect(row.createdAt).toMatch(ISO_UTC_TIMESTAMP);
      expect(row.updatedAt).toBe(row.createdAt);
      expect(row.createdAt).not.toBe(DB_DEFAULT);
    });

    it("add-comment, propose-fix and decide-suggestion stamp createdAt", async () => {
      await db.insert(schema.briefs).values({
        id: "b1",
        title: "Escrito",
        body: "Invoca art. 1.",
        ownerEmail: LAWYER,
        updatedAt: "2019-01-01T00:00:00.000Z",
        createdAt: "2019-01-01T00:00:00.000Z",
      });
      await db.insert(schema.citations).values({
        id: "c1",
        briefId: "b1",
        position: 0,
        raw: "art. 1",
        start: 7,
        end: 12,
        status: "verified",
        ownerEmail: LAWYER,
        createdAt: "2019-01-01T00:00:00.000Z",
      });
      await db.insert(schema.reviewItems).values({
        id: "s1",
        briefId: "b1",
        citationId: "c1",
        kind: "suggestion",
        author: "agent",
        body: "motivo",
        replacement: "art. 1 CT",
        state: "pending",
        ownerEmail: LAWYER,
        createdAt: "2019-01-01T00:00:00.000Z",
      });
      await forceDefault("review_items", "created_at");

      const comment = await asLawyer(() =>
        addComment.run({ briefId: "b1", body: "nota" }, CTX),
      );
      const proposal = await asLawyer(() =>
        proposeFix.run(
          {
            briefId: "b1",
            citationId: "c1",
            replacement: "art. 1 CT",
            rationale: "nombre",
          },
          CTX,
        ),
      );
      await asLawyer(() =>
        decideSuggestion.run(
          { suggestionId: "s1", decision: "rejected" },
          CTX,
        ),
      );

      const rows = await db.select().from(schema.reviewItems);
      const byId = new Map(rows.map((row) => [row.id, row]));
      for (const id of [comment.id, proposal.id]) {
        expect(byId.get(id)?.createdAt).toMatch(ISO_UTC_TIMESTAMP);
        expect(byId.get(id)?.createdAt).not.toBe(DB_DEFAULT);
      }
      const decision = rows.find((row) => row.kind === "decision");
      expect(decision?.createdAt).toMatch(ISO_UTC_TIMESTAMP);
      expect(decision?.createdAt).not.toBe(DB_DEFAULT);
    });

    it("verify-brief stamps new citations and the engine note", async () => {
      await db.insert(schema.briefs).values({
        id: "b1",
        title: "Escrito",
        body: "Invoca art. 1.",
        ownerEmail: LAWYER,
        updatedAt: "2019-01-01T00:00:00.000Z",
        createdAt: "2019-01-01T00:00:00.000Z",
      });
      holder.runConstancia.mockResolvedValue({
        result: {
          veredicto: "TODAS_VERIFICADAS",
          mensaje: "ok",
          problemas: [],
          detalles: [
            {
              cita_raw: "art. 1",
              estado: "VERIFICADA",
              resolucion: "EXACT",
              gid: null,
              cuerpo: null,
              texto_hash: null,
              vigencia: null,
              fuente_url: null,
              fecha_recuperacion: "2020-01-02",
            },
          ],
          meta: {
            as_of: "2020-01-02",
            fecha_constancia: "2020-01-02",
            pack_hash: "TEST_ONLY",
            total_citas: 1,
            citas_verificadas: 1,
            citas_fallidas: 0,
          },
        },
        commitment: null,
        signature: null,
        pubkey: null,
      });
      await forceDefault("citations", "created_at");
      await forceDefault("review_items", "created_at");
      await asLawyer(() => verifyBrief.run({ briefId: "b1" }, CTX));
      const [citation] = await db.select().from(schema.citations);
      const [note] = (await db.select().from(schema.reviewItems)).filter(
        (row) => row.kind === "agent_note",
      );
      expect(citation.createdAt).toMatch(ISO_UTC_TIMESTAMP);
      expect(citation.createdAt).not.toBe(DB_DEFAULT);
      expect(citation.retrievedAt).toBe("2020-01-02");
      expect(note.createdAt).toMatch(ISO_UTC_TIMESTAMP);
      expect(note.createdAt).not.toBe(DB_DEFAULT);
    });
  });

  describe("v3 migration", () => {
    it("normalizes mixed timestamp formats, orders list-briefs, and is a no-op the second time", async () => {
      expect(v3?.run).toBeTypeOf("function");
      const client = await legacyDb();
      await client.exec(`
        INSERT INTO briefs (id, title, body, owner_email, updated_at, created_at)
        VALUES
          ('early', 'Early', '', '${LAWYER}', '2026-10-31T08:00:00.000Z', '2026-10-31 07:00:00+00'),
          ('mid', 'Mid', '', '${LAWYER}', '2026-10-31 12:00:00.4+00', '2026-10-31T11:00:00.000Z'),
          ('later', 'Later', '', '${LAWYER}', '2026-10-31 18:30:00+00', '2026-10-31T09:00:00.000Z');
        INSERT INTO citations (
          id, brief_id, position, raw, start, "end", status, owner_email,
          created_at, retrieved_at
        ) VALUES (
          'c1', 'early', 0, 'art. 1', 0, 5, 'verified', '${LAWYER}',
          '2026-10-31 07:00:00+00', '2026-10-30'
        );
        INSERT INTO review_items (
          id, brief_id, kind, author, body, owner_email, created_at, decided_at
        ) VALUES (
          'r1', 'early', 'comment', 'user', 'nota', '${LAWYER}',
          '2026-10-31T08:00:00.000Z', '2026-10-31 08:05:00+00'
        );
        INSERT INTO brief_shares (
          id, resource_id, principal_type, principal_id, role, created_at, notified_at
        ) VALUES (
          'sh1', 'early', 'user', 'editor@example.invalid', 'editor',
          '2026-10-31 06:00:00+00', NULL
        );
        INSERT INTO dike_desk_seed_markers (key, applied_at)
        VALUES ('legal-team:v1', '2026-10-31 05:00:00+00');
      `);

      const before = await client.query<{ id: string }>(
        `SELECT id FROM briefs ORDER BY updated_at DESC`,
      );
      expect(before.rows.map((row) => row.id)).toEqual([
        "early",
        "later",
        "mid",
      ]);

      await v3!.run!(pgliteExec(client));
      const first = await client.query(
        `SELECT id, updated_at, created_at FROM briefs ORDER BY id`,
      );
      await v3!.run!(pgliteExec(client));
      const second = await client.query(
        `SELECT id, updated_at, created_at FROM briefs ORDER BY id`,
      );
      expect(second.rows).toEqual(first.rows);

      const briefs = await client.query<{
        id: string;
        updated_at: string;
        created_at: string;
      }>(`SELECT id, updated_at, created_at FROM briefs ORDER BY id`);
      const byId = new Map(briefs.rows.map((row) => [row.id, row]));
      expect(byId.get("early")).toEqual({
        id: "early",
        updated_at: "2026-10-31T08:00:00.000Z",
        created_at: "2026-10-31T07:00:00.000Z",
      });
      expect(byId.get("mid")).toEqual({
        id: "mid",
        updated_at: "2026-10-31T12:00:00.400Z",
        created_at: "2026-10-31T11:00:00.000Z",
      });
      expect(byId.get("later")).toEqual({
        id: "later",
        updated_at: "2026-10-31T18:30:00.000Z",
        created_at: "2026-10-31T09:00:00.000Z",
      });
      for (const row of briefs.rows) {
        expect(row.updated_at).toMatch(ISO_UTC_TIMESTAMP);
        expect(row.created_at).toMatch(ISO_UTC_TIMESTAMP);
      }

      const [citation] = (
        await client.query<{ created_at: string; retrieved_at: string }>(
          `SELECT created_at, retrieved_at FROM citations WHERE id = 'c1'`,
        )
      ).rows;
      expect(citation.created_at).toBe("2026-10-31T07:00:00.000Z");
      expect(citation.retrieved_at).toBe("2026-10-30");

      const [review] = (
        await client.query<{ created_at: string; decided_at: string }>(
          `SELECT created_at, decided_at FROM review_items WHERE id = 'r1'`,
        )
      ).rows;
      expect(review.created_at).toBe("2026-10-31T08:00:00.000Z");
      expect(review.decided_at).toBe("2026-10-31T08:05:00.000Z");

      const [share] = (
        await client.query<{ created_at: string; notified_at: string | null }>(
          `SELECT created_at, notified_at FROM brief_shares WHERE id = 'sh1'`,
        )
      ).rows;
      expect(share.created_at).toBe("2026-10-31T06:00:00.000Z");
      expect(share.notified_at).toBeNull();

      const [marker] = (
        await client.query<{ applied_at: string }>(
          `SELECT applied_at FROM dike_desk_seed_markers`,
        )
      ).rows;
      expect(marker.applied_at).toBe("2026-10-31T05:00:00.000Z");

      const defaults = await client.query<{
        table_name: string;
        column_name: string;
        column_default: string;
      }>(
        `SELECT table_name, column_name, column_default
         FROM information_schema.columns
         WHERE (table_name, column_name) IN (
           ('briefs', 'updated_at'),
           ('briefs', 'created_at'),
           ('brief_shares', 'created_at'),
           ('citations', 'created_at'),
           ('review_items', 'created_at'),
           ('dike_desk_seed_markers', 'applied_at')
         )`,
      );
      expect(defaults.rows).toHaveLength(6);
      for (const row of defaults.rows)
        expect(row.column_default).toContain("to_char");

      holder.db = drizzle(client, { schema });
      const listed = await asLawyer(() => listBriefs.run({}, CTX));
      expect(listed.briefs.map((brief) => brief.id)).toEqual([
        "later",
        "mid",
        "early",
      ]);
      await client.close();
    });

    it("rolls the default changes and updates back together when a later statement fails", async () => {
      const client = await legacyDb();
      await client.exec(`
        INSERT INTO briefs (id, title, body, owner_email, updated_at, created_at)
        VALUES ('later', 'Later', '', '${LAWYER}', '2026-10-31 18:30:00+00', '2026-10-31T09:00:00.000Z');
      `);
      const exec = pgliteExec(client);
      const transaction = exec.transaction!.bind(exec);
      let updates = 0;
      exec.transaction = (fn) =>
        transaction(async (tx) => {
          const execute = tx.execute.bind(tx);
          tx.execute = async (statement) => {
            const sql =
              typeof statement === "string" ? statement : statement.sql;
            if (/^\s*UPDATE\b/i.test(sql)) {
              updates += 1;
              if (updates === 2) throw new Error("injected failure");
            }
            return execute(statement);
          };
          return fn(tx);
        });

      await expect(v3!.run!(exec)).rejects.toThrow("injected failure");
      const [brief] = (
        await client.query<{ updated_at: string }>(
          `SELECT updated_at FROM briefs WHERE id = 'later'`,
        )
      ).rows;
      expect(brief.updated_at).toBe("2026-10-31 18:30:00+00");
      const [column] = (
        await client.query<{ column_default: string }>(
          `SELECT column_default FROM information_schema.columns
           WHERE table_name = 'briefs' AND column_name = 'updated_at'`,
        )
      ).rows;
      expect(column.column_default).toBe("now()");
      expect(column.column_default).not.toContain("to_char");
      await client.close();
    });
  });
});
