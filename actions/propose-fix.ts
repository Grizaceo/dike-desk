import { defineAction, fail } from "@agent-native/core/action";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { requireBrief, requireUser } from "../server/lib/briefs.js";

export default defineAction({
  description:
    "Propose replacing one citation's exact text (e.g. 'artículo 60' -> 'artículo 60 del Código del Trabajo', or withdrawing it). Creates a pending suggestion the lawyer accepts or rejects in the UI; it does not change the brief. After acceptance, run verify-brief: a proposal is never evidence that the new citation exists.",
  schema: z.object({
    briefId: z.string().describe("Brief id"),
    citationId: z.string().describe("Citation id from get-brief"),
    replacement: z
      .string()
      .max(2000)
      .describe("Exact text to put where the citation is; empty to withdraw it"),
    rationale: z
      .string()
      .min(1)
      .max(2000)
      .describe("Why, in one or two sentences the lawyer can check"),
  }),
  run: async (args, ctx) => {
    const ownerEmail = requireUser(ctx);
    const brief = await requireBrief(args.briefId);
    const [citation] = await getDb()
      .select({ id: schema.citations.id, status: schema.citations.status })
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
    if (citation.status === "stale")
      fail("The brief changed since verification. Run verify-brief first.", {
        errorCode: "stale_citation",
        statusCode: 409,
      });

    const item = {
      id: crypto.randomUUID(),
      briefId: args.briefId,
      citationId: args.citationId,
      kind: "suggestion" as const,
      author: "agent" as const,
      body: args.rationale,
      replacement: args.replacement,
      state: "pending" as const,
      ownerEmail,
      orgId: brief.orgId,
    };
    await getDb().insert(schema.reviewItems).values(item);
    return { id: item.id, state: item.state };
  },
});
