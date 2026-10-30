import { defineAction, fail } from "@agent-native/core/action";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { commentAuthor, requireBrief, requireUser } from "../server/lib/briefs.js";

export default defineAction({
  description:
    "Leave a comment on a brief, optionally anchored to one citation. Lawyers use it to tell the agent what to do next; the agent answers the same way. The author is recorded from who calls: the app UI posts as the lawyer, anything else as the agent.",
  schema: z.object({
    briefId: z.string().describe("Brief id"),
    citationId: z.string().optional().describe("Citation the comment is about"),
    body: z.string().min(1).max(4000),
  }),
  run: async (args, ctx) => {
    const ownerEmail = requireUser(ctx);
    const brief = await requireBrief(args.briefId);
    if (args.citationId) {
      const [citation] = await getDb()
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
    await getDb().insert(schema.reviewItems).values(item);
    return { id: item.id };
  },
});
