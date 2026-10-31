import { runWithRequestContext } from "@agent-native/core/server";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createTestDb, type TestDb } from "./helpers/test-db.js";

const holder = vi.hoisted(() => ({
  db: null as TestDb | null,
  runConstancia: vi.fn(),
}));

vi.mock("../server/db/index.js", async () => {
  const schema = await import("../server/db/schema.js");
  return { getDb: () => holder.db, schema };
});

vi.mock("../server/lib/dike.js", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../server/lib/dike.js")>();
  return { ...mod, runConstancia: holder.runConstancia };
});

const { default: updateBrief } = await import("../actions/update-brief.js");
const { default: verifyBrief } = await import("../actions/verify-brief.js");
const { default: emitCommitment } =
  await import("../actions/emit-commitment.js");
const { default: decideSuggestion } =
  await import("../actions/decide-suggestion.js");
const { schema } = await import("../server/db/index.js");

const OWNER = "owner@example.invalid";
const EDITOR = "editor@example.invalid";
const RAW = "art. 161 CT";
const BODY_A = `Invoca ${RAW} del mismo cuerpo.`;
const BODY_B = "Texto distinto sin citas.";
const FIRST_UPDATED_AT = "2026-01-01T00:00:00.000Z";
const OLD_META = JSON.stringify({ pack_hash: "OLD", citas_verificadas: 1 });
const REPLACEMENT = "art. 161 del Código del Trabajo";

function as<T>(userEmail: string, fn: () => T): T {
  return runWithRequestContext({ userEmail, orgId: undefined }, fn);
}

function ctxFor(userEmail: string) {
  return { userEmail, caller: "frontend" as const };
}

const verify = (user = OWNER) =>
  as(user, () => verifyBrief.run({ briefId: "b1" }, ctxFor(user)));
const emit = (user = OWNER) =>
  as(user, () => emitCommitment.run({ briefId: "b1" }, ctxFor(user)));
const edit = async (body: string, user = OWNER) => {
  const expectedUpdatedAt = (await briefRow(holder.db!)).updatedAt;
  return as(user, () =>
    updateBrief.run({ briefId: "b1", body, expectedUpdatedAt }, ctxFor(user)),
  );
};
const decide = (
  suggestionId: string,
  decision: "accepted" | "rejected",
  user = OWNER,
) =>
  as(user, () =>
    decideSuggestion.run({ suggestionId, decision }, ctxFor(user)),
  );

function engineResult(body = BODY_A) {
  return {
    result: {
      veredicto: "TODAS_VERIFICADAS",
      mensaje: "synthetic engine stub",
      alcance: "test only",
      problemas: [],
      detalles: [
        {
          cita_raw: RAW,
          gid: "test:161",
          estado: "VERIFICADA",
          resolucion: "EXACT",
          cuerpo: "CT",
          texto_hash: "dummy",
          vigencia: "test",
          fuente_url: "https://example.invalid",
          fecha_recuperacion: "2026-10-30",
        },
      ],
      meta: {
        as_of: "2026-10-30",
        fecha_constancia: "2026-10-30",
        pack_hash: "TEST_ONLY",
        total_citas: 1,
        citas_verificadas: 1,
        citas_fallidas: 0,
      },
    },
    commitment: { testedBody: body },
    signature: null,
    pubkey: null,
  };
}

/** Engine calls that stay pending until the test releases them. */
function gatedEngine() {
  const calls: { release: (value: unknown) => void; reject: () => void }[] = [];
  holder.runConstancia.mockImplementation(
    () =>
      new Promise((resolve, reject) => {
        calls.push({
          release: resolve,
          reject: () => reject(new Error("engine down")),
        });
      }),
  );
  return {
    calls,
    entered: (count: number) =>
      vi.waitFor(() => expect(calls.length).toBeGreaterThanOrEqual(count)),
  };
}

async function seed(db: TestDb) {
  await db.insert(schema.briefs).values({
    id: "b1",
    title: "Escrito",
    body: BODY_A,
    verdict: "TODAS_VERIFICADAS",
    verificationMeta: OLD_META,
    ownerEmail: OWNER,
    visibility: "private",
    updatedAt: FIRST_UPDATED_AT,
  });
  await db.insert(schema.briefShares).values({
    id: "sh-editor",
    resourceId: "b1",
    principalType: "user",
    principalId: EDITOR,
    role: "editor",
  });
  await db.insert(schema.citations).values({
    id: "c1",
    briefId: "b1",
    position: 0,
    raw: RAW,
    start: BODY_A.indexOf(RAW),
    end: BODY_A.indexOf(RAW) + RAW.length,
    status: "verified",
    ownerEmail: OWNER,
  });
  await db.insert(schema.reviewItems).values([
    {
      id: "s1",
      briefId: "b1",
      citationId: "c1",
      kind: "suggestion",
      author: "agent",
      body: "Full provision name",
      replacement: REPLACEMENT,
      state: "pending",
      ownerEmail: OWNER,
    },
    {
      id: "cm1",
      briefId: "b1",
      kind: "comment",
      author: "user",
      body: "Revisar esto",
      ownerEmail: OWNER,
    },
  ]);
}

async function briefRow(db: TestDb) {
  const [row] = await db
    .select()
    .from(schema.briefs)
    .where(eq(schema.briefs.id, "b1"));
  return row;
}

async function reviewRow(db: TestDb, id: string) {
  const [row] = await db
    .select()
    .from(schema.reviewItems)
    .where(eq(schema.reviewItems.id, id));
  return row;
}

async function expectUntouchedByEngineResult(db: TestDb) {
  const row = await briefRow(db);
  expect(row.body).toBe(BODY_B);
  expect(row.verdict).toBeNull();
  expect(row.verificationMeta).toBeNull();
  expect(row.commitmentJson).toBeNull();
  const citations = await db.select().from(schema.citations);
  expect(citations.map((c) => [c.raw, c.status])).toEqual([[RAW, "stale"]]);
}

const BRIEF_CHANGED = { statusCode: 409, errorCode: "brief_changed" };

describe("brief writes under concurrency", () => {
  let db: TestDb;

  beforeEach(async () => {
    db = await createTestDb();
    holder.db = db;
    holder.runConstancia.mockReset();
    await seed(db);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("verify(A) finishing after update(B) is rejected and leaves B clean", async () => {
    const engine = gatedEngine();
    const running = verify();
    const outcome = expect(running).rejects.toMatchObject(BRIEF_CHANGED);
    await engine.entered(1);
    await edit(BODY_B);
    engine.calls[0].release(engineResult());
    await outcome;
    await expectUntouchedByEngineResult(db);
  });

  it("emit(A) finishing after update(B) is rejected and leaves no commitment", async () => {
    const engine = gatedEngine();
    const running = emit();
    const outcome = expect(running).rejects.toMatchObject(BRIEF_CHANGED);
    await engine.entered(1);
    await edit(BODY_B);
    engine.calls[0].release(engineResult());
    await outcome;
    await expectUntouchedByEngineResult(db);
  });

  it("verify(A) finishing after an accepted suggestion is rejected", async () => {
    const engine = gatedEngine();
    const running = verify();
    const outcome = expect(running).rejects.toMatchObject(BRIEF_CHANGED);
    await engine.entered(1);
    await decide("s1", "accepted");
    engine.calls[0].release(engineResult());
    await outcome;
    const row = await briefRow(db);
    expect(row.body).toBe(BODY_A.replace(RAW, REPLACEMENT));
    expect(row.verdict).toBeNull();
    expect(row.verificationMeta).toBeNull();
    expect(row.commitmentJson).toBeNull();
    const [citation] = await db.select().from(schema.citations);
    expect(citation.status).toBe("stale");
  });

  it("rejects a draft based on a revision before accepting a suggestion", async () => {
    const expectedUpdatedAt = (await briefRow(db)).updatedAt;
    await decide("s1", "accepted");
    const ledger = await db.select().from(schema.reviewItems);
    await expect(
      as(OWNER, () =>
        updateBrief.run(
          { briefId: "b1", body: BODY_A, expectedUpdatedAt },
          ctxFor(OWNER),
        ),
      ),
    ).rejects.toMatchObject({ statusCode: 409, errorCode: "brief_changed" });
    expect((await briefRow(db)).body).toBe(BODY_A.replace(RAW, REPLACEMENT));
    expect(await db.select().from(schema.reviewItems)).toEqual(ledger);
  });

  it("two verifications of the same snapshot: only the first to commit wins", async () => {
    const engine = gatedEngine();
    const first = verify();
    const second = verify();
    const firstOutcome = expect(first).rejects.toMatchObject(BRIEF_CHANGED);
    await engine.entered(2);
    engine.calls[1].release(engineResult());
    await second;
    const afterSecond = await briefRow(db);
    expect(JSON.parse(afterSecond.verificationMeta!).pack_hash).toBe(
      "TEST_ONLY",
    );
    engine.calls[0].release(engineResult());
    await firstOutcome;
    const afterFirst = await briefRow(db);
    expect(afterFirst.updatedAt).toBe(afterSecond.updatedAt);
    const notes = (await db.select().from(schema.reviewItems)).filter(
      (r) => r.kind === "agent_note",
    );
    expect(notes).toHaveLength(1);
    expect(await db.select().from(schema.citations)).toHaveLength(1);
  });

  it("two decisions on the same suggestion: one winner, one ledger row, one replacement", async () => {
    const results = await Promise.allSettled([
      decide("s1", "accepted"),
      decide("s1", "accepted", EDITOR),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const loser = results.find((r) => r.status === "rejected") as
      | PromiseRejectedResult
      | undefined;
    expect(loser?.reason).toMatchObject({
      statusCode: 409,
      errorCode: "already_decided",
    });
    const decisions = (await db.select().from(schema.reviewItems)).filter(
      (r) => r.kind === "decision",
    );
    expect(decisions).toHaveLength(1);
    expect((await briefRow(db)).body).toBe(BODY_A.replace(RAW, REPLACEMENT));
  });

  it("accept and reject racing on one suggestion: the loser changes nothing", async () => {
    const results = await Promise.allSettled([
      decide("s1", "rejected"),
      decide("s1", "accepted"),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const state = (await reviewRow(db, "s1")).state;
    const row = await briefRow(db);
    if (state === "rejected") expect(row.body).toBe(BODY_A);
    else expect(row.body).toBe(BODY_A.replace(RAW, REPLACEMENT));
    expect(
      (await db.select().from(schema.reviewItems)).filter(
        (r) => r.kind === "decision",
      ),
    ).toHaveLength(1);
  });

  it("re-verifying expires every pending suggestion and keeps comments", async () => {
    holder.runConstancia.mockResolvedValue(engineResult());
    await verify();
    expect((await reviewRow(db, "s1")).state).toBe("expired");
    expect((await reviewRow(db, "s1")).decidedAt).not.toBeNull();
    const comment = await reviewRow(db, "cm1");
    expect(comment).toMatchObject({ kind: "comment", body: "Revisar esto" });
    expect(comment.state).toBeNull();
    const [citation] = await db.select().from(schema.citations);
    expect(citation.status).toBe("verified");
    await expect(decide("s1", "accepted")).rejects.toMatchObject({
      errorCode: "already_decided",
    });
  });

  it("verification by an editor keeps the citations owned by the brief owner", async () => {
    holder.runConstancia.mockResolvedValue(engineResult());
    await verify(EDITOR);
    const [citation] = await db.select().from(schema.citations);
    expect(citation.ownerEmail).toBe(OWNER);
    const [note] = (await db.select().from(schema.reviewItems)).filter(
      (r) => r.kind === "agent_note",
    );
    expect(note.ownerEmail).toBe(EDITOR);
  });

  it("rejecting a suggestion keeps the current citations, meta and text", async () => {
    await decide("s1", "rejected");
    const row = await briefRow(db);
    expect(row.body).toBe(BODY_A);
    expect(row.verdict).toBe("TODAS_VERIFICADAS");
    expect(row.verificationMeta).toBe(OLD_META);
    const [citation] = await db.select().from(schema.citations);
    expect(citation.status).toBe("verified");
    expect((await reviewRow(db, "s1")).state).toBe("rejected");
  });

  it("accepting clears the previous verification meta", async () => {
    await decide("s1", "accepted");
    const row = await briefRow(db);
    expect(row.verificationMeta).toBeNull();
    expect(row.verdict).toBeNull();
  });

  it("the revision advances even with a frozen clock, so an edit back to the old text is not ABA", async () => {
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2025-01-01T00:00:00Z"));
    const engine = gatedEngine();
    const running = verify();
    const outcome = expect(running).rejects.toMatchObject(BRIEF_CHANGED);
    await engine.entered(1);
    await edit(BODY_B);
    const afterB = (await briefRow(db)).updatedAt;
    await edit(BODY_A);
    const afterA = (await briefRow(db)).updatedAt;
    expect(Date.parse(afterB)).toBeGreaterThan(Date.parse(FIRST_UPDATED_AT));
    expect(Date.parse(afterA)).toBeGreaterThan(Date.parse(afterB));
    expect((await briefRow(db)).body).toBe(BODY_A);
    engine.calls[0].release(engineResult());
    await outcome;
    const row = await briefRow(db);
    expect(row.verificationMeta).toBeNull();
    expect(row.verdict).toBeNull();
  });

  it("an engine failure leaves the previous state intact", async () => {
    const engine = gatedEngine();
    const running = verify();
    const outcome = expect(running).rejects.toThrow("engine down");
    await engine.entered(1);
    engine.calls[0].reject();
    await outcome;
    const row = await briefRow(db);
    expect(row.body).toBe(BODY_A);
    expect(row.verdict).toBe("TODAS_VERIFICADAS");
    expect(row.verificationMeta).toBe(OLD_META);
    expect(row.updatedAt).toBe(FIRST_UPDATED_AT);
    expect((await reviewRow(db, "s1")).state).toBe("pending");
    const [citation] = await db.select().from(schema.citations);
    expect(citation.status).toBe("verified");
  });
});
