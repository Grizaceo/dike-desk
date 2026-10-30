import { defineAction, fail } from "@agent-native/core/action";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { requireBrief } from "../server/lib/briefs.js";

export default defineAction({
  description:
    "Edit a brief's title or text. Changing the text marks every citation stale and clears the verdict: run verify-brief again before trusting any status.",
  schema: z.object({
    briefId: z.string().describe("Brief id"),
    title: z.string().min(1).max(200).optional(),
    body: z.string().max(400_000).optional(),
  }),
  mcpAnnotations: {
    readOnlyHint: false,
    destructiveHint: true,
    openWorldHint: false,
  },
  run: async ({ briefId, title, body }) => {
    if (title === undefined && body === undefined)
      fail("Nothing to update.", { errorCode: "empty_update" });
    const brief = await requireBrief(briefId);
    const bodyChanged = body !== undefined && body !== brief.body;
    const now = new Date().toISOString();
    await getDb().transaction(async (tx) => {
      await tx
        .update(schema.briefs)
        .set({
          ...(title !== undefined ? { title } : {}),
          ...(bodyChanged
            ? { body, verdict: null, commitmentJson: null }
            : {}),
          updatedAt: now,
        })
        .where(eq(schema.briefs.id, briefId));
      if (bodyChanged) {
        await tx
          .update(schema.citations)
          .set({ status: "stale" })
          .where(eq(schema.citations.briefId, briefId));
        await tx
          .update(schema.reviewItems)
          .set({ state: "expired", decidedAt: now })
          .where(
            and(
              eq(schema.reviewItems.briefId, briefId),
              eq(schema.reviewItems.state, "pending"),
            ),
          );
      }
    });
    return { id: briefId, stale: bodyChanged };
  },
});
