import { defineAction } from "@agent-native/core/action";
import { buildDeepLink } from "@agent-native/core/server";
import { accessFilter } from "@agent-native/core/sharing";
import { desc } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";

export default defineAction({
  description:
    "List the briefs (escritos) the current user can see, newest first, with their last verification verdict.",
  schema: z.object({}),
  http: { method: "GET" },
  readOnly: true,
  link: () => ({
    url: buildDeepLink({ view: "briefs", to: "/briefs" }),
    label: "Open briefs",
  }),
  run: async () => {
    const { briefs, briefShares } = schema;
    const rows = await getDb()
      .select({
        id: briefs.id,
        title: briefs.title,
        verdict: briefs.verdict,
        updatedAt: briefs.updatedAt,
      })
      .from(briefs)
      .where(accessFilter(briefs, briefShares))
      .orderBy(desc(briefs.updatedAt))
      .limit(200);
    return { briefs: rows };
  },
});
