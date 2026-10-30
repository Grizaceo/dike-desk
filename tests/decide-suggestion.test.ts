import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createTestDb, type TestDb } from "./helpers/test-db.js";

const holder = vi.hoisted(() => ({ db: null as TestDb | null }));

vi.mock("../server/db/index.js", async () => {
  const schema = await import("../server/db/schema.js");
  return { getDb: () => holder.db, schema };
});

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

const { default: decideSuggestion } = await import(
  "../actions/decide-suggestion.js"
);
const { schema } = await import("../server/db/index.js");

const CTX = { caller: "frontend", userEmail: "lawyer@test" } as const;

const RAW_1 = "art. 159 CT";
const RAW_2 = "art. 161 CT";
const BODY = `Invoca ${RAW_1} y también ${RAW_2} del mismo cuerpo.`;

async function seed(db: TestDb) {
  await db.insert(schema.briefs).values({
    id: "b1",
    title: "Escrito",
    body: BODY,
    verdict: "CON_PROBLEMAS",
    ownerEmail: "lawyer@test",
    orgId: "o1",
  });
  const start1 = BODY.indexOf(RAW_1);
  const start2 = BODY.indexOf(RAW_2);
  await db.insert(schema.citations).values([
    {
      id: "c1",
      briefId: "b1",
      position: 0,
      raw: RAW_1,
      start: start1,
      end: start1 + RAW_1.length,
      status: "verified",
      ownerEmail: "lawyer@test",
      orgId: "o1",
    },
    {
      id: "c2",
      briefId: "b1",
      position: 1,
      raw: RAW_2,
      start: start2,
      end: start2 + RAW_2.length,
      status: "ambiguous",
      ownerEmail: "lawyer@test",
      orgId: "o1",
    },
  ]);
  await db.insert(schema.reviewItems).values([
    {
      id: "s1",
      briefId: "b1",
      citationId: "c1",
      kind: "suggestion",
      author: "agent",
      body: "Full provision name",
      replacement: "art. 159 del Código del Trabajo",
      state: "pending",
      ownerEmail: "lawyer@test",
      orgId: "o1",
    },
    {
      id: "s2",
      briefId: "b1",
      citationId: "c2",
      kind: "suggestion",
      author: "agent",
      body: "Full provision name",
      replacement: "art. 161 del Código del Trabajo",
      state: "pending",
      ownerEmail: "lawyer@test",
      orgId: "o1",
    },
  ]);
}

async function reviewItem(db: TestDb, id: string) {
  const [row] = await db
    .select()
    .from(schema.reviewItems)
    .where(eq(schema.reviewItems.id, id));
  return row;
}

describe("decide-suggestion", () => {
  let db: TestDb;

  beforeEach(async () => {
    db = await createTestDb();
    holder.db = db;
    await seed(db);
  });

  it("accepting a suggestion expires the other pending suggestions of the brief", async () => {
    const result = await decideSuggestion.run(
      { suggestionId: "s1", decision: "accepted" },
      CTX,
    );
    expect(result).toEqual({ id: "s1", state: "accepted" });

    const accepted = await reviewItem(db, "s1");
    expect(accepted.state).toBe("accepted");
    expect(accepted.decidedAt).not.toBeNull();

    const other = await reviewItem(db, "s2");
    expect(other.state).toBe("expired");
    expect(other.decidedAt).not.toBeNull();

    const citations = await db.select().from(schema.citations);
    expect(citations.every((c) => c.status === "stale")).toBe(true);

    const [brief] = await db.select().from(schema.briefs);
    expect(brief.body).toBe(
      BODY.replace(RAW_1, "art. 159 del Código del Trabajo"),
    );
    expect(brief.verdict).toBeNull();
  });

  it("rejecting a suggestion leaves other pending suggestions pending", async () => {
    await decideSuggestion.run(
      { suggestionId: "s1", decision: "rejected" },
      CTX,
    );
    expect((await reviewItem(db, "s1")).state).toBe("rejected");
    expect((await reviewItem(db, "s2")).state).toBe("pending");
  });

  it("an expired suggestion cannot be decided (already_decided, 409)", async () => {
    await decideSuggestion.run(
      { suggestionId: "s1", decision: "accepted" },
      CTX,
    );
    await expect(
      decideSuggestion.run(
        { suggestionId: "s2", decision: "accepted" },
        CTX,
      ),
    ).rejects.toMatchObject({
      errorCode: "already_decided",
      statusCode: 409,
    });
  });

  it("is uiOnly: the agent loop never gets it as a tool", () => {
    expect(decideSuggestion.uiOnly).toBe(true);
  });
});
