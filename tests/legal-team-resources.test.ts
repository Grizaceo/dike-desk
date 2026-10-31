import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import {
  getFrontmatterValue,
  parseCustomAgentProfile,
  parseFrontmatter,
  parseSkillMetadata,
} from "@agent-native/core/resources/metadata";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  legalTeamAgentsSection,
  legalTeamSeed,
} from "../server/lib/legal-team-seed.generated.js";
import { createTestDb, type TestDb } from "./helpers/test-db.js";

const holder = vi.hoisted(() => ({
  db: null as TestDb | null,
  ready: vi.fn(),
  putIfAbsent: vi.fn(),
  putIfCurrent: vi.fn(),
  getByPath: vi.fn(),
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
  resourceGetByPath: holder.getByPath,
  resourcePutIfAbsent: holder.putIfAbsent,
  resourcePutIfCurrent: holder.putIfCurrent,
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

  it("matches the generated module to every Spanish resource except learnings and agents", () => {
    const expected = Object.fromEntries(
      es
        .filter((file) => file !== "LEARNINGS.md" && file !== "AGENTS.md")
        .map((file) => [file, content("es", file)]),
    );
    expect(legalTeamSeed).toEqual(expected);
  });

  it("embeds the shared AGENTS.md section verbatim", () => {
    expect(legalTeamAgentsSection).toBe(content("es", "AGENTS.md"));
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

  const sharedAgents = {
    id: "shared-agents-id",
    path: "AGENTS.md",
    owner: "__shared__",
    content: "# Shared instructions\n",
    mimeType: "text/markdown",
    size: 21,
    createdAt: 1,
    updatedAt: 2,
    createdBy: "user" as const,
    visibility: "workspace" as const,
    threadId: null,
    runId: null,
    expiresAt: null,
    metadata: null,
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    db = await createTestDb();
    holder.db = db;
    holder.ready.mockResolvedValue(undefined);
    holder.migrations.mockResolvedValue(undefined);
    holder.putIfAbsent.mockResolvedValue(null);
    holder.getByPath.mockResolvedValue(sharedAgents);
    holder.putIfCurrent.mockImplementation(async (input) => ({
      ...sharedAgents,
      content: input.content,
    }));
  });

  it("writes each resource once, appends the section, then writes both markers", async () => {
    holder.putIfAbsent.mockImplementation(async () => {
      const keys = (await db.select().from(schema.dikeDeskSeedMarkers)).map(
        (row) => row.key,
      );
      expect(keys).not.toContain("legal-team:v2");
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
    expect(holder.getByPath).toHaveBeenCalledWith("__shared__", "AGENTS.md");
    expect(holder.putIfCurrent).toHaveBeenCalledOnce();
    expect(holder.putIfCurrent).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: "__shared__",
        path: "AGENTS.md",
        content: `${sharedAgents.content.trimEnd()}\n\n${legalTeamAgentsSection}`,
        expectedId: sharedAgents.id,
        expectedUpdatedAt: sharedAgents.updatedAt,
        expectedContent: sharedAgents.content,
      }),
    );
    expect(holder.put).not.toHaveBeenCalled();
    expect(holder.remove).not.toHaveBeenCalled();
    expect(await db.select().from(schema.dikeDeskSeedMarkers)).toMatchObject([
      { key: "legal-team:v1" },
      { key: "legal-team:v2" },
    ]);
  });

  it("seeds only the v2 paths when the v1 marker already exists", async () => {
    await db
      .insert(schema.dikeDeskSeedMarkers)
      .values({ key: "legal-team:v1" });
    await seedLegalTeamResources();
    expect(holder.ready).toHaveBeenCalledOnce();
    expect(holder.putIfAbsent).toHaveBeenCalledOnce();
    expect(holder.putIfAbsent).toHaveBeenCalledWith(
      "__shared__",
      "instructions/filosofia-juridica.md",
      legalTeamSeed["instructions/filosofia-juridica.md"],
      "text/markdown",
    );
    for (const file of Object.keys(legalTeamSeed))
      if (file !== "instructions/filosofia-juridica.md")
        expect(holder.putIfAbsent).not.toHaveBeenCalledWith(
          "__shared__",
          file,
          expect.anything(),
          expect.anything(),
        );
    expect(holder.putIfCurrent).toHaveBeenCalledOnce();
    expect(await db.select().from(schema.dikeDeskSeedMarkers)).toMatchObject([
      { key: "legal-team:v1" },
      { key: "legal-team:v2" },
    ]);
  });

  it("does nothing when both markers already exist", async () => {
    await db
      .insert(schema.dikeDeskSeedMarkers)
      .values([{ key: "legal-team:v1" }, { key: "legal-team:v2" }]);
    await seedLegalTeamResources();
    expect(holder.ready).not.toHaveBeenCalled();
    expect(holder.putIfAbsent).not.toHaveBeenCalled();
    expect(holder.getByPath).not.toHaveBeenCalled();
    expect(holder.putIfCurrent).not.toHaveBeenCalled();
  });

  it("still writes the v2 marker when shared AGENTS.md is absent", async () => {
    await db
      .insert(schema.dikeDeskSeedMarkers)
      .values({ key: "legal-team:v1" });
    holder.getByPath.mockResolvedValue(null);
    await seedLegalTeamResources();
    expect(holder.putIfCurrent).not.toHaveBeenCalled();
    expect(await db.select().from(schema.dikeDeskSeedMarkers)).toMatchObject([
      { key: "legal-team:v1" },
      { key: "legal-team:v2" },
    ]);
  });

  it("skips the append when AGENTS.md already has the section", async () => {
    await db
      .insert(schema.dikeDeskSeedMarkers)
      .values({ key: "legal-team:v1" });
    holder.getByPath.mockResolvedValue({
      ...sharedAgents,
      content: `# Shared\n\n<!-- lexo:agents-section v1 -->\n## LexO\n`,
    });
    await seedLegalTeamResources();
    expect(holder.putIfCurrent).not.toHaveBeenCalled();
    expect(await db.select().from(schema.dikeDeskSeedMarkers)).toMatchObject([
      { key: "legal-team:v1" },
      { key: "legal-team:v2" },
    ]);
  });

  it("logs a fixed message and skips the v2 marker when the append fails", async () => {
    await db
      .insert(schema.dikeDeskSeedMarkers)
      .values({ key: "legal-team:v1" });
    holder.putIfCurrent.mockResolvedValue(null);
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    await expect(plugin()).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledWith("[legal-team] Resource seeding failed.");
    expect(await db.select().from(schema.dikeDeskSeedMarkers)).toMatchObject([
      { key: "legal-team:v1" },
    ]);
    error.mockRestore();
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
