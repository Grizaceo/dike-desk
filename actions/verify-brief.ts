import { defineAction } from "@agent-native/core/action";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { isoNow } from "../server/db/timestamps.js";
import {
  assertBriefSnapshot,
  lockBrief,
  nextBriefUpdatedAt,
} from "../server/lib/brief-write.js";
import { requireBrief, requireUser } from "../server/lib/briefs.js";
import { locate, runConstancia, statusFor } from "../server/lib/dike.js";

export default defineAction({
  description:
    "Run the Diké engine on the brief's current text and replace its citation list with the engine's verdicts. Diké verifies identity, text integrity and that the provision was in force on the reference date; it does NOT certify that the provision supports the argument. Report refused and ambiguous citations with the engine's reason; never call them verified.",
  schema: z.object({
    briefId: z.string().describe("Brief id"),
  }),
  run: async ({ briefId }, ctx) => {
    const ownerEmail = requireUser(ctx);
    const brief = await requireBrief(briefId, "editor");
    const snapshot = { updatedAt: brief.updatedAt, body: brief.body };
    const { result } = await runConstancia(brief.body);

    const rows = await getDb().transaction(async (tx) => {
      const locked = await lockBrief(tx, briefId, "editor");
      assertBriefSnapshot(locked, snapshot);
      const now = isoNow();
      const spans = locate(
        locked.body,
        result.detalles.map((d) => d.cita_raw),
      );
      const rows = result.detalles.map((detail, index) => ({
        id: crypto.randomUUID(),
        briefId,
        position: index,
        raw: detail.cita_raw,
        start: spans[index]?.start ?? -1,
        end: spans[index]?.end ?? -1,
        status: statusFor(detail),
        resolution: detail.resolucion || null,
        gid: detail.gid || null,
        label: detail.cuerpo ?? null,
        textSha256: detail.texto_hash ?? null,
        sourceUrl: detail.fuente_url || null,
        retrievedAt: detail.fecha_recuperacion || null,
        ownerEmail: locked.ownerEmail,
        orgId: locked.orgId,
        createdAt: now,
      }));
      await tx
        .update(schema.reviewItems)
        .set({ state: "expired", decidedAt: now })
        .where(
          and(
            eq(schema.reviewItems.briefId, briefId),
            eq(schema.reviewItems.state, "pending"),
          ),
        );
      await tx
        .delete(schema.citations)
        .where(eq(schema.citations.briefId, briefId));
      if (rows.length) await tx.insert(schema.citations).values(rows);
      await tx
        .update(schema.briefs)
        .set({
          verdict: result.veredicto,
          verificationMeta: JSON.stringify({
            ...result.meta,
            alcance: result.alcance,
            problemas: result.problemas,
          }),
          commitmentJson: null,
          updatedAt: nextBriefUpdatedAt(locked.updatedAt),
        })
        .where(eq(schema.briefs.id, briefId));
      await tx.insert(schema.reviewItems).values({
        id: crypto.randomUUID(),
        briefId,
        kind: "agent_note",
        author: "engine",
        body: `${result.meta.citas_verificadas}/${result.meta.total_citas} citations verified against corpus ${result.meta.pack_hash} (as of ${result.meta.as_of}).`,
        ownerEmail,
        orgId: locked.orgId,
        createdAt: now,
      });
      return rows;
    });
    return {
      verdict: result.veredicto,
      message: result.mensaje,
      scope: result.alcance,
      citations: rows.map((r) => ({
        id: r.id,
        raw: r.raw,
        status: r.status,
        resolution: r.resolution,
        label: r.label,
      })),
      meta: result.meta,
    };
  },
});
