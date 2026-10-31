import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { emitCertificate } from "../server/lib/emit-certificate.js";

export default defineAction({
  description:
    "Ask the Diké engine to emit a verification certificate for the brief's current text. Blocked while any citation is not verified (verify again) or none were detected. When the verdict is not TODAS_VERIFICADAS the certificate would be partial: you cannot confirm that — ask the lawyer to confirm it on screen with «Emitir certificado parcial», and never describe a partial certificate as clean. The certificate lists every detected citation with its status, names the corpus by pack_hash and the reference date, carries the brief's fingerprint, and is sealed only if the operator configured a content key. It does not certify the legal argument.",
  schema: z.object({
    briefId: z.string().describe("Brief id"),
  }),
  run: async ({ briefId }, ctx) =>
    emitCertificate(briefId, { partialConfirmed: false }, ctx),
});
