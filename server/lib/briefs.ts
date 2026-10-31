import { fail, type ActionRunContext } from "@agent-native/core/action";
import { accessFilter } from "@agent-native/core/sharing";
import { and, eq } from "drizzle-orm";

import { getDb, schema } from "../db/index.js";

export type BriefRole = "viewer" | "commenter" | "editor";

/** Load a brief the caller holds at least `minRole` on, or fail with 404. */
export async function requireBrief(
  briefId: string,
  minRole: BriefRole = "viewer",
) {
  const { briefs, briefShares } = schema;
  const [brief] = await getDb()
    .select()
    .from(briefs)
    .where(
      and(
        eq(briefs.id, briefId),
        accessFilter(briefs, briefShares, undefined, minRole),
      ),
    )
    .limit(1);
  if (!brief)
    fail("Brief not found.", { errorCode: "not_found", statusCode: 404 });
  return brief;
}

export function requireUser(ctx: { userEmail?: string } | undefined) {
  return ctx?.userEmail ?? fail("Sign in first.", { statusCode: 401 });
}

// Comment author comes from who calls, never from the arguments: the app UI
// posts as the lawyer; every other caller (agent loop, mcp, a2a, cli, http,
// automation) is the agent. Fail-safe is "agent" so a tool can never speak as
// the lawyer.
export function commentAuthor(ctx?: Pick<ActionRunContext, "caller">) {
  return ctx?.caller === "frontend" ? ("user" as const) : ("agent" as const);
}
