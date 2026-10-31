import { describe, expect, it } from "vitest";

import {
  formatTranscript,
  freshThreadIds,
  isConfirmedTurn,
  threadHasMarker,
  threadMessages,
} from "../scripts/lib/demo-chat.mjs";

const RUN_START = new Date("2026-10-30T12:00:00.000Z");
const BEFORE = "2026-10-30T11:59:59.000Z";
const AFTER = "2026-10-30T12:00:05.000Z";
const CANARY = "CANARYSECRET0xDEADBEEF";

function detail(messages: unknown[], extra = {}) {
  return {
    title: `TITLE-${CANARY}`,
    threadData: JSON.stringify({ messages }),
    ...extra,
  };
}

function user(text: string, createdAt: unknown) {
  return {
    message: { role: "user", createdAt, content: [{ type: "text", text }] },
  };
}

describe("freshThreadIds", () => {
  it("keeps only threads created at or after the run start", () => {
    const threads = [
      { id: "old", createdAt: RUN_START.getTime() - 1 },
      { id: "exact", createdAt: RUN_START.getTime() },
      { id: "new", createdAt: RUN_START.getTime() + 5000 },
      { id: "iso", createdAt: AFTER },
    ];
    expect(freshThreadIds(threads, RUN_START)).toEqual(["exact", "new", "iso"]);
  });

  it("ignores updatedAt, missing, invalid and unrelated entries", () => {
    const threads = [
      { id: "recently-updated", createdAt: BEFORE, updatedAt: AFTER },
      { id: "no-date" },
      { id: "bad-date", createdAt: "not a date" },
      { id: "null-date", createdAt: null },
      { createdAt: AFTER },
      null,
    ];
    expect(freshThreadIds(threads as never, RUN_START)).toEqual([]);
  });

  it("returns nothing for malformed input", () => {
    expect(freshThreadIds(undefined as never, RUN_START)).toEqual([]);
    expect(
      freshThreadIds([{ id: "a", createdAt: AFTER }], undefined as never),
    ).toEqual([]);
  });
});

describe("threadHasMarker", () => {
  const since = new Date("2026-10-30T12:00:02.000Z");

  it("confirms a user message at or after `since` carrying the marker", () => {
    expect(
      threadHasMarker(detail([user("hola MARK", AFTER)]), "MARK", since),
    ).toBe(true);
  });

  it("rejects an older message with the same marker", () => {
    expect(
      threadHasMarker(detail([user("hola MARK", BEFORE)]), "MARK", since),
    ).toBe(false);
  });

  it("rejects messages without a valid date, other roles and other text", () => {
    expect(
      threadHasMarker(detail([user("MARK", undefined)]), "MARK", since),
    ).toBe(false);
    expect(
      threadHasMarker(detail([user("MARK", "garbage")]), "MARK", since),
    ).toBe(false);
    const assistant = {
      message: {
        role: "assistant",
        createdAt: AFTER,
        content: [{ type: "text", text: "MARK" }],
      },
    };
    expect(threadHasMarker(detail([assistant]), "MARK", since)).toBe(false);
    expect(
      threadHasMarker(detail([user("otra cosa", AFTER)]), "MARK", since),
    ).toBe(false);
  });

  it("rejects without a usable `since` or payload", () => {
    expect(
      threadHasMarker(
        detail([user("MARK", AFTER)]),
        "MARK",
        undefined as never,
      ),
    ).toBe(false);
    expect(threadHasMarker({ threadData: "{broken" }, "MARK", since)).toBe(
      false,
    );
    expect(threadHasMarker({}, "MARK", since)).toBe(false);
  });
});

describe("threadMessages", () => {
  it("accepts string or object payloads and fails soft", () => {
    expect(threadMessages({ threadData: { messages: [1] } })).toEqual([1]);
    expect(threadMessages({ threadData: '{"messages":[2]}' })).toEqual([2]);
    expect(threadMessages({ threadData: "nope" })).toEqual([]);
    expect(threadMessages({ threadData: { messages: "x" } })).toEqual([]);
    expect(threadMessages(null)).toEqual([]);
  });
});

describe("formatTranscript", () => {
  const messages = [
    user(`old request nvapi-${CANARY} PRE-RUN-TEXT`, BEFORE),
    {
      message: {
        role: "assistant",
        createdAt: BEFORE,
        content: [{ type: "text", text: "PRE-RUN-ANSWER" }],
      },
    },
    user("esto es el Código del Trabajo", AFTER),
    {
      message: {
        role: "assistant",
        createdAt: AFTER,
        content: [
          { type: "text", text: `Listo. password=${CANARY}` },
          {
            type: "tool-call",
            toolName: "propose-fix",
            args: { replacement: `ARGS-${CANARY}` },
            argsText: `ARGS-TEXT-${CANARY}`,
            result: { leaked: `RESULT-${CANARY}` },
          },
          { type: "image" },
        ],
      },
    },
    { message: { role: "user", content: [{ type: "text", text: "NO-DATE" }] } },
  ];

  const text = formatTranscript(detail(messages), {
    threadId: "thread-1",
    label: "comment60",
    startedAt: RUN_START,
  });

  it("keeps this run's messages with redacted text and tool names", () => {
    expect(text).toContain("# Thread thread-1");
    expect(text).toContain("# label: comment60");
    expect(text).toContain("esto es el Código del Trabajo");
    expect(text).toContain("Listo.");
    expect(text).toContain(">> tool-call propose-fix");
    expect(text).toContain("[part image]");
  });

  it("omits the title, old and undated messages, tool arguments and results", () => {
    expect(text).not.toContain("TITLE");
    expect(text).not.toContain("PRE-RUN");
    expect(text).not.toContain("NO-DATE");
    expect(text).not.toContain("ARGS");
    expect(text).not.toContain("RESULT");
    expect(text).not.toContain("replacement");
  });

  it("redacts credentials that remain in kept text", () => {
    expect(text).not.toContain(CANARY);
  });
});

describe("formatTranscript roles", () => {
  const text = formatTranscript(
    detail([
      user("visible user text", AFTER),
      {
        message: {
          role: "assistant",
          createdAt: AFTER,
          content: [
            { type: "text", text: "visible assistant text" },
            {
              type: "tool-call",
              toolName: "verify-brief",
              args: { secret: `ARGS-${CANARY}` },
              result: `RESULT-${CANARY}`,
            },
          ],
        },
      },
      ...["system", "developer", "tool", "unknown", undefined].map((role) => ({
        message: {
          role,
          createdAt: AFTER,
          content: [
            { type: "text", text: `HIDDEN-${String(role)}-TEXT` },
            { type: "tool-call", toolName: `HIDDEN-TOOL-${String(role)}` },
          ],
        },
      })),
    ]),
    { threadId: "t", label: "l", startedAt: RUN_START },
  );

  it("exports visible user and assistant text", () => {
    expect(text).toContain("visible user text");
    expect(text).toContain("visible assistant text");
  });

  it("exports assistant tool names without arguments or results", () => {
    expect(text).toContain(">> tool-call verify-brief");
    expect(text).not.toContain("ARGS");
    expect(text).not.toContain("RESULT");
  });

  it("skips system, developer, tool, unknown and role-less messages entirely", () => {
    expect(text).not.toContain("HIDDEN");
    expect(text).not.toContain("===== system");
    expect(text).not.toContain("===== ?");
  });
});

describe("isConfirmedTurn", () => {
  it.each([
    ["null", null],
    ["undefined", undefined],
    ["missing thread id", { markerConfirmed: true }],
    ["empty thread id", { threadId: "", markerConfirmed: true }],
    ["non-string thread id", { threadId: 7, markerConfirmed: true }],
    ["marker not confirmed", { threadId: "t1", markerConfirmed: false }],
    ["missing marker flag", { threadId: "t1" }],
    ["truthy but not true", { threadId: "t1", markerConfirmed: 1 }],
  ])("is false for %s", (_label, turn) => {
    expect(isConfirmedTurn(turn)).toBe(false);
  });

  it("is true with a thread id and confirmed marker, even if no active run was seen", () => {
    expect(
      isConfirmedTurn({
        threadId: "t1",
        markerConfirmed: true,
        sawActive: false,
      }),
    ).toBe(true);
  });
});
