import { runWithRequestContext } from "@agent-native/core/server";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { commitmentHash } from "../server/lib/brief-hash.js";
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
const { default: getBrief } = await import("../actions/get-brief.js");
const { schema } = await import("../server/db/index.js");

const LAWYER = "lawyer@example.invalid";
const CTX = { userEmail: LAWYER, caller: "frontend" as const };
const AGENT_CTX = { userEmail: LAWYER, caller: "tool" as const };
const UPDATED_AT = "2026-10-31T08:00:00.000Z";
const RAW_OK = "art. 161 CT";
const RAW_BAD = "art. 9999 CT";
const RAW_AMB = "art. 16";
const BODY = `Invoca ${RAW_OK}, luego ${RAW_BAD} y también ${RAW_AMB}.`;
const STORED_META = JSON.stringify({
  pack_hash: "STORED_PACK",
  as_of: "2026-10-31",
  as_of_source: "abogado",
});

function asLawyer<T>(fn: () => T): T {
  return runWithRequestContext({ userEmail: LAWYER, orgId: undefined }, fn);
}

function detail(
  raw: string,
  estado: "VERIFICADA" | "FALLO",
  resolucion = "EXACT",
) {
  return {
    cita_raw: raw,
    estado,
    resolucion,
    gid: "test:gid",
    cuerpo: "Código del Trabajo",
    texto_hash: "th",
    vigencia: "IN_FORCE",
    fuente_url: "https://example.invalid",
    fecha_recuperacion: "2026-10-30",
  };
}

function engine(overrides: {
  veredicto?: string;
  pack_hash?: string;
  as_of?: string;
  detalles?: ReturnType<typeof detail>[];
  commitment?: unknown;
  signature?: unknown;
}) {
  const detalles = overrides.detalles ?? [detail(RAW_OK, "VERIFICADA")];
  return {
    result: {
      veredicto: overrides.veredicto ?? "TODAS_VERIFICADAS",
      mensaje: "ok",
      problemas: [],
      detalles,
      meta: {
        as_of: overrides.as_of ?? "2026-10-31",
        fecha_constancia: "2026-10-31",
        pack_hash: overrides.pack_hash ?? "STORED_PACK",
        total_citas: detalles.length,
        citas_verificadas: detalles.filter((d) => d.estado === "VERIFICADA")
          .length,
        citas_fallidas: detalles.filter((d) => d.estado === "FALLO").length,
      },
    },
    commitment: overrides.commitment ?? { citas: [] },
    signature: overrides.signature ?? null,
    pubkey: null,
  };
}

type CitationSeed = {
  id: string;
  raw: string;
  status: "verified" | "ambiguous" | "refused" | "stale";
};

async function seed(verdict: string, citations: CitationSeed[]) {
  await holder.db!.insert(schema.briefs).values({
    id: "b1",
    title: "Escrito",
    body: BODY,
    verdict,
    verificationMeta: STORED_META,
    ownerEmail: LAWYER,
    updatedAt: UPDATED_AT,
    createdAt: UPDATED_AT,
  });
  for (const [position, c] of citations.entries())
    await holder.db!.insert(schema.citations).values({
      id: c.id,
      briefId: "b1",
      position,
      raw: c.raw,
      start: BODY.indexOf(c.raw),
      end: BODY.indexOf(c.raw) + c.raw.length,
      status: c.status,
      ownerEmail: LAWYER,
    });
}

describe("emit-commitment", () => {
  let db: TestDb;

  beforeEach(async () => {
    db = await createTestDb();
    holder.db = db;
    holder.runConstancia.mockReset();
  });

  async function row() {
    const [brief] = await db
      .select()
      .from(schema.briefs)
      .where(eq(schema.briefs.id, "b1"));
    return brief;
  }

  describe("fully verified", () => {
    beforeEach(async () => {
      await seed("TODAS_VERIFICADAS", [
        { id: "c1", raw: RAW_OK, status: "verified" },
      ]);
      holder.runConstancia.mockResolvedValue(engine({}));
    });

    it("emits without confirmation and the certificate lists every citation", async () => {
      const result = await asLawyer(() =>
        emitCommitment.run({ briefId: "b1" }, CTX),
      );
      expect(result.verdict).toBe("TODAS_VERIFICADAS");
      expect(result.partial).toBe(false);
      const cert = result.certificate!;
      expect(cert.schema_version).toBe("dike-desk-certificado-v1");
      expect(cert.parcial).toBe(false);
      expect(cert.emision_parcial_confirmada).toBe(false);
      expect(cert.as_of).toBe("2026-10-31");
      expect(cert.as_of_origen).toBe("abogado");
      expect(cert.totales).toEqual({
        detectadas: 1,
        verificadas: 1,
        no_verificadas: 0,
      });
      expect(cert.citas).toEqual([
        expect.objectContaining({
          posicion: 1,
          cita: RAW_OK,
          estado: "verified",
          estado_legible: "Existe y está vigente",
          vigencia: null,
          cuerpo: null,
        }),
      ]);
      expect(cert.alcance).toContain("STORED_PACK");
      expect(cert.alcance).toContain("2026-10-31");
      const brief = await row();
      const stored = JSON.parse(brief.commitmentJson!);
      expect(stored.commitment).toEqual({ citas: [] });
      expect(stored.certificate.escrito.sha256).toBe(cert.escrito.sha256);
      expect(brief.updatedAt).not.toBe(UPDATED_AT);
    });

    it("runs the engine with the stored as_of", async () => {
      await asLawyer(() => emitCommitment.run({ briefId: "b1" }, CTX));
      expect(holder.runConstancia).toHaveBeenCalledWith(BODY, {
        emitCommitment: true,
        asOf: "2026-10-31",
      });
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
    });

    it("rejects a pack_hash mismatch and persists nothing", async () => {
      holder.runConstancia.mockResolvedValue(
        engine({ pack_hash: "OTHER_PACK" }),
      );
      await expect(
        asLawyer(() => emitCommitment.run({ briefId: "b1" }, CTX)),
      ).rejects.toMatchObject({
        statusCode: 409,
        errorCode: "commitment_mismatch",
      });
      expect((await row()).commitmentJson).toBeNull();
    });

    it("rejects an as_of mismatch and persists nothing", async () => {
      holder.runConstancia.mockResolvedValue(
        engine({ as_of: "2026-10-01" }),
      );
      await expect(
        asLawyer(() => emitCommitment.run({ briefId: "b1" }, CTX)),
      ).rejects.toMatchObject({
        statusCode: 409,
        errorCode: "commitment_mismatch",
      });
      expect((await row()).commitmentJson).toBeNull();
    });

    it("rejects a citation-status mismatch and persists nothing", async () => {
      holder.runConstancia.mockResolvedValue(
        engine({ detalles: [detail(RAW_OK, "FALLO", "UNRESOLVABLE")] }),
      );
      await expect(
        asLawyer(() => emitCommitment.run({ briefId: "b1" }, CTX)),
      ).rejects.toMatchObject({
        statusCode: 409,
        errorCode: "commitment_mismatch",
      });
      expect((await row()).commitmentJson).toBeNull();
    });

    it("rejects a citation list of a different length", async () => {
      holder.runConstancia.mockResolvedValue(
        engine({
          detalles: [
            detail(RAW_OK, "VERIFICADA"),
            detail(RAW_BAD, "VERIFICADA"),
          ],
        }),
      );
      await expect(
        asLawyer(() => emitCommitment.run({ briefId: "b1" }, CTX)),
      ).rejects.toMatchObject({ errorCode: "commitment_mismatch" });
    });

    it("fails when the seal covers a different commitment hash", async () => {
      const commitment = { citas: [] };
      holder.runConstancia.mockResolvedValue(
        engine({
          commitment,
          signature: { commitment_hash: "0".repeat(64) },
        }),
      );
      await expect(
        asLawyer(() => emitCommitment.run({ briefId: "b1" }, CTX)),
      ).rejects.toMatchObject({
        statusCode: 502,
        errorCode: "commitment_hash_mismatch",
      });
      const brief = await row();
      expect(brief.commitmentJson).toBeNull();
      expect(brief.updatedAt).toBe(UPDATED_AT);
    });

    it("accepts a seal whose commitment_hash matches", async () => {
      const commitment = { citas: [] };
      const signature = { commitment_hash: commitmentHash(commitment) };
      holder.runConstancia.mockResolvedValue(
        engine({ commitment, signature }),
      );
      const result = await asLawyer(() =>
        emitCommitment.run({ briefId: "b1" }, CTX),
      );
      expect(result.signed).toBe(true);
      expect(result.certificate!.sellado).toBe(true);
      expect(result.certificate!.commitment_hash).toBe(
        signature.commitment_hash,
      );
    });
  });

  describe("not fully verified (partial, D2)", () => {
    beforeEach(async () => {
      await seed("CON_PROBLEMAS", [
        { id: "c1", raw: RAW_OK, status: "verified" },
        { id: "c2", raw: RAW_BAD, status: "refused" },
        { id: "c3", raw: RAW_AMB, status: "ambiguous" },
      ]);
      holder.runConstancia.mockResolvedValue(
        engine({
          veredicto: "CON_PROBLEMAS",
          detalles: [
            detail(RAW_OK, "VERIFICADA"),
            detail(RAW_BAD, "FALLO", "UNRESOLVABLE"),
            detail(RAW_AMB, "FALLO", "AMBIGUA"),
          ],
        }),
      );
    });

    it("rejects emission without the lawyer's confirmation", async () => {
      await expect(
        asLawyer(() => emitCommitment.run({ briefId: "b1" }, CTX)),
      ).rejects.toMatchObject({
        statusCode: 409,
        errorCode: "partial_needs_confirmation",
      });
      expect(holder.runConstancia).not.toHaveBeenCalled();
      expect((await row()).commitmentJson).toBeNull();
    });

    it("rejects a confirmation that does not come from the UI", async () => {
      await expect(
        asLawyer(() =>
          emitCommitment.run(
            { briefId: "b1", confirmPartial: true },
            AGENT_CTX,
          ),
        ),
      ).rejects.toMatchObject({
        statusCode: 403,
        errorCode: "partial_confirmation_ui_only",
      });
      expect(holder.runConstancia).not.toHaveBeenCalled();
    });

    it("emits a partial certificate listing every citation when the lawyer confirms", async () => {
      const result = await asLawyer(() =>
        emitCommitment.run({ briefId: "b1", confirmPartial: true }, CTX),
      );
      expect(result.partial).toBe(true);
      const cert = result.certificate!;
      expect(cert.parcial).toBe(true);
      expect(cert.emision_parcial_confirmada).toBe(true);
      expect(cert.totales).toEqual({
        detectadas: 3,
        verificadas: 1,
        no_verificadas: 2,
      });
      expect(cert.citas.map((c) => [c.posicion, c.estado, c.estado_legible]))
        .toEqual([
          [1, "verified", "Existe y está vigente"],
          [2, "refused", "No se pudo verificar"],
          [3, "ambiguous", "Ambigua"],
        ]);
      const decisions = (
        await db.select().from(schema.reviewItems)
      ).filter((r) => r.kind === "decision");
      expect(decisions).toHaveLength(1);
      expect(decisions[0]).toMatchObject({
        citationId: null,
        author: "user",
        body: "Emisión parcial confirmada: 2 de 3 citas detectadas no están verificadas.",
      });
    });
  });

  describe("unverified state", () => {
    it("rejects when a citation is stale", async () => {
      await seed("CON_PROBLEMAS", [
        { id: "c1", raw: RAW_OK, status: "verified" },
        { id: "c2", raw: RAW_BAD, status: "stale" },
      ]);
      await expect(
        asLawyer(() =>
          emitCommitment.run({ briefId: "b1", confirmPartial: true }, CTX),
        ),
      ).rejects.toMatchObject({
        statusCode: 409,
        errorCode: "not_verified",
      });
      expect(holder.runConstancia).not.toHaveBeenCalled();
    });

    it("rejects when the brief was never verified", async () => {
      await holder.db!.insert(schema.briefs).values({
        id: "b2",
        title: "Sin verificar",
        body: BODY,
        ownerEmail: LAWYER,
      });
      await expect(
        asLawyer(() => emitCommitment.run({ briefId: "b2" }, CTX)),
      ).rejects.toMatchObject({
        statusCode: 409,
        errorCode: "not_verified",
      });
      expect(holder.runConstancia).not.toHaveBeenCalled();
    });
  });

  describe("get-brief certificateCheck", () => {
    it("matches the stored body and flips when the body changes underneath", async () => {
      await seed("TODAS_VERIFICADAS", [
        { id: "c1", raw: RAW_OK, status: "verified" },
      ]);
      holder.runConstancia.mockResolvedValue(engine({}));
      await asLawyer(() => emitCommitment.run({ briefId: "b1" }, CTX));

      const read = () =>
        asLawyer(() => getBrief.run({ briefId: "b1" }, CTX));
      const fresh = await read();
      expect(fresh.brief.commitment!.certificate).toMatchObject({
        schema_version: "dike-desk-certificado-v1",
      });
      expect(fresh.brief.certificateCheck).toEqual({ textMatches: true });

      await db
        .update(schema.briefs)
        .set({ body: "texto cambiado sin pasar por update-brief" })
        .where(eq(schema.briefs.id, "b1"));
      const after = await read();
      expect(after.brief.certificateCheck).toEqual({ textMatches: false });
    });

    it("is null for a brief without a certificate", async () => {
      await seed("TODAS_VERIFICADAS", [
        { id: "c1", raw: RAW_OK, status: "verified" },
      ]);
      const result = await asLawyer(() =>
        getBrief.run({ briefId: "b1" }, CTX),
      );
      expect(result.brief.certificateCheck).toBeNull();
    });
  });
});

