import { defineAction, fail } from "@agent-native/core/action";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { isoNow } from "../server/db/timestamps.js";
import {
  assertBriefRevision,
  lockBrief,
  nextBriefUpdatedAt,
} from "../server/lib/brief-write.js";

export default defineAction({
  description:
    "Edit a brief's title or text. Changing the text marks every citation stale and clears the verdict: run verify-brief again before trusting any status.",
  schema: z.object({
    briefId: z.string().describe("Brief id"),
    expectedUpdatedAt: z
      .string()
      .describe("The brief's updatedAt (from get-brief) when editing started"),
    title: z.string().min(1).max(200).optional(),
    body: z.string().max(400_000).optional(),
  }),
  uiOnly: true,
  mcpAnnotations: {
    readOnlyHint: false,
    destructiveHint: true,
    openWorldHint: false,
  },
  run: async ({ briefId, expectedUpdatedAt, title, body }) => {
    if (title === undefined && body === undefined)
      fail("No hay cambios que guardar.", { errorCode: "empty_update" });
    const bodyChanged = await getDb().transaction(async (tx) => {
      const brief = await lockBrief(tx, briefId, "editor");
      assertBriefRevision(brief.updatedAt, expectedUpdatedAt);
      const changed = body !== undefined && body !== brief.body;
      const now = isoNow();
      await tx
        .update(schema.briefs)
        .set({
          ...(title !== undefined ? { title } : {}),
          ...(changed
            ? {
                body,
                verdict: null,
                verificationMeta: null,
                commitmentJson: null,
              }
            : {}),
          updatedAt: nextBriefUpdatedAt(brief.updatedAt),
        })
        .where(eq(schema.briefs.id, briefId));
      if (changed) {
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
      return changed;
    });
    return { id: briefId, stale: bodyChanged };
  },
});
