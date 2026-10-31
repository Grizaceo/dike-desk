import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { emitCertificate } from "../server/lib/emit-certificate.js";

// Proven-UI only: confirming a partial certificate is the lawyer's on-screen
// decision. The ledger row is written only when the verdict really is
// partial; a fully verified brief emits normally instead.
export default defineAction({
  description:
    "Issue the verification certificate for the current brief text, allowing a partial certificate. UI only — the lawyer's confirmation of a partial emission.",
  uiOnly: true,
  schema: z.object({
    briefId: z.string().describe("Brief id"),
    expectedUpdatedAt: z
      .string()
      .describe(
        "The brief.updatedAt the UI showed when the lawyer confirmed; a stale revision gets 409 brief_changed.",
      ),
  }),
  run: async ({ briefId, expectedUpdatedAt }, ctx) =>
    emitCertificate(briefId, { partialConfirmed: true, expectedUpdatedAt }, ctx),
});
