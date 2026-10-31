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

const { default: verifyBrief } = await import("../actions/verify-brief.js");
const { default: getBrief } = await import("../actions/get-brief.js");
const { schema } = await import("../server/db/index.js");

const LAWYER = "lawyer@example.invalid";
const CTX = { userEmail: LAWYER, caller: "frontend" as const };
const AGENT_CTX = { userEmail: LAWYER, caller: "tool" as const };
const RAW = "art. 161 CT";
const BODY = `Invoca ${RAW} del mismo cuerpo.`;

function asLawyer<T>(fn: () => T): T {
  return runWithRequestContext({ userEmail: LAWYER, orgId: undefined }, fn);
}

// The engine mock echoes the requested asOf like the real engine does.
function engineResult(asOf = "2026-10-31") {
  return {
    result: {
      veredicto: "CON_PROBLEMAS",
      mensaje: "synthetic engine stub",
      alcance: "test only",
      problemas: [],
      detalles: [
        {
          cita_raw: RAW,
          estado: "VERIFICADA",
          resolucion: "EXACT",
          gid: "test:161",
          cuerpo: "Código del Trabajo",
          texto_hash: "dummy",
          vigencia: "IN_FORCE",
          vigencia_legible: "vigente",
          estado_texto_historico: "CURRENT_VERSION_APPLIES",
          fuente_url: "https://example.invalid",
          fecha_recuperacion: "2026-10-30",
        },
      ],
      meta: {
        as_of: asOf,
        fecha_constancia: "2026-10-31",
        pack_hash: "TEST_ONLY",
        total_citas: 1,
        citas_verificadas: 1,
        citas_fallidas: 0,
      },
    },
    commitment: null,
    signature: null,
    pubkey: null,
  };
}

async function briefRow() {
  const [row] = await holder
    .db!.select()
    .from(schema.briefs)
    .where(eq(schema.briefs.id, "b1"));
  return row;
}

async function citationRows() {
  return holder
    .db!.select()
    .from(schema.citations)
    .where(eq(schema.citations.briefId, "b1"));
}

describe("verify-brief as_of (RJ-03/RJ-21)", () => {
  let db: TestDb;

  beforeEach(async () => {
    db = await createTestDb();
    holder.db = db;
    holder.runConstancia.mockReset();
    holder.runConstancia.mockImplementation(
      (_body: string, opts?: { asOf?: string }) =>
        Promise.resolve(engineResult(opts?.asOf)),
    );
    await db.insert(schema.briefs).values({
      id: "b1",
      title: "Escrito",
      body: BODY,
      ownerEmail: LAWYER,
    });
  });

  it("stores as_of_source 'abogado' when the lawyer picks the date", async () => {
    const result = await asLawyer(() =>
      verifyBrief.run({ briefId: "b1", asOf: "2026-10-15" }, CTX),
    );
    expect(result.asOfSource).toBe("abogado");
    expect(holder.runConstancia).toHaveBeenCalledWith(BODY, {
      asOf: "2026-10-15",
    });
    const stored = JSON.parse((await briefRow()).verificationMeta!);
    expect(stored.as_of).toBe("2026-10-15");
    expect(stored.as_of_source).toBe("abogado");
  });

  it("stores as_of_source 'agente' when a non-UI caller picks the date", async () => {
    const result = await asLawyer(() =>
      verifyBrief.run({ briefId: "b1", asOf: "2026-10-15" }, AGENT_CTX),
    );
    expect(result.asOfSource).toBe("agente");
    const stored = JSON.parse((await briefRow()).verificationMeta!);
    expect(stored.as_of_source).toBe("agente");
  });

  it("reuses the chosen date when asOf is omitted on a later run", async () => {
    await asLawyer(() =>
      verifyBrief.run({ briefId: "b1", asOf: "2026-10-15" }, CTX),
    );
    holder.runConstancia.mockClear();
    const result = await asLawyer(() =>
      verifyBrief.run({ briefId: "b1" }, CTX),
    );
    expect(holder.runConstancia).toHaveBeenCalledWith(BODY, {
      asOf: "2026-10-15",
    });
    expect(result.asOfSource).toBe("abogado");
    const stored = JSON.parse((await briefRow()).verificationMeta!);
    expect(stored.as_of).toBe("2026-10-15");
    expect(stored.as_of_source).toBe("abogado");
  });

  it("does not reuse an engine default (motor) date", async () => {
    await asLawyer(() => verifyBrief.run({ briefId: "b1" }, CTX));
    const stored = JSON.parse((await briefRow()).verificationMeta!);
    expect(stored.as_of_source).toBe("motor (fecha de hoy)");
    holder.runConstancia.mockClear();
    await asLawyer(() => verifyBrief.run({ briefId: "b1" }, CTX));
    expect(holder.runConstancia).toHaveBeenCalledWith(BODY, {
      asOf: undefined,
    });
  });

  it("rejects an invalid asOf without calling the engine", async () => {
    await expect(
      asLawyer(() =>
        verifyBrief.run({ briefId: "b1", asOf: "2026-02-30" }, CTX),
      ),
    ).rejects.toMatchObject({ errorCode: "invalid_as_of", statusCode: 400 });
    expect(holder.runConstancia).not.toHaveBeenCalled();
  });

  it("writes the engine note in Spanish with as_of and pack_hash", async () => {
    await asLawyer(() =>
      verifyBrief.run({ briefId: "b1", asOf: "2026-10-15" }, CTX),
    );
    const [note] = (await db.select().from(schema.reviewItems)).filter(
      (r) => r.kind === "agent_note",
    );
    expect(note.body).toBe(
      "Diké: 1 de 1 citas detectadas existen y están vigentes al 2026-10-15 (corpus TEST_ONLY).",
    );
  });
});

describe("verify-brief persists vigencia (RJ-11)", () => {
  let db: TestDb;

  beforeEach(async () => {
    db = await createTestDb();
    holder.db = db;
    holder.runConstancia.mockReset();
    holder.runConstancia.mockResolvedValue(engineResult());
    await db.insert(schema.briefs).values({
      id: "b1",
      title: "Escrito",
      body: BODY,
      ownerEmail: LAWYER,
    });
  });

  it("stores vigencia and historical_text_state on the citation row", async () => {
    await asLawyer(() => verifyBrief.run({ briefId: "b1" }, CTX));
    const [citation] = await citationRows();
    expect(citation.vigencia).toBe("IN_FORCE");
    expect(citation.historicalTextState).toBe("CURRENT_VERSION_APPLIES");
  });

  it("returns both columns from get-brief", async () => {
    await asLawyer(() => verifyBrief.run({ briefId: "b1" }, CTX));
    const result = await asLawyer(() =>
      getBrief.run({ briefId: "b1" }, CTX),
    );
    expect(result.citations[0].vigencia).toBe("IN_FORCE");
    expect(result.citations[0].historicalTextState).toBe(
      "CURRENT_VERSION_APPLIES",
    );
  });
});

