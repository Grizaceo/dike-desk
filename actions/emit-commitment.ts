import { defineAction, fail } from "@agent-native/core/action";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { isoNow } from "../server/db/timestamps.js";
import { commitmentHash } from "../server/lib/brief-hash.js";
import {
  assertBriefSnapshot,
  lockBrief,
  nextBriefUpdatedAt,
} from "../server/lib/brief-write.js";
import { requireBrief, requireUser } from "../server/lib/briefs.js";
import {
  buildCertificate,
  type AsOfOrigen,
  type VerificationCertificate,
} from "../server/lib/certificate.js";
import { runConstancia, statusFor } from "../server/lib/dike.js";

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
// work can never be certified, and a partial certificate is a decision only
// the lawyer can make, from the UI.
function assertEmissionAllowed(
  brief: { verdict: string | null },
  citations: { status: string }[],
  confirmPartial: boolean | undefined,
  caller: string | undefined,
) {
  if (!brief.verdict || citations.some((c) => c.status === "stale"))
    fail("Verifica el texto actual antes de emitir el certificado.", {
      errorCode: "not_verified",
      statusCode: 409,
    });
  if (confirmPartial && caller !== "frontend")
    fail("Solo el abogado puede confirmar una emisión parcial, desde la pantalla.", {
      errorCode: "partial_confirmation_ui_only",
      statusCode: 403,
    });
  if (brief.verdict !== "TODAS_VERIFICADAS" && !confirmPartial)
    fail("Hay citas sin verificar: confirma la emisión parcial en la pantalla.", {
      errorCode: "partial_needs_confirmation",
      statusCode: 409,
    });
}

export default defineAction({
  description:
    "Ask the Diké engine to emit a verification certificate for the brief's current text. Blocked while any citation is not verified (verify again); when the verdict is not TODAS_VERIFICADAS the certificate is partial and only the lawyer can confirm it in the UI — the agent must ask them to do it there. The certificate lists every detected citation with its status, names the corpus by pack_hash and the reference date, carries the brief's fingerprint, and is sealed only if the operator configured a content key. It does not certify the legal argument.",
  schema: z.object({
    briefId: z.string().describe("Brief id"),
    confirmPartial: z
      .boolean()
      .optional()
      .describe(
        "Confirms a partial certificate when not every citation is verified. Only the lawyer can confirm, from the UI; the agent must never set this.",
      ),
  }),
  run: async ({ briefId, confirmPartial }, ctx) => {
    const ownerEmail = requireUser(ctx);
    const brief = await requireBrief(briefId, "editor");
    const preCitations = await getDb()
      .select({ status: schema.citations.status })
      .from(schema.citations)
      .where(eq(schema.citations.briefId, briefId));
    assertEmissionAllowed(brief, preCitations, confirmPartial, ctx?.caller);
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
      assertEmissionAllowed(
        locked,
        storedCitations,
        confirmPartial,
        ctx?.caller,
      );
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
      if (confirmPartial) {
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
        sellado: Boolean(signature),
        packHash: result.meta.pack_hash,
        asOf: result.meta.as_of,
        asOfOrigen: lockedMeta?.asOfSource ?? "motor (fecha de hoy)",
        parcial: partial,
        emisionParcialConfirmada: partial && Boolean(confirmPartial),
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
  },
});
