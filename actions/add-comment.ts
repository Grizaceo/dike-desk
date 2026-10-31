import { defineAction, fail } from "@agent-native/core/action";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { lockBrief } from "../server/lib/brief-write.js";
import { commentAuthor, requireUser } from "../server/lib/briefs.js";

export default defineAction({
  description:
    "Leave a comment on a brief, optionally anchored to one citation. Lawyers use it to tell the agent what to do next; the agent answers the same way. The author is recorded from who calls: the app UI posts as the lawyer, anything else as the agent.",
  schema: z.object({
    briefId: z.string().describe("Brief id"),
    citationId: z.string().optional().describe("Citation the comment is about"),
    body: z.string().min(1).max(4000),
  }),
  // The core HTTP route evaluates this with caller "http" for any request that
  // only claims to be the app UI (it downgrades unproven "frontend"); requests
  // proven to come from the signed-in UI skip the gate and run as "frontend".
  // So only the UI posts as the lawyer; plain HTTP needs approval.
  needsApproval: (_args, ctx) => ctx?.caller === "http",
  run: async (args, ctx) => {
    const ownerEmail = requireUser(ctx);
    const id = await getDb().transaction(async (tx) => {
      const brief = await lockBrief(tx, args.briefId, "commenter");
      if (args.citationId) {
        const [citation] = await tx
          .select({ id: schema.citations.id })
          .from(schema.citations)
          .where(
            and(
              eq(schema.citations.id, args.citationId),
              eq(schema.citations.briefId, args.briefId),
            ),
          )
          .limit(1);
        if (!citation)
          fail("Citation not found in this brief.", {
            errorCode: "not_found",
            statusCode: 404,
          });
      }
      const item = {
        id: crypto.randomUUID(),
        briefId: args.briefId,
        citationId: args.citationId ?? null,
        kind: "comment" as const,
        author: commentAuthor(ctx),
        body: args.body,
        ownerEmail,
        orgId: brief.orgId,
      };
      await tx.insert(schema.reviewItems).values(item);
      return item.id;
    });
    return { id };
  },
});
