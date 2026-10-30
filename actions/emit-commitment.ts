import { defineAction, fail } from "@agent-native/core/action";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { requireBrief } from "../server/lib/briefs.js";
import { runConstancia } from "../server/lib/dike.js";

export default defineAction({
  description:
    "Ask the Diké engine to emit a commitment for the brief's current text. The commitment lists only the citations the engine verified, names the corpus by pack_hash, and is signed only if the operator configured a content key. It does not certify the legal argument.",
  schema: z.object({
    briefId: z.string().describe("Brief id"),
  }),
  run: async ({ briefId }) => {
    const brief = await requireBrief(briefId);
    if (!brief.verdict)
      fail("Verify the current text before emitting a commitment.", {
        errorCode: "not_verified",
        statusCode: 409,
      });
    const { result, commitment, signature, pubkey } = await runConstancia(brief.body, {
      emitCommitment: true,
    });
    if (!commitment)
      fail("The engine did not emit a commitment for this brief.", {
        errorCode: "commitment_not_emitted",
        statusCode: 502,
      });
    await getDb()
      .update(schema.briefs)
      .set({
        commitmentJson: JSON.stringify({ commitment, signature, pubkey }),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(schema.briefs.id, briefId));
    return {
      verdict: result.veredicto,
      signed: Boolean(signature),
      commitment,
      signature,
      pubkey,
    };
  },
});
