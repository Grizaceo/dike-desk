import { runWithRequestContext } from "@agent-native/core/server";
import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MIGRATIONS } from "../server/db/migrations.js";
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
  const schema = await import("../server/db/schema.js");
  return { getDb: () => holder.db, schema };
});

vi.mock("../server/lib/dike.js", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../server/lib/dike.js")>();
  return { ...mod, runConstancia: holder.runConstancia };
});

const { default: addComment } = await import("../actions/add-comment.js");
const { default: getBrief } = await import("../actions/get-brief.js");
const { default: verifyBrief } = await import("../actions/verify-brief.js");
const { schema } = await import("../server/db/index.js");

const LAWYER = "lawyer@example.invalid";
const CTX = { userEmail: LAWYER, caller: "frontend" as const };
const RAW = "art. 161 CT";
const BODY = `Invoca ${RAW} del mismo cuerpo.`;

function asLawyer<T>(fn: () => T): T {
  return runWithRequestContext({ userEmail: LAWYER, orgId: undefined }, fn);
}

function engine(raws: string[]) {
  return {
    result: {
      veredicto: "CON_PROBLEMAS",
      mensaje: "ok",
      problemas: [],
      detalles: raws.map((cita_raw) => ({
        cita_raw,
        estado: "FALLO",
        resolucion: "NONE",
        gid: null,
        cuerpo: null,
        texto_hash: null,
        vigencia: null,
        fuente_url: null,
        fecha_recuperacion: null,
      })),
      meta: {
        as_of: "2026-10-31",
        fecha_constancia: "2026-10-31",
        pack_hash: "TEST_ONLY",
        total_citas: raws.length,
        citas_verificadas: 0,
        citas_fallidas: raws.length,
      },
    },
    commitment: null,
    signature: null,
    pubkey: null,
  };
}

async function seedCitation(db: TestDb, id: string, raw: string, body: string) {
  const start = body.indexOf(raw);
  await db.insert(schema.citations).values({
    id,
    briefId: "b1",
    position: (await db.select().from(schema.citations)).length,
    raw,
    start,
    end: start + raw.length,
    status: "refused",
    ownerEmail: LAWYER,
  });
}

describe("review anchors survive re-verification", () => {
  let db: TestDb;

  beforeEach(async () => {
    db = await createTestDb();
    holder.db = db;
    holder.runConstancia.mockReset();
    await db.insert(schema.briefs).values({
      id: "b1",
      title: "Escrito",
      body: BODY,
      verdict: "CON_PROBLEMAS",
      verificationMeta: JSON.stringify({ pack_hash: "TEST_ONLY" }),
      ownerEmail: LAWYER,
    });
    await seedCitation(db, "c1", RAW, BODY);
  });

  it("keeps the citation id and raw after another verification of the same text", async () => {
    holder.runConstancia.mockResolvedValue(engine([RAW]));
    const comment = await asLawyer(() =>
      addComment.run({ briefId: "b1", citationId: "c1", body: "nota" }, CTX),
    );
    await asLawyer(() => verifyBrief.run({ briefId: "b1" }, CTX));
    const view = await asLawyer(() => getBrief.run({ briefId: "b1" }, CTX));
    const anchored = view.review.find((item) => item.id === comment.id);
    expect(anchored).toMatchObject({
      citationId: "c1",
      citationRaw: RAW,
    });
    expect(view.citations.map((citation) => citation.id)).toEqual(["c1"]);
  });

  it("keeps the anchor text when re-verification drops the citation", async () => {
    holder.runConstancia.mockResolvedValue(engine(["norma distinta"]));
    const comment = await asLawyer(() =>
      addComment.run({ briefId: "b1", citationId: "c1", body: "nota" }, CTX),
    );
    await asLawyer(() => verifyBrief.run({ briefId: "b1" }, CTX));
    const view = await asLawyer(() => getBrief.run({ briefId: "b1" }, CTX));
    expect(view.citations.map((citation) => citation.id)).not.toContain("c1");
    expect(view.review.find((item) => item.id === comment.id)).toMatchObject({
      citationId: "c1",
      citationRaw: RAW,
    });
  });

  it("reuses each occurrence of a repeated raw independently", async () => {
    const body = "art. 1 y art. 1 final";
    await db
      .update(schema.briefs)
      .set({ body })
      .where(eq(schema.briefs.id, "b1"));
    await db.delete(schema.citations).where(eq(schema.citations.briefId, "b1"));
    const first = body.indexOf("art. 1");
    const second = body.lastIndexOf("art. 1");
    await db.insert(schema.citations).values([
      {
        id: "c-first",
        briefId: "b1",
        position: 0,
        raw: "art. 1",
        start: first,
        end: first + "art. 1".length,
        status: "refused",
        ownerEmail: LAWYER,
      },
      {
        id: "c-second",
        briefId: "b1",
        position: 1,
        raw: "art. 1",
        start: second,
        end: second + "art. 1".length,
        status: "refused",
        ownerEmail: LAWYER,
      },
    ]);
    const onFirst = await asLawyer(() =>
      addComment.run(
        { briefId: "b1", citationId: "c-first", body: "primera" },
        CTX,
      ),
    );
    const onSecond = await asLawyer(() =>
      addComment.run(
        { briefId: "b1", citationId: "c-second", body: "segunda" },
        CTX,
      ),
    );
    holder.runConstancia.mockResolvedValue(engine(["art. 1", "art. 1"]));
    await asLawyer(() => verifyBrief.run({ briefId: "b1" }, CTX));
    const view = await asLawyer(() => getBrief.run({ briefId: "b1" }, CTX));
    expect(view.citations.map((citation) => citation.id)).toEqual([
      "c-first",
      "c-second",
    ]);
    expect(view.review.find((item) => item.id === onFirst.id)?.citationId).toBe(
      "c-first",
    );
    expect(
      view.review.find((item) => item.id === onSecond.id)?.citationId,
    ).toBe("c-second");
  });
});

describe("v3 backfills citation_raw", () => {
  it("copies the citation text once and leaves a second run unchanged", async () => {
    const client = new PGlite();
    await client.waitReady;
    for (const migration of MIGRATIONS)
      if (migration.version < 3) await applyMigration(client, migration);
    await client.exec(`
      INSERT INTO briefs (id, title, body, owner_email)
      VALUES ('b1', 'Escrito', '', 'lawyer@example.invalid');
      INSERT INTO citations (
        id, brief_id, position, raw, start, "end", status, owner_email
      ) VALUES (
        'c1', 'b1', 0, 'art. 161 CT', 0, 10, 'refused', 'lawyer@example.invalid'
      );
      INSERT INTO review_items (
        id, brief_id, citation_id, kind, author, body, owner_email
      ) VALUES
        ('kept', 'b1', 'c1', 'comment', 'user', 'nota', 'lawyer@example.invalid'),
        ('orphan', 'b1', 'gone', 'comment', 'user', 'vieja', 'lawyer@example.invalid');
    `);
    const v3 = MIGRATIONS.find((migration) => migration.version === 3)!;
    await v3.run!(pgliteExec(client));
    const first = await client.query(
      `SELECT id, citation_id, citation_raw FROM review_items ORDER BY id`,
    );
    await v3.run!(pgliteExec(client));
    const second = await client.query(
      `SELECT id, citation_id, citation_raw FROM review_items ORDER BY id`,
    );
    expect(second.rows).toEqual(first.rows);
    expect(second.rows).toEqual([
      { id: "kept", citation_id: "c1", citation_raw: "art. 161 CT" },
      { id: "orphan", citation_id: "gone", citation_raw: null },
    ]);
    await client.close();
  });
});
