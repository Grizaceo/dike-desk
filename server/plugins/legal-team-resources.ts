import {
  ensureResourceStoreReady,
  resourcePutIfAbsent,
  SHARED_OWNER,
} from "@agent-native/core/resources/store";
import { eq } from "drizzle-orm";

import { getDb, schema } from "../db/index.js";
import { legalTeamSeed } from "../lib/legal-team-seed.generated.js";
import { ensureAppMigrations } from "./db.js";

const SEED_VERSION = "legal-team:v1";

export async function seedLegalTeamResources() {
  await ensureAppMigrations();
  const db = getDb();
  const markers = schema.dikeDeskSeedMarkers;
  const [marker] = await db
    .select()
    .from(markers)
    .where(eq(markers.key, SEED_VERSION))
    .limit(1);
  if (marker) return;
  await ensureResourceStoreReady();
  for (const [path, content] of Object.entries(legalTeamSeed))
    await resourcePutIfAbsent(SHARED_OWNER, path, content, "text/markdown");
  await db.insert(markers).values({ key: SEED_VERSION }).onConflictDoNothing();
}

export default function legalTeamResources() {
  return seedLegalTeamResources().catch(() => {
    console.error("[legal-team] Resource seeding failed.");
  });
}
