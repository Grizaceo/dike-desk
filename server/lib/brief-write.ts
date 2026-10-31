import { fail } from "@agent-native/core/action";
import { accessFilter } from "@agent-native/core/sharing";
import { and, eq } from "drizzle-orm";

import { getDb, schema } from "../db/index.js";
import type { BriefRole } from "./briefs.js";

export type BriefTx = Parameters<
  Parameters<ReturnType<typeof getDb>["transaction"]>[0]
>[0];

export type BriefSnapshot = { updatedAt: string; body: string };

/** Lock a brief row the caller holds at least `minRole` on, or fail with 404. */
export async function lockBrief(
  tx: BriefTx,
  briefId: string,
  minRole: BriefRole = "editor",
) {
  const { briefs, briefShares } = schema;
  const [brief] = await tx
    .select()
    .from(briefs)
    .where(
      and(
        eq(briefs.id, briefId),
        accessFilter(briefs, briefShares, undefined, minRole),
      ),
    )
    .limit(1)
    .for("update");
  if (!brief)
    fail("No se encontró el escrito o el elemento.", {
      errorCode: "not_found",
      statusCode: 404,
    });
  return brief;
}

/** Opaque, strictly increasing revision stored in `updatedAt`. */
export function nextBriefUpdatedAt(previous: string) {
  const parsed = Date.parse(previous);
  const floor = Number.isFinite(parsed) ? parsed + 1 : 0;
  return new Date(Math.max(Date.now(), floor)).toISOString();
}

export function assertBriefRevision(current: string, expected: string) {
  if (current !== expected)
    fail("El escrito cambió desde que lo abriste. Revisa la versión actual y vuelve a intentarlo.", {
      errorCode: "brief_changed",
      statusCode: 409,
    });
}

export function assertBriefSnapshot(
  current: BriefSnapshot,
  expected: BriefSnapshot,
) {
  if (
    current.updatedAt !== expected.updatedAt ||
    current.body !== expected.body
  )
    fail("El escrito cambió desde que lo abriste. Revisa la versión actual y vuelve a intentarlo.", {
      errorCode: "brief_changed",
      statusCode: 409,
    });
}
