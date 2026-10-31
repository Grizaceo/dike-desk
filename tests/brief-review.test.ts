import { describe, expect, it } from "vitest";

import { getActivityItems, getCitationItems } from "../app/lib/brief-review.js";
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

describe("getActivityItems", () => {
  it("excludes items anchored to a current citation", () => {
    expect(
      getActivityItems([item("a", "c1"), item("b", "c2")], citations),
    ).toEqual([]);
  });

  it("includes unanchored items as current activity", () => {
    expect(getActivityItems([item("a", null)], citations)).toEqual([
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
    expect(getActivityItems([old], citations)).toEqual([
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
    const activity = getActivityItems(review, citations);
    const onCards = getCitationItems(review, "c1").concat(
      getCitationItems(review, "c2"),
    );
    expect(activity.map((a) => a.item.id)).toEqual(["n1", "old", "n2"]);
    expect(activity.map((a) => a.historical)).toEqual([false, true, false]);
    expect(onCards.map((i) => i.id)).toEqual(["cur"]);
    expect(activity.length + onCards.length).toBe(review.length);
  });

  it("treats every anchored item as historical when no citations exist", () => {
    const activity = getActivityItems([item("a", "c1"), item("b", null)], []);
    expect(activity.map((a) => a.historical)).toEqual([true, false]);
  });
});

describe("getCitationItems", () => {
  it("returns only items for that citation", () => {
    const review = [item("a", "c1"), item("b", "c2"), item("c", null)];
    expect(getCitationItems(review, "c1").map((i) => i.id)).toEqual(["a"]);
  });
});
