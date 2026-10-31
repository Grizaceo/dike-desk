import { defineAction } from "@agent-native/core/action";
import { buildDeepLink } from "@agent-native/core/server";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { requireBrief } from "../server/lib/briefs.js";

export default defineAction({
  description:
    "Read one brief with its text, the citations from the last Diké verification (status comes only from the engine) and the review ledger (comments, suggestions, decisions).",
  schema: z.object({
    briefId: z.string().describe("Brief id from list-briefs"),
  }),
  http: { method: "GET" },
  readOnly: true,
  link: ({ args }) => ({
    url: buildDeepLink({
      view: "briefs",
      to: `/briefs/${encodeURIComponent(args.briefId)}`,
      params: { briefId: args.briefId },
    }),
    label: "Open brief",
  }),
  run: async ({ briefId }) => {
    const brief = await requireBrief(briefId);
    const { citations, reviewItems } = schema;
    const [citationRows, reviewRows] = await Promise.all([
      getDb()
        .select({
          id: citations.id,
          position: citations.position,
          raw: citations.raw,
          start: citations.start,
          end: citations.end,
          status: citations.status,
          resolution: citations.resolution,
          label: citations.label,
          textSha256: citations.textSha256,
          sourceUrl: citations.sourceUrl,
          retrievedAt: citations.retrievedAt,
        })
        .from(citations)
        .where(eq(citations.briefId, briefId))
        .orderBy(asc(citations.position))
        .limit(500),
      getDb()
        .select({
          id: reviewItems.id,
          citationId: reviewItems.citationId,
          citationRaw: reviewItems.citationRaw,
          kind: reviewItems.kind,
          author: reviewItems.author,
          body: reviewItems.body,
          replacement: reviewItems.replacement,
          state: reviewItems.state,
          createdAt: reviewItems.createdAt,
          decidedAt: reviewItems.decidedAt,
        })
        .from(reviewItems)
        .where(eq(reviewItems.briefId, briefId))
        .orderBy(asc(reviewItems.createdAt))
        .limit(500),
    ]);
    return {
      brief: {
        id: brief.id,
        title: brief.title,
        body: brief.body,
        verdict: brief.verdict,
        meta: brief.verificationMeta ? JSON.parse(brief.verificationMeta) : null,
        hasCommitment: Boolean(brief.commitmentJson),
        commitment: brief.commitmentJson
          ? (JSON.parse(brief.commitmentJson) as {
              commitment: unknown;
              signature: unknown;
              pubkey: string | null;
            })
          : null,
        updatedAt: brief.updatedAt,
      },
      citations: citationRows,
      review: reviewRows,
    };
  },
});
