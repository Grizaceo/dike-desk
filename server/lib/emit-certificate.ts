import { fail } from "@agent-native/core/action";
import { asc, eq } from "drizzle-orm";

import { getDb, schema } from "../db/index.js";
import { isoNow } from "../db/timestamps.js";
import { commitmentHash } from "./brief-hash.js";
import {
  assertBriefSnapshot,
  lockBrief,
  nextBriefUpdatedAt,
} from "./brief-write.js";
import { requireBrief, requireUser } from "./briefs.js";
import {
  buildCertificate,
  type AsOfOrigen,
  type VerificationCertificate,
} from "./certificate.js";
import { runConstancia, statusFor } from "./dike.js";

type ActionCtx = Parameters<typeof requireUser>[0];

function storedMeta(meta: string | null) {
  if (!meta) return undefined;
  try {
    const parsed = JSON.parse(meta) as {
      pack_hash?: unknown;
      as_of?: unknown;
      as_of_source?: unknown;
    };
    return {
      packHash:
        typeof parsed.pack_hash === "string" ? parsed.pack_hash : undefined,
      asOf: typeof parsed.as_of === "string" ? parsed.as_of : undefined,
      asOfSource: (parsed.as_of_source === "abogado" ||
      parsed.as_of_source === "agente"
        ? parsed.as_of_source
        : "motor (fecha de hoy)") as AsOfOrigen,
    };
  } catch {
    return undefined;
  }
}

function signatureHash(signature: unknown) {
  return typeof signature === "object" &&
    signature !== null &&
    "commitment_hash" in signature
    ? (signature as { commitment_hash?: unknown }).commitment_hash
    : undefined;
}

// Emission gate, run before the engine and again inside the lock: unverified
// work can never be certified, SIN_CITAS has nothing to certify, and a
// partial certificate needs the lawyer's proven UI confirmation.
function assertEmissionAllowed(
  brief: { verdict: string | null },
  citations: { status: string }[],
  partialConfirmed: boolean,
) {
  if (!brief.verdict || citations.some((c) => c.status === "stale"))
    fail("Verifica el texto actual antes de emitir el certificado.", {
      errorCode: "not_verified",
      statusCode: 409,
    });
  if (brief.verdict === "SIN_CITAS")
    fail("Diké no detectó citas: no hay nada que certificar.", {
      errorCode: "no_citations",
      statusCode: 409,
    });
  if (brief.verdict !== "TODAS_VERIFICADAS" && !partialConfirmed)
    fail(
      "Hay citas sin verificar: pide al abogado que confirme la emisión parcial en la pantalla.",
      { errorCode: "partial_needs_confirmation", statusCode: 409 },
    );
}

/**
 * The shared emission path for emit-commitment (agent-facing, never partial)
 * and emit-partial-certificate (uiOnly, partialConfirmed always true).
 */
export async function emitCertificate(
  briefId: string,
  { partialConfirmed }: { partialConfirmed: boolean },
  ctx: ActionCtx,
) {
  const ownerEmail = requireUser(ctx);
  const brief = await requireBrief(briefId, "editor");
  const preCitations = await getDb()
    .select({ status: schema.citations.status })
    .from(schema.citations)
    .where(eq(schema.citations.briefId, briefId));
  assertEmissionAllowed(brief, preCitations, partialConfirmed);
  const meta = storedMeta(brief.verificationMeta);
  const snapshot = { updatedAt: brief.updatedAt, body: brief.body };
  const { result, commitment, signature, pubkey } = await runConstancia(
    brief.body,
    { emitCommitment: true, asOf: meta?.asOf },
  );
  if (!commitment)
    fail("El motor no emitió el certificado para este escrito.", {
      errorCode: "commitment_not_emitted",
      statusCode: 502,
    });
  const hash = commitmentHash(commitment);
  let certificate: VerificationCertificate | undefined;
  await getDb().transaction(async (tx) => {
    const locked = await lockBrief(tx, briefId, "editor");
    assertBriefSnapshot(locked, snapshot);
    const storedCitations = await tx
      .select()
      .from(schema.citations)
      .where(eq(schema.citations.briefId, briefId))
      .orderBy(asc(schema.citations.position));
    assertEmissionAllowed(locked, storedCitations, partialConfirmed);
    const lockedMeta = storedMeta(locked.verificationMeta);
    if (
      result.veredicto !== locked.verdict ||
      result.meta.pack_hash !== lockedMeta?.packHash ||
      result.meta.as_of !== lockedMeta?.asOf ||
      result.detalles.length !== storedCitations.length ||
      result.detalles.some(
        (detail, index) =>
          detail.cita_raw !== storedCitations[index]!.raw ||
          statusFor(detail) !== storedCitations[index]!.status,
      )
    ) {
      fail(
        "El resultado del motor no coincide con la verificación guardada. Verifica de nuevo antes de emitir.",
        { errorCode: "commitment_mismatch", statusCode: 409 },
      );
    }
    if (signature && signatureHash(signature) !== hash) {
      fail(
        "La huella del commitment no coincide con la del sello. No se guardó el certificado.",
        { errorCode: "commitment_hash_mismatch", statusCode: 502 },
      );
    }
    const partial = locked.verdict !== "TODAS_VERIFICADAS";
    const now = isoNow();
    if (partialConfirmed && partial) {
      const noVerificadas = storedCitations.filter(
        (c) => c.status !== "verified",
      ).length;
      await tx.insert(schema.reviewItems).values({
        id: crypto.randomUUID(),
        briefId,
        citationId: null,
        kind: "decision",
        author: "user",
        body: `Emisión parcial confirmada: ${noVerificadas} de ${storedCitations.length} citas detectadas no están verificadas.`,
        ownerEmail,
        orgId: locked.orgId,
        createdAt: now,
      });
    }
    certificate = buildCertificate({
      titulo: locked.title,
      body: locked.body,
      commitment,
      commitment_sellado: Boolean(signature),
      packHash: result.meta.pack_hash,
      asOf: result.meta.as_of,
      asOfOrigen: lockedMeta?.asOfSource ?? "motor (fecha de hoy)",
      parcial: partial,
      emisionParcialConfirmada: partial && partialConfirmed,
      citas: storedCitations,
    });
    await tx
      .update(schema.briefs)
      .set({
        commitmentJson: JSON.stringify({
          commitment,
          signature,
          pubkey,
          certificate,
        }),
        updatedAt: nextBriefUpdatedAt(locked.updatedAt),
      })
      .where(eq(schema.briefs.id, briefId));
  });
  return {
    verdict: result.veredicto,
    signed: Boolean(signature),
    partial: result.veredicto !== "TODAS_VERIFICADAS",
    commitment,
    signature,
    pubkey,
    certificate,
  };
}
