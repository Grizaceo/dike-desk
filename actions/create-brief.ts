import { defineAction } from "@agent-native/core/action";
import { buildDeepLink } from "@agent-native/core/server";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { requireUser } from "../server/lib/briefs.js";
import { DEMO_BRIEF_BODY, DEMO_BRIEF_TITLE } from "../server/lib/demo-brief.js";

export default defineAction({
  description:
    "Create a brief (escrito) from pasted text. Pass demo=true to load the synthetic demo brief (fictitious parties, six citations, two of which must be refused).",
  schema: z.object({
    title: z.string().max(200).optional().describe("Brief title"),
    body: z.string().max(400_000).optional().describe("Brief text"),
    demo: z.boolean().default(false).describe("Load the synthetic demo brief"),
  }),
  link: ({ result }) => ({
    url: buildDeepLink({
      view: "briefs",
      to: `/briefs/${encodeURIComponent(result.id)}`,
      params: { briefId: result.id },
    }),
    label: `Open ${result.title}`,
  }),
  run: async (args, ctx) => {
    const ownerEmail = requireUser(ctx);
    const orgId = ctx?.orgId ?? null;
    const brief = {
      id: crypto.randomUUID(),
      title: args.demo
        ? DEMO_BRIEF_TITLE
        : args.title?.trim() || "Untitled brief",
      body: args.demo ? DEMO_BRIEF_BODY : (args.body ?? ""),
      ownerEmail,
      orgId,
      visibility: orgId ? ("org" as const) : ("private" as const),
    };
    await getDb().insert(schema.briefs).values(brief);
    return { id: brief.id, title: brief.title };
  },
});
