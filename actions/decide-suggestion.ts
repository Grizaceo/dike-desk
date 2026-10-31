import { defineAction, fail } from "@agent-native/core/action";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { lockBrief, nextBriefUpdatedAt } from "../server/lib/brief-write.js";
import { requireUser } from "../server/lib/briefs.js";

// Human gate: only the lawyer, from the app UI, accepts or rejects a proposal.
// The agent proposes (propose-fix); it never decides its own suggestions.
export default defineAction({
  description:
    "Accept or reject a pending suggestion. Accepting replaces the citation text in the brief and marks the verification stale.",
  schema: z.object({
    suggestionId: z.string().describe("Review item id of the suggestion"),
    decision: z.enum(["accepted", "rejected"]),
    note: z.string().max(2000).optional().describe("Optional reason"),
  }),
  uiOnly: true,
  run: async ({ suggestionId, decision, note }, ctx) => {
    const ownerEmail = requireUser(ctx);
    const { reviewItems, citations, briefs } = schema;
    const [found] = await getDb()
      .select({ briefId: reviewItems.briefId })
      .from(reviewItems)
      .where(
        and(
          eq(reviewItems.id, suggestionId),
          eq(reviewItems.kind, "suggestion"),
        ),
      )
      .limit(1);
    if (!found)
      fail("Suggestion not found.", {
        errorCode: "not_found",
        statusCode: 404,
      });

    await getDb().transaction(async (tx) => {
      const brief = await lockBrief(tx, found.briefId, "editor");
      const [item] = await tx
        .select()
        .from(reviewItems)
        .where(
          and(
            eq(reviewItems.id, suggestionId),
            eq(reviewItems.kind, "suggestion"),
            eq(reviewItems.briefId, brief.id),
          ),
        )
        .limit(1);
      if (!item)
        fail("Suggestion not found.", {
          errorCode: "not_found",
          statusCode: 404,
        });
      if (item.state !== "pending")
        fail(`Suggestion is already ${item.state}.`, {
          errorCode: "already_decided",
          statusCode: 409,
        });

      const now = new Date().toISOString();
      let body = brief.body;
      if (decision === "accepted") {
        const [citation] = await tx
          .select()
          .from(citations)
          .where(
            and(
              eq(citations.id, item.citationId ?? ""),
              eq(citations.briefId, brief.id),
            ),
          )
          .limit(1);
        if (
          !citation ||
          citation.status === "stale" ||
          citation.start < 0 ||
          body.slice(citation.start, citation.end) !== citation.raw
        ) {
          fail("The brief changed under this suggestion. Verify again.", {
            errorCode: "stale_citation",
            statusCode: 409,
          });
        }
        body =
          body.slice(0, citation.start) +
          (item.replacement ?? "") +
          body.slice(citation.end);
      }

      const decided = await tx
        .update(reviewItems)
        .set({ state: decision, decidedAt: now })
        .where(
          and(
            eq(reviewItems.id, suggestionId),
            eq(reviewItems.state, "pending"),
          ),
        )
        .returning({ id: reviewItems.id });
      if (!decided.length)
        fail("Suggestion is already decided.", {
          errorCode: "already_decided",
          statusCode: 409,
        });
      await tx.insert(reviewItems).values({
        id: crypto.randomUUID(),
        briefId: item.briefId,
        citationId: item.citationId,
        kind: "decision",
        author: "user",
        body: note?.trim() || decision,
        ownerEmail,
        orgId: brief.orgId,
      });
      if (decision === "accepted") {
        await tx
          .update(briefs)
          .set({
            body,
            verdict: null,
            verificationMeta: null,
            commitmentJson: null,
            updatedAt: nextBriefUpdatedAt(brief.updatedAt),
          })
          .where(eq(briefs.id, item.briefId));
        await tx
          .update(citations)
          .set({ status: "stale" })
          .where(eq(citations.briefId, item.briefId));
        await tx
          .update(reviewItems)
          .set({ state: "expired", decidedAt: now })
          .where(
            and(
              eq(reviewItems.briefId, item.briefId),
              eq(reviewItems.state, "pending"),
            ),
          );
      }
    });
    return { id: suggestionId, state: decision };
  },
});
