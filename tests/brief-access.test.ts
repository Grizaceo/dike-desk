import { runWithRequestContext } from "@agent-native/core/server";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createTestDb, type TestDb } from "./helpers/test-db.js";

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

const { default: getBrief } = await import("../actions/get-brief.js");
const { default: updateBrief } = await import("../actions/update-brief.js");
const { default: addComment } = await import("../actions/add-comment.js");
const { default: proposeFix } = await import("../actions/propose-fix.js");
const { default: verifyBrief } = await import("../actions/verify-brief.js");
const { default: emitCommitment } =
  await import("../actions/emit-commitment.js");
const { default: decideSuggestion } =
  await import("../actions/decide-suggestion.js");
const { schema } = await import("../server/db/index.js");

const OWNER = "owner@example.invalid";
const EDITOR = "editor@example.invalid";
const COMMENTER = "commenter@example.invalid";
const VIEWER = "viewer@example.invalid";
const UNRELATED = "unrelated@example.invalid";

const RAW = "art. 161 CT";
const BODY = `Invoca ${RAW} del mismo cuerpo.`;

function ctxFor(userEmail: string) {
  return { userEmail, caller: "frontend" as const };
}

function as<T>(userEmail: string, fn: () => T): T {
  return runWithRequestContext({ userEmail, orgId: undefined }, fn);
}

function engineResult() {
  return {
    result: {
      veredicto: "TODAS_VERIFICADAS",
      mensaje: "synthetic engine stub",
      alcance: "test only",
      problemas: [],
      detalles: [
        {
          cita_raw: RAW,
          gid: "test:161",
          estado: "VERIFICADA",
          resolucion: "EXACT",
          cuerpo: "CT",
          texto_hash: "dummy",
          vigencia: "test",
          fuente_url: "https://example.invalid",
          fecha_recuperacion: "2026-10-30",
        },
      ],
      meta: {
        as_of: "2026-10-30",
        fecha_constancia: "2026-10-30",
        pack_hash: "TEST_ONLY",
        total_citas: 1,
        citas_verificadas: 1,
        citas_fallidas: 0,
      },
    },
    commitment: { testedBody: BODY },
    signature: null,
    pubkey: null,
  };
}

async function seed(db: TestDb) {
  await db.insert(schema.briefs).values({
    id: "b1",
    title: "Escrito",
    body: BODY,
    verdict: "TODAS_VERIFICADAS",
    verificationMeta: JSON.stringify({
      pack_hash: "TEST_ONLY",
      as_of: "2026-10-30",
      as_of_source: "abogado",
    }),
    ownerEmail: OWNER,
    visibility: "private",
  });
  await db.insert(schema.citations).values({
    id: "c1",
    briefId: "b1",
    position: 0,
    raw: RAW,
    start: BODY.indexOf(RAW),
    end: BODY.indexOf(RAW) + RAW.length,
    status: "verified",
    ownerEmail: OWNER,
  });
  await db.insert(schema.reviewItems).values({
    id: "s1",
    briefId: "b1",
    citationId: "c1",
    kind: "suggestion",
    author: "agent",
    body: "Full provision name",
    replacement: "art. 161 del Código del Trabajo",
    state: "pending",
    ownerEmail: OWNER,
  });
  await db.insert(schema.briefShares).values(
    (
      [
        ["sh-editor", EDITOR, "editor"],
        ["sh-commenter", COMMENTER, "commenter"],
        ["sh-viewer", VIEWER, "viewer"],
      ] as const
    ).map(([id, principalId, role]) => ({
      id,
      resourceId: "b1",
      principalType: "user",
      principalId,
      role,
    })),
  );
}

async function briefRow(db: TestDb) {
  const [row] = await db
    .select()
    .from(schema.briefs)
    .where(eq(schema.briefs.id, "b1"));
  return row;
}

async function count(db: TestDb, table: typeof schema.reviewItems) {
  return (await db.select().from(table)).length;
}

const NOT_FOUND = { statusCode: 404, errorCode: "not_found" };

describe("brief access by share role", () => {
  let db: TestDb;

  beforeEach(async () => {
    db = await createTestDb();
    holder.db = db;
    holder.runConstancia.mockReset();
    holder.runConstancia.mockResolvedValue(engineResult());
    await seed(db);
  });

  it.each([OWNER, EDITOR, COMMENTER, VIEWER])(
    "get-brief lets %s read the brief",
    async (user) => {
      const result = await as(user, () =>
        getBrief.run({ briefId: "b1" }, ctxFor(user)),
      );
      expect(result.brief.id).toBe("b1");
    },
  );

  it("get-brief hides the brief from an unrelated user", async () => {
    await expect(
      as(UNRELATED, () => getBrief.run({ briefId: "b1" }, ctxFor(UNRELATED))),
    ).rejects.toMatchObject(NOT_FOUND);
  });

  describe("update-brief", () => {
    it.each([VIEWER, COMMENTER, UNRELATED])(
      "denies %s with 404 and leaves the body intact",
      async (user) => {
        const expectedUpdatedAt = (await briefRow(db)).updatedAt;
        await expect(
          as(user, () =>
            updateBrief.run(
              { briefId: "b1", body: "texto ajeno", expectedUpdatedAt },
              ctxFor(user),
            ),
          ),
        ).rejects.toMatchObject(NOT_FOUND);
        const row = await briefRow(db);
        expect(row.body).toBe(BODY);
        expect(row.verdict).toBe("TODAS_VERIFICADAS");
        const [citation] = await db.select().from(schema.citations);
        expect(citation.status).toBe("verified");
      },
    );

    it.each([OWNER, EDITOR])("lets %s edit and marks stale", async (user) => {
      const expectedUpdatedAt = (await briefRow(db)).updatedAt;
      const result = await as(user, () =>
        updateBrief.run(
          { briefId: "b1", body: "texto nuevo", expectedUpdatedAt },
          ctxFor(user),
        ),
      );
      expect(result).toEqual({ id: "b1", stale: true });
      expect((await briefRow(db)).body).toBe("texto nuevo");
      const [citation] = await db.select().from(schema.citations);
      expect(citation.status).toBe("stale");
    });
  });

  describe("update-brief is human-only", () => {
    it("is flagged uiOnly", () => {
      expect(updateBrief.uiOnly).toBe(true);
    });

    it.each(["tool", "cli", "http"] as const)(
      "denies caller %s before touching the brief, even for the owner",
      async (caller) => {
        const expectedUpdatedAt = (await briefRow(db)).updatedAt;
        await expect(
          as(OWNER, () =>
            updateBrief.run(
              { briefId: "b1", body: "texto del agente", expectedUpdatedAt },
              { userEmail: OWNER, caller },
            ),
          ),
        ).rejects.toMatchObject({
          errorCode: "ui_only_action",
          statusCode: 403,
        });
        const row = await briefRow(db);
        expect(row.body).toBe(BODY);
        expect(row.verdict).toBe("TODAS_VERIFICADAS");
        const [citation] = await db.select().from(schema.citations);
        expect(citation.status).toBe("verified");
      },
    );
  });

  describe("add-comment", () => {
    it.each([VIEWER, UNRELATED])("denies %s with 404", async (user) => {
      await expect(
        as(user, () =>
          addComment.run({ briefId: "b1", body: "hola" }, ctxFor(user)),
        ),
      ).rejects.toMatchObject(NOT_FOUND);
      expect(
        (await db.select().from(schema.reviewItems)).filter(
          (r) => r.kind === "comment",
        ),
      ).toHaveLength(0);
    });

    it.each([COMMENTER, EDITOR, OWNER])("lets %s comment", async (user) => {
      const result = await as(user, () =>
        addComment.run({ briefId: "b1", body: "hola" }, ctxFor(user)),
      );
      expect(result.id).toEqual(expect.any(String));
    });
  });

  describe("propose-fix", () => {
    const args = {
      briefId: "b1",
      citationId: "c1",
      replacement: "art. 161 del Código del Trabajo",
      rationale: "nombre completo",
    };

    it.each([VIEWER, UNRELATED])("denies %s with 404", async (user) => {
      const before = await count(db, schema.reviewItems);
      await expect(
        as(user, () => proposeFix.run(args, ctxFor(user))),
      ).rejects.toMatchObject(NOT_FOUND);
      expect(await count(db, schema.reviewItems)).toBe(before);
    });

    it.each([COMMENTER, EDITOR, OWNER])("lets %s propose", async (user) => {
      const result = await as(user, () => proposeFix.run(args, ctxFor(user)));
      expect(result.state).toBe("pending");
    });

    it.each([
      ["frontend", "user"],
      ["tool", "agent"],
      ["http", "agent"],
    ] as const)("records caller %s as %s", async (caller, author) => {
      const result = await as(OWNER, () =>
        proposeFix.run(args, { userEmail: OWNER, caller }),
      );
      const [row] = await db
        .select()
        .from(schema.reviewItems)
        .where(eq(schema.reviewItems.id, result.id));
      expect(row.author).toBe(author);
    });
  });

  describe("verify-brief", () => {
    it.each([VIEWER, COMMENTER, UNRELATED])(
      "denies %s with 404 before calling the engine",
      async (user) => {
        await expect(
          as(user, () => verifyBrief.run({ briefId: "b1" }, ctxFor(user))),
        ).rejects.toMatchObject(NOT_FOUND);
        expect(holder.runConstancia).not.toHaveBeenCalled();
      },
    );

    it.each([EDITOR, OWNER])("lets %s verify", async (user) => {
      const result = await as(user, () =>
        verifyBrief.run({ briefId: "b1" }, ctxFor(user)),
      );
      expect(result.verdict).toBe("TODAS_VERIFICADAS");
      expect(holder.runConstancia).toHaveBeenCalledTimes(1);
    });
  });

  describe("emit-commitment", () => {
    it.each([VIEWER, COMMENTER, UNRELATED])(
      "denies %s with 404 before calling the engine",
      async (user) => {
        await expect(
          as(user, () => emitCommitment.run({ briefId: "b1" }, ctxFor(user))),
        ).rejects.toMatchObject(NOT_FOUND);
        expect(holder.runConstancia).not.toHaveBeenCalled();
        expect((await briefRow(db)).commitmentJson).toBeNull();
      },
    );

    it.each([EDITOR, OWNER])("lets %s emit", async (user) => {
      const result = await as(user, () =>
        emitCommitment.run({ briefId: "b1" }, ctxFor(user)),
      );
      expect(result.verdict).toBe("TODAS_VERIFICADAS");
      expect(holder.runConstancia).toHaveBeenCalledTimes(1);
      expect((await briefRow(db)).commitmentJson).not.toBeNull();
    });
  });

  describe("decide-suggestion", () => {
    const args = { suggestionId: "s1", decision: "accepted" as const };

    it("returns the same error for an inaccessible and missing suggestion", async () => {
      const errors = await Promise.all(
        ["s1", "missing"].map((suggestionId) =>
          as(UNRELATED, () =>
            decideSuggestion.run({ ...args, suggestionId }, ctxFor(UNRELATED)),
          ).catch((error) => error),
        ),
      );
      for (const error of errors)
        expect(error).toMatchObject({
          statusCode: 404,
          errorCode: "not_found",
          message: "No se encontró el escrito o el elemento.",
        });
    });

    it.each([VIEWER, COMMENTER, UNRELATED])(
      "denies %s with 404 and changes nothing",
      async (user) => {
        await expect(
          as(user, () => decideSuggestion.run(args, ctxFor(user))),
        ).rejects.toMatchObject(NOT_FOUND);
        expect((await briefRow(db)).body).toBe(BODY);
        const [item] = await db
          .select()
          .from(schema.reviewItems)
          .where(eq(schema.reviewItems.id, "s1"));
        expect(item.state).toBe("pending");
      },
    );

    it.each([EDITOR, OWNER])("lets %s decide", async (user) => {
      const result = await as(user, () =>
        decideSuggestion.run(args, ctxFor(user)),
      );
      expect(result).toEqual({ id: "s1", state: "accepted" });
      expect((await briefRow(db)).body).toBe(
        BODY.replace(RAW, "art. 161 del Código del Trabajo"),
      );
    });
  });
});
