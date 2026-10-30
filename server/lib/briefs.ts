import { fail } from "@agent-native/core/action";
import { accessFilter } from "@agent-native/core/sharing";
import { and, eq } from "drizzle-orm";

import { getDb, schema } from "../db/index.js";

/** Load a brief the caller can see, or fail with 404. */
export async function requireBrief(briefId: string) {
  const { briefs, briefShares } = schema;
  const [brief] = await getDb()
    .select()
    .from(briefs)
    .where(and(eq(briefs.id, briefId), accessFilter(briefs, briefShares)))
    .limit(1);
  if (!brief)
    fail("Brief not found.", { errorCode: "not_found", statusCode: 404 });
  return brief;
}

export function requireUser(ctx: { userEmail?: string } | undefined) {
  return ctx?.userEmail ?? fail("Sign in first.", { statusCode: 401 });
}
