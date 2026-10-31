import { defineAction, fail } from "@agent-native/core/action";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import {
  assertBriefSnapshot,
  lockBrief,
  nextBriefUpdatedAt,
} from "../server/lib/brief-write.js";
import { requireBrief } from "../server/lib/briefs.js";
import { runConstancia } from "../server/lib/dike.js";

function storedPackHash(meta: string | null) {
  if (!meta) return undefined;
  try {
    const parsed = JSON.parse(meta) as { pack_hash?: unknown };
    return typeof parsed.pack_hash === "string" ? parsed.pack_hash : undefined;
  } catch {
    return undefined;
  }
}

export default defineAction({
  description:
    "Ask the Diké engine to emit a commitment for the brief's current text. The commitment lists only the citations the engine verified, names the corpus by pack_hash, and is signed only if the operator configured a content key. It does not certify the legal argument.",
  schema: z.object({
    briefId: z.string().describe("Brief id"),
  }),
  run: async ({ briefId }) => {
    const brief = await requireBrief(briefId, "editor");
    if (!brief.verdict)
      fail("Verify the current text before emitting a commitment.", {
        errorCode: "not_verified",
        statusCode: 409,
      });
    const snapshot = { updatedAt: brief.updatedAt, body: brief.body };
    const { result, commitment, signature, pubkey } = await runConstancia(
      brief.body,
      { emitCommitment: true },
    );
    if (!commitment)
      fail("The engine did not emit a commitment for this brief.", {
        errorCode: "commitment_not_emitted",
        statusCode: 502,
      });
    await getDb().transaction(async (tx) => {
      const locked = await lockBrief(tx, briefId, "editor");
      assertBriefSnapshot(locked, snapshot);
      if (!locked.verdict)
        fail("Verify the current text before emitting a commitment.", {
          errorCode: "not_verified",
          statusCode: 409,
        });
      if (
        result.veredicto !== locked.verdict ||
        result.meta.pack_hash !== storedPackHash(locked.verificationMeta)
      ) {
        fail(
          "The engine result does not match the stored verification. Verify the brief again before emitting a commitment.",
          { errorCode: "commitment_mismatch", statusCode: 409 },
        );
      }
      await tx
        .update(schema.briefs)
        .set({
          commitmentJson: JSON.stringify({ commitment, signature, pubkey }),
          updatedAt: nextBriefUpdatedAt(locked.updatedAt),
        })
        .where(eq(schema.briefs.id, briefId));
    });
    return {
      verdict: result.veredicto,
      signed: Boolean(signature),
      commitment,
      signature,
      pubkey,
    };
  },
});
