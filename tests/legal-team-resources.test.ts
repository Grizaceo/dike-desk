import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import {
  getFrontmatterValue,
  parseCustomAgentProfile,
  parseFrontmatter,
  parseSkillMetadata,
} from "@agent-native/core/resources/metadata";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { legalTeamSeed } from "../server/lib/legal-team-seed.generated.js";
import { createTestDb, type TestDb } from "./helpers/test-db.js";

const holder = vi.hoisted(() => ({
  db: null as TestDb | null,
  ready: vi.fn(),
  putIfAbsent: vi.fn(),
  put: vi.fn(),
  remove: vi.fn(),
  migrations: vi.fn(),
}));

vi.mock("../server/db/index.js", async () => ({
  getDb: () => holder.db,
  schema: await import("../server/db/schema.js"),
}));
vi.mock("../server/plugins/db.js", () => ({
  ensureAppMigrations: holder.migrations,
}));
vi.mock("@agent-native/core/resources/store", () => ({
  SHARED_OWNER: "__shared__",
  ensureResourceStoreReady: holder.ready,
  resourcePutIfAbsent: holder.putIfAbsent,
  resourcePut: holder.put,
  resourceDelete: holder.remove,
}));

const { seedLegalTeamResources, default: plugin } =
  await import("../server/plugins/legal-team-resources.js");
const { schema } = await import("../server/db/index.js");
const root = path.resolve("resources");

function files(dir: string, prefix = ""): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      return entry.isDirectory()
        ? files(path.join(dir, entry.name), relative)
        : [relative];
    })
    .sort();
}

function content(language: string, file: string) {
  return readFileSync(path.join(root, language, file), "utf8");
}

describe("legal team resource content", () => {
  const es = files(path.join(root, "es"));
  const en = files(path.join(root, "en"));

  it("keeps the Spanish and English file sets identical", () => {
    expect(en).toEqual(es);
  });

  it.each(["es", "en"])(
    "has valid %s agent and skill frontmatter",
    (language) => {
      for (const file of files(path.join(root, language))) {
        const text = content(language, file);
        const frontmatter = parseFrontmatter(text);
        if (file.startsWith("agents/") && file.endsWith(".md")) {
          const name = path.basename(file, ".md");
          expect(getFrontmatterValue(frontmatter, "name")).toBe(name);
          expect(
            getFrontmatterValue(frontmatter, "description")?.trim(),
          ).toBeTruthy();
          expect(getFrontmatterValue(frontmatter, "model")).toBe("inherit");
          const profile = parseCustomAgentProfile(text, file);
          expect(profile?.name).toBe(name);
          expect(profile?.description).toBe(
            getFrontmatterValue(frontmatter, "description"),
          );
        }
        if (/^skills\/[^/]+\/SKILL\.md$/.test(file)) {
          const name = file.split("/")[1];
          expect(getFrontmatterValue(frontmatter, "name")).toBe(name);
          expect(
            getFrontmatterValue(frontmatter, "description")?.trim(),
          ).toBeTruthy();
          const skill = parseSkillMetadata(text, file);
          expect(skill?.name).toBe(name);
          expect(skill?.description).toBe(
            getFrontmatterValue(frontmatter, "description"),
          );
        }
      }
    },
  );

  it("matches the generated module to every Spanish resource except learnings", () => {
    const expected = Object.fromEntries(
      es
        .filter((file) => file !== "LEARNINGS.md")
        .map((file) => [file, content("es", file)]),
    );
    expect(legalTeamSeed).toEqual(expected);
  });

  it("uses Spanish learnings verbatim as the shared default", () => {
    expect(readFileSync("learnings.defaults.md", "utf8")).toBe(
      content("es", "LEARNINGS.md"),
    );
  });

  it.each(["es", "en"])(
    "contains no private or environment markers in %s",
    (language) => {
      for (const file of files(path.join(root, language))) {
        const text = `${file}\n${content(language, file)}`;
        expect(text).not.toMatch(/\/home\/|hermes|\.env/i);
        expect(text).not.toMatch(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
        expect(text).not.toMatch(/\b\d{1,2}\.?\d{3}\.?\d{3}-[\dk]\b/i);
      }
    },
  );
});

describe("legal team resource seeding", () => {
  let db: TestDb;

  beforeEach(async () => {
    vi.clearAllMocks();
    db = await createTestDb();
    holder.db = db;
    holder.ready.mockResolvedValue(undefined);
    holder.migrations.mockResolvedValue(undefined);
    holder.putIfAbsent.mockResolvedValue(null);
  });

  it("writes each resource once, then writes the marker", async () => {
    holder.putIfAbsent.mockImplementation(async () => {
      expect(await db.select().from(schema.dikeDeskSeedMarkers)).toEqual([]);
    });
    await seedLegalTeamResources();
    expect(holder.migrations).toHaveBeenCalledOnce();
    expect(holder.ready).toHaveBeenCalledOnce();
    expect(holder.putIfAbsent).toHaveBeenCalledTimes(
      Object.keys(legalTeamSeed).length,
    );
    for (const [file, text] of Object.entries(legalTeamSeed))
      expect(holder.putIfAbsent).toHaveBeenCalledWith(
        "__shared__",
        file,
        text,
        "text/markdown",
      );
    expect(holder.put).not.toHaveBeenCalled();
    expect(holder.remove).not.toHaveBeenCalled();
    expect(await db.select().from(schema.dikeDeskSeedMarkers)).toMatchObject([
      { key: "legal-team:v1" },
    ]);
  });

  it("does nothing when the marker already exists", async () => {
    await db
      .insert(schema.dikeDeskSeedMarkers)
      .values({ key: "legal-team:v1" });
    await seedLegalTeamResources();
    expect(holder.ready).not.toHaveBeenCalled();
    expect(holder.putIfAbsent).not.toHaveBeenCalled();
  });

  it("logs a fixed message and leaves the marker absent on store failure", async () => {
    holder.putIfAbsent.mockRejectedValue(new Error("sensitive detail"));
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    await expect(plugin()).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledWith("[legal-team] Resource seeding failed.");
    expect(await db.select().from(schema.dikeDeskSeedMarkers)).toEqual([]);
    error.mockRestore();
  });
});
