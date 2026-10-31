import { describe, expect, it } from "vitest";

import {
  bodySegments,
  getActivityItems,
  getCitationItems,
  safeExternalUrl,
} from "../app/lib/brief-review.js";
import type { Citation, ReviewItem } from "../app/lib/brief-types.js";

function item(id: string, citationId: string | null, extra = {}): ReviewItem {
  return {
    id,
    citationId,
    kind: "comment",
    author: "user",
    body: id,
    replacement: null,
    state: null,
    createdAt: "2026-10-30",
    decidedAt: null,
    ...extra,
  };
}

const citations = [{ id: "c1" }, { id: "c2" }] as Pick<Citation, "id">[];
const current = { currentVerification: true };

describe("getActivityItems", () => {
  it("excludes items anchored to a current citation", () => {
    expect(
      getActivityItems([item("a", "c1"), item("b", "c2")], citations, current),
    ).toEqual([]);
  });

  it("includes unanchored items as current activity", () => {
    expect(getActivityItems([item("a", null)], citations, current)).toEqual([
      { item: item("a", null), historical: false },
    ]);
  });

  it("includes items anchored to a missing citation as historical", () => {
    const old = item("old", "gone", {
      kind: "suggestion",
      author: "agent",
      replacement: "art. 1",
      state: "pending",
    });
    expect(getActivityItems([old], citations, current)).toEqual([
      { item: old, historical: true },
    ]);
  });

  it("partitions every item exactly once, preserving order", () => {
    const review = [
      item("n1", null),
      item("cur", "c1"),
      item("old", "gone"),
      item("n2", null),
    ];
    const activity = getActivityItems(review, citations, current);
    const onCards = getCitationItems(review, "c1").concat(
      getCitationItems(review, "c2"),
    );
    expect(activity.map((a) => a.item.id)).toEqual(["n1", "old", "n2"]);
    expect(activity.map((a) => a.historical)).toEqual([false, true, false]);
    expect(onCards.map((i) => i.id)).toEqual(["cur"]);
    expect(activity.length + onCards.length).toBe(review.length);
  });

  it("treats every anchored item as historical when no citations exist", () => {
    const activity = getActivityItems(
      [item("a", "c1"), item("b", null)],
      [],
      current,
    );
    expect(activity.map((a) => a.historical)).toEqual([true, false]);
  });

  it("marks only the latest engine note current when verification exists", () => {
    const notes = [
      item("n1", null, { kind: "agent_note", author: "engine" }),
      item("n2", null, { kind: "agent_note", author: "engine" }),
      item("human", null),
    ];
    expect(
      getActivityItems(notes, citations, current).map((a) => a.historical),
    ).toEqual([true, false, false]);
    expect(
      getActivityItems(notes, citations, { currentVerification: false }).map(
        (a) => a.historical,
      ),
    ).toEqual([true, true, false]);
  });
});

describe("getCitationItems", () => {
  it("returns only items for that citation", () => {
    const review = [item("a", "c1"), item("b", "c2"), item("c", null)];
    expect(getCitationItems(review, "c1").map((i) => i.id)).toEqual(["a"]);
  });
});

describe("bodySegments", () => {
  const citation = (id: string, start: number, end: number, raw: string) =>
    ({ id, start, end, raw }) as Citation;

  it("highlights an aligned span", () => {
    const c = citation("c", 2, 5, "abc");
    expect(bodySegments("xxabc yy", [c])).toEqual([
      { text: "xx" },
      { text: "abc", citation: c },
      { text: " yy" },
    ]);
  });

  it("leaves a misaligned stale span as plain text", () => {
    const stale = { ...citation("c", 2, 5, "old"), status: "stale" as const };
    expect(bodySegments("xxabc yy", [stale])).toEqual([{ text: "xxabc yy" }]);
  });

  it("skips overlapping spans", () => {
    const first = citation("first", 0, 3, "abc");
    const overlap = citation("overlap", 1, 4, "bcd");
    expect(bodySegments("abcd", [first, overlap])).toEqual([
      { text: "abc", citation: first },
      { text: "d" },
    ]);
  });
});

describe("safeExternalUrl", () => {
  it.each([
    ["https://example.invalid/path", "https://example.invalid/path"],
    ["http://example.invalid/", "http://example.invalid/"],
    ["javascript:alert(1)", null],
    ["data:text/html,hello", null],
    ["/relative", null],
    [null, null],
  ])("filters %s", (input, expected) => {
    expect(safeExternalUrl(input)).toBe(expected);
  });
});
