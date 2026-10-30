import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createTestDb, type TestDb } from "./helpers/test-db.js";

const holder = vi.hoisted(() => ({ db: null as TestDb | null }));

vi.mock("../server/db/index.js", async () => {
  const schema = await import("../server/db/schema.js");
  return { getDb: () => holder.db, schema };
});

// requireBrief uses accessFilter, which needs a request context; tests load by id.
vi.mock("../server/lib/briefs.js", async (importOriginal) => {
  const mod =
    await importOriginal<typeof import("../server/lib/briefs.js")>();
  const { fail } = await import("@agent-native/core/action");
  const { eq } = await import("drizzle-orm");
  const schema = await import("../server/db/schema.js");
  return {
    ...mod,
    requireBrief: async (briefId: string) => {
      const [brief] = await holder.db!
        .select()
        .from(schema.briefs)
        .where(eq(schema.briefs.id, briefId))
        .limit(1);
      if (!brief)
        fail("Brief not found.", { errorCode: "not_found", statusCode: 404 });
      return brief;
    },
  };
});

const { default: addComment } = await import("../actions/add-comment.js");
const { schema } = await import("../server/db/index.js");

async function seedBrief(db: TestDb) {
  await db.insert(schema.briefs).values({
    id: "b1",
    title: "Escrito",
    body: "Cuerpo del escrito.",
    ownerEmail: "lawyer@test",
    orgId: "o1",
  });
}

describe("add-comment", () => {
  let db: TestDb;

  beforeEach(async () => {
    db = await createTestDb();
    holder.db = db;
    await seedBrief(db);
  });

  it("records the caller, not an author argument: an agent tool cannot post as the lawyer", async () => {
    const result = await addComment.run(
      { briefId: "b1", body: "respuesta", author: "user" } as never,
      { caller: "tool", userEmail: "lawyer@test" },
    );
    const [row] = await db
      .select()
      .from(schema.reviewItems)
      .where(eq(schema.reviewItems.id, result.id));
    expect(row.author).toBe("agent");
  });

  it("records author 'user' when the signed-in app UI calls", async () => {
    const result = await addComment.run(
      { briefId: "b1", body: "comentario" },
      { caller: "frontend", userEmail: "lawyer@test" },
    );
    const [row] = await db
      .select()
      .from(schema.reviewItems)
      .where(eq(schema.reviewItems.id, result.id));
    expect(row.author).toBe("user");
  });

  it("no longer exposes an author parameter to callers", () => {
    const properties = addComment.tool.parameters?.properties ?? {};
    expect(properties).not.toHaveProperty("author");
  });
});
