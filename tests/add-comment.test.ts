import { runWithRequestContext } from "@agent-native/core/server";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createTestDb, type TestDb } from "./helpers/test-db.js";

const holder = vi.hoisted(() => ({ db: null as TestDb | null }));

vi.mock("../server/db/index.js", async () => {
  const schema = await import("../server/db/schema.js");
  return { getDb: () => holder.db, schema };
});

const { default: addComment } = await import("../actions/add-comment.js");
const { schema } = await import("../server/db/index.js");
const { actionCallIntent, preparedCallNeedsApproval } =
  await import("@agent-native/core/action");

async function needsApproval(caller: string, args: Record<string, unknown>) {
  const prepared = await actionCallIntent(addComment, args);
  if (!prepared.valid) throw new Error("fixture arguments must be valid");
  return preparedCallNeedsApproval(addComment, prepared, {
    caller,
    userEmail: "lawyer@test",
  } as never);
}

function asLawyer<T>(fn: () => T): T {
  return runWithRequestContext(
    { userEmail: "lawyer@test", orgId: undefined },
    fn,
  );
}

async function seedBrief(db: TestDb) {
  await db.insert(schema.briefs).values({
    id: "b1",
    title: "Escrito",
    body: "Cuerpo del escrito.",
    ownerEmail: "lawyer@test",
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
    const result = await asLawyer(() =>
      addComment.run(
        { briefId: "b1", body: "respuesta", author: "user" } as never,
        { caller: "tool", userEmail: "lawyer@test" },
      ),
    );
    const [row] = await db
      .select()
      .from(schema.reviewItems)
      .where(eq(schema.reviewItems.id, result.id));
    expect(row.author).toBe("agent");
  });

  it("records author 'user' when the signed-in app UI calls", async () => {
    const result = await asLawyer(() =>
      addComment.run(
        { briefId: "b1", body: "comentario" },
        { caller: "frontend", userEmail: "lawyer@test" },
      ),
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

  describe("approval gate", () => {
    const args = { briefId: "b1", body: "comentario" };

    it("requires approval for plain http callers", async () => {
      expect(await needsApproval("http", args)).toBe(true);
    });

    it.each(["tool", "mcp", "frontend"])(
      "does not require approval for %s callers",
      async (caller) => {
        expect(await needsApproval(caller, args)).toBe(false);
      },
    );

    it("ignores caller or author smuggled in the arguments", async () => {
      const spoofed = { ...args, author: "user", caller: "frontend" };
      expect(await needsApproval("http", spoofed)).toBe(true);
    });

    it("a spoofed author argument on a tool call is still recorded as the agent", async () => {
      const result = await asLawyer(() =>
        addComment.run(
          { ...args, author: "user", caller: "frontend" } as never,
          { caller: "tool", userEmail: "lawyer@test" },
        ),
      );
      const [row] = await db
        .select()
        .from(schema.reviewItems)
        .where(eq(schema.reviewItems.id, result.id));
      expect(row.author).toBe("agent");
    });
  });
});
