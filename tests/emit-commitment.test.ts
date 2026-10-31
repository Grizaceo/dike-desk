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

const { default: emitCommitment } =
  await import("../actions/emit-commitment.js");
const { schema } = await import("../server/db/index.js");

const LAWYER = "lawyer@example.invalid";
const CTX = { userEmail: LAWYER, caller: "frontend" as const };
const UPDATED_AT = "2026-10-31T08:00:00.000Z";
const STORED_META = JSON.stringify({
  pack_hash: "STORED_PACK",
  as_of: "2026-10-31",
});

function asLawyer<T>(fn: () => T): T {
  return runWithRequestContext({ userEmail: LAWYER, orgId: undefined }, fn);
}

function engine(overrides: {
  veredicto?: string;
  pack_hash?: string;
}) {
  return {
    result: {
      veredicto: overrides.veredicto ?? "TODAS_VERIFICADAS",
      mensaje: "ok",
      problemas: [],
      detalles: [],
      meta: {
        as_of: "2026-10-31",
        fecha_constancia: "2026-10-31",
        pack_hash: overrides.pack_hash ?? "STORED_PACK",
        total_citas: 0,
        citas_verificadas: 0,
        citas_fallidas: 0,
      },
    },
    commitment: { citas: [] },
    signature: null,
    pubkey: null,
  };
}

describe("emit-commitment matches the stored verification", () => {
  let db: TestDb;

  beforeEach(async () => {
    db = await createTestDb();
    holder.db = db;
    holder.runConstancia.mockReset();
    await db.insert(schema.briefs).values({
      id: "b1",
      title: "Escrito",
      body: "Cuerpo.",
      verdict: "TODAS_VERIFICADAS",
      verificationMeta: STORED_META,
      ownerEmail: LAWYER,
      updatedAt: UPDATED_AT,
      createdAt: UPDATED_AT,
    });
  });

  async function row() {
    const [brief] = await db
      .select()
      .from(schema.briefs)
      .where(eq(schema.briefs.id, "b1"));
    return brief;
  }

  it("stores the commitment when the verdict and pack_hash match", async () => {
    holder.runConstancia.mockResolvedValue(engine({}));
    const result = await asLawyer(() =>
      emitCommitment.run({ briefId: "b1" }, CTX),
    );
    expect(result.verdict).toBe("TODAS_VERIFICADAS");
    expect(result.commitment).toEqual({ citas: [] });
    const brief = await row();
    expect(JSON.parse(brief.commitmentJson!)).toMatchObject({
      commitment: { citas: [] },
    });
    expect(brief.updatedAt).not.toBe(UPDATED_AT);
  });

  it("rejects a verdict mismatch and persists nothing", async () => {
    holder.runConstancia.mockResolvedValue(
      engine({ veredicto: "CON_PROBLEMAS" }),
    );
    await expect(
      asLawyer(() => emitCommitment.run({ briefId: "b1" }, CTX)),
    ).rejects.toMatchObject({
      statusCode: 409,
      errorCode: "commitment_mismatch",
    });
    const brief = await row();
    expect(brief.commitmentJson).toBeNull();
    expect(brief.updatedAt).toBe(UPDATED_AT);
    expect(brief.verdict).toBe("TODAS_VERIFICADAS");
    expect(brief.verificationMeta).toBe(STORED_META);
  });

  it("rejects a pack_hash mismatch and persists nothing", async () => {
    holder.runConstancia.mockResolvedValue(engine({ pack_hash: "OTHER_PACK" }));
    await expect(
      asLawyer(() => emitCommitment.run({ briefId: "b1" }, CTX)),
    ).rejects.toMatchObject({
      statusCode: 409,
      errorCode: "commitment_mismatch",
    });
    const brief = await row();
    expect(brief.commitmentJson).toBeNull();
    expect(brief.updatedAt).toBe(UPDATED_AT);
    expect(brief.verificationMeta).toBe(STORED_META);
  });
});
