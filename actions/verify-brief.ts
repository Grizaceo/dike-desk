import { defineAction } from "@agent-native/core/action";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { isoNow } from "../server/db/timestamps.js";
import { parseAsOf } from "../server/lib/as-of.js";
import {
  assertBriefSnapshot,
  lockBrief,
  nextBriefUpdatedAt,
} from "../server/lib/brief-write.js";
import { requireBrief, requireUser } from "../server/lib/briefs.js";
import type { AsOfOrigen } from "../server/lib/certificate.js";
import { locate, runConstancia, statusFor } from "../server/lib/dike.js";

// Who chose the reference date: the lawyer in the UI, the agent on their
// behalf, or the engine's own "today" when nobody chose.
function storedAsOfChoice(
  meta: string | null,
): { asOf: string; source: "abogado" | "agente" } | undefined {
  if (!meta) return undefined;
  try {
    const parsed = JSON.parse(meta) as {
      as_of?: unknown;
      as_of_source?: unknown;
    };
    const source = parsed.as_of_source;
    if (
      (source === "abogado" || source === "agente") &&
      typeof parsed.as_of === "string"
    )
      return { asOf: parsed.as_of, source };
  } catch {
    // A stored meta we cannot read behaves as "no chosen date".
  }
  return undefined;
}

export default defineAction({
  description:
    "Run the Diké engine on the brief's current text and replace its citation list with the engine's verdicts. Diké verifies identity, text integrity and that the provision was in force on the reference date; it does NOT certify that the provision supports the argument. Report refused and ambiguous citations with the engine's reason; never call them verified.",
  schema: z.object({
    briefId: z.string().describe("Brief id"),
    asOf: z
      .string()
      .optional()
      .describe(
        "Reference date for vigencia (AAAA-MM-DD), e.g. the date of the facts. Omit to keep the date chosen before, or to let the engine use today.",
      ),
  }),
  run: async ({ briefId, asOf }, ctx) => {
    const ownerEmail = requireUser(ctx);
    const brief = await requireBrief(briefId, "editor");
    const snapshot = { updatedAt: brief.updatedAt, body: brief.body };
    let engineAsOf: string | undefined;
    let asOfSource: AsOfOrigen;
    if (asOf !== undefined) {
      engineAsOf = parseAsOf(asOf);
      asOfSource = ctx?.caller === "frontend" ? "abogado" : "agente";
    } else {
      const stored = storedAsOfChoice(brief.verificationMeta);
      engineAsOf = stored?.asOf;
      asOfSource = stored?.source ?? "motor (fecha de hoy)";
    }
    const { result } = await runConstancia(brief.body, { asOf: engineAsOf });

    const rows = await getDb().transaction(async (tx) => {
      const locked = await lockBrief(tx, briefId, "editor");
      assertBriefSnapshot(locked, snapshot);
      const now = isoNow();
      const existing = await tx
        .select({
          id: schema.citations.id,
          raw: schema.citations.raw,
        })
        .from(schema.citations)
        .where(eq(schema.citations.briefId, briefId))
        .orderBy(asc(schema.citations.position));
      const previousIds = new Map<string, string>();
      const seen = new Map<string, number>();
      for (const row of existing) {
        const occurrence = seen.get(row.raw) ?? 0;
        seen.set(row.raw, occurrence + 1);
        previousIds.set(`${occurrence}\0${row.raw}`, row.id);
      }
      const spans = locate(
        locked.body,
        result.detalles.map((d) => d.cita_raw),
      );
      const nextSeen = new Map<string, number>();
      const rows = result.detalles.map((detail, index) => {
        const occurrence = nextSeen.get(detail.cita_raw) ?? 0;
        nextSeen.set(detail.cita_raw, occurrence + 1);
        return {
          id:
            previousIds.get(`${occurrence}\0${detail.cita_raw}`) ??
            crypto.randomUUID(),
          briefId,
          position: index,
          raw: detail.cita_raw,
          start: spans[index]?.start ?? -1,
          end: spans[index]?.end ?? -1,
          status: statusFor(detail),
          resolution: detail.resolucion || null,
          gid: detail.gid || null,
          vigencia: detail.vigencia ?? null,
          historicalTextState: detail.estado_texto_historico ?? null,
          label: detail.cuerpo ?? null,
          textSha256: detail.texto_hash ?? null,
          sourceUrl: detail.fuente_url || null,
          retrievedAt: detail.fecha_recuperacion || null,
          ownerEmail: locked.ownerEmail,
          orgId: locked.orgId,
          createdAt: now,
        };
      });
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
            as_of_source: asOfSource,
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
        body: `Diké: ${result.meta.citas_verificadas} de ${result.meta.total_citas} citas detectadas existen y están vigentes al ${result.meta.as_of} (corpus ${result.meta.pack_hash}).`,
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
      asOfSource,
    };
  },
});
