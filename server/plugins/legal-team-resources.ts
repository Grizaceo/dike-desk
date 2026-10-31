import {
  ensureResourceStoreReady,
  resourceGetByPath,
  resourcePutIfAbsent,
  resourcePutIfCurrent,
  SHARED_OWNER,
} from "@agent-native/core/resources/store";
import { inArray } from "drizzle-orm";

import { getDb, schema } from "../db/index.js";
import {
  legalTeamAgentsSection,
  legalTeamSeed,
} from "../lib/legal-team-seed.generated.js";
import { ensureAppMigrations } from "./db.js";

const V1_MARKER = "legal-team:v1";
const V2_MARKER = "legal-team:v2";
const V2_PATHS = ["instructions/filosofia-juridica.md"];
const AGENTS_PATH = "AGENTS.md";
const AGENTS_SECTION_MARKER = "<!-- lexo:agents-section v1 -->";

async function seedV1() {
  for (const [path, content] of Object.entries(legalTeamSeed)) {
    if (V2_PATHS.includes(path)) continue;
    await resourcePutIfAbsent(SHARED_OWNER, path, content, "text/markdown");
  }
}

async function appendAgentsSection() {
  const existing = await resourceGetByPath(SHARED_OWNER, AGENTS_PATH);
  if (!existing || existing.content.includes(AGENTS_SECTION_MARKER)) return;
  const written = await resourcePutIfCurrent({
    owner: SHARED_OWNER,
    path: AGENTS_PATH,
    content: `${existing.content.trimEnd()}\n\n${legalTeamAgentsSection}`,
    expectedId: existing.id,
    expectedUpdatedAt: existing.updatedAt,
    expectedContent: existing.content,
    mimeType: existing.mimeType,
  });
  if (!written) throw new Error("Shared AGENTS.md changed during seeding.");
}

async function seedV2() {
  for (const path of V2_PATHS) {
    const content = legalTeamSeed[path];
    if (content !== undefined)
      await resourcePutIfAbsent(SHARED_OWNER, path, content, "text/markdown");
  }
  await appendAgentsSection();
}

const STEPS: [string, () => Promise<void>][] = [
  [V1_MARKER, seedV1],
  [V2_MARKER, seedV2],
];

export async function seedLegalTeamResources() {
  await ensureAppMigrations();
  const db = getDb();
  const markers = schema.dikeDeskSeedMarkers;
  const applied = new Set(
    (
      await db
        .select()
        .from(markers)
        .where(
          inArray(
            markers.key,
            STEPS.map(([key]) => key),
          ),
        )
    ).map((row) => row.key),
  );
  const pending = STEPS.filter(([key]) => !applied.has(key));
  if (pending.length === 0) return;
  await ensureResourceStoreReady();
  for (const [key, run] of pending) {
    await run();
    await db.insert(markers).values({ key }).onConflictDoNothing();
  }
}

export default function legalTeamResources() {
  return seedLegalTeamResources().catch(() => {
    console.error("[legal-team] Resource seeding failed.");
  });
}
