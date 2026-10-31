import { describe, expect, it, vi } from "vitest";

vi.mock("@agent-native/core/client/i18n", () => ({
  useT: () => (key: string) => key,
}));

import {
  STATUS_STYLES,
  VerdictBadge,
} from "../app/components/briefs/StatusBadge.js";
import enUS from "../app/i18n/en-US.js";
import esES from "../app/i18n/es-ES.js";
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

function messageKeys(value: unknown, prefix = ""): string[] {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return Object.entries(value).flatMap(([key, child]) =>
      messageKeys(child, prefix ? `${prefix}.${key}` : key),
    );
  }
  return [prefix];
}

describe("citation marks", () => {
  it("uses a different underline for each status", () => {
    const decorations = Object.values(STATUS_STYLES).map(
      (style) =>
        style.mark.match(/decoration-(solid|double|dotted|dashed|wavy)/)?.[0],
    );
    expect(decorations).toEqual([
      "decoration-solid",
      "decoration-wavy",
      "decoration-dashed",
      "decoration-dotted",
    ]);
  });
});

describe("i18n catalogs", () => {
  it("keeps en-US and es-ES keys aligned", () => {
    expect(messageKeys(esES).sort()).toEqual(messageKeys(enUS).sort());
  });
});

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
  const citation = (
    id: string,
    start: number,
    end: number,
    raw: string,
    status: Citation["status"] = "verified",
  ) => ({ id, start, end, raw, status }) as Citation;

  it("highlights an aligned span", () => {
    const c = citation("c", 3, 6, "abc");
    expect(bodySegments("xx abc yy", [c])).toEqual({
      segments: [
        { text: "xx " },
        { text: "abc", citation: c },
        { text: " yy" },
      ],
      unlocated: [],
    });
  });

  it("leaves a missing stale span as plain text", () => {
    const stale = citation("c", 2, 5, "old", "stale");
    expect(bodySegments("xx abc yy", [stale])).toEqual({
      segments: [{ text: "xx abc yy" }],
      unlocated: [stale],
    });
  });

  it("skips overlapping spans", () => {
    const body = "el artículo 16";
    const first = citation("first", 0, body.length, body);
    const shortStart = body.indexOf("artículo");
    const overlap = citation("overlap", shortStart, body.length, "artículo 16");
    expect(bodySegments(body, [first, overlap])).toEqual({
      segments: [{ text: body, citation: first }],
      unlocated: [overlap],
    });
  });

  it("does not treat artículo 16 as a prefix of artículo 161", () => {
    const raw = "artículo 16";
    const body = "artículo 161";
    const stale = citation("c", 0, raw.length, raw, "stale");
    expect(bodySegments(body, [stale])).toEqual({
      segments: [{ text: body }],
      unlocated: [stale],
    });
  });

  it("keeps a later citation marked after a longer replacement", () => {
    const before = "Véase el artículo 16 y el artículo 19.";
    const firstRaw = "artículo 16";
    const secondRaw = "artículo 19";
    const firstStart = before.indexOf(firstRaw);
    const secondStart = before.indexOf(secondRaw);
    const replacement = "artículo 161";
    const body =
      before.slice(0, firstStart) +
      replacement +
      before.slice(firstStart + firstRaw.length);
    const replaced = citation(
      "c1",
      firstStart,
      firstStart + firstRaw.length,
      firstRaw,
      "stale",
    );
    const later = citation(
      "c2",
      secondStart,
      secondStart + secondRaw.length,
      secondRaw,
      "stale",
    );
    const foundAt = body.indexOf(secondRaw);
    expect(bodySegments(body, [replaced, later])).toEqual({
      segments: [
        { text: body.slice(0, foundAt) },
        { text: secondRaw, citation: later },
        { text: body.slice(foundAt + secondRaw.length) },
      ],
      unlocated: [replaced],
    });
  });

  it("keeps a later citation marked after a shorter replacement", () => {
    const before = "Véase el artículo 16 y el artículo 19.";
    const firstRaw = "artículo 16";
    const secondRaw = "artículo 19";
    const firstStart = before.indexOf(firstRaw);
    const secondStart = before.indexOf(secondRaw);
    const body =
      before.slice(0, firstStart) +
      "art. 16" +
      before.slice(firstStart + firstRaw.length);
    const replaced = citation(
      "c1",
      firstStart,
      firstStart + firstRaw.length,
      firstRaw,
      "stale",
    );
    const later = citation(
      "c2",
      secondStart,
      secondStart + secondRaw.length,
      secondRaw,
      "stale",
    );
    const foundAt = body.indexOf(secondRaw);
    expect(bodySegments(body, [later, replaced]).segments).toContainEqual({
      text: secondRaw,
      citation: later,
    });
    expect(bodySegments(body, [later, replaced]).unlocated).toEqual([replaced]);
    expect(foundAt).toBeGreaterThan(-1);
  });

  it("does not reuse a span already assigned to a nearer citation", () => {
    const raw = "artículo 16";
    const original = `${raw} y ${raw}`;
    const body = `artículo 161 y ${raw}`;
    const first = citation("c1", 0, raw.length, raw, "stale");
    const secondStart = original.lastIndexOf(raw);
    const second = citation(
      "c2",
      secondStart,
      secondStart + raw.length,
      raw,
      "stale",
    );
    const result = bodySegments(body, [first, second]);
    expect(result.segments.filter((segment) => segment.citation)).toEqual([
      { text: raw, citation: second },
    ]);
    expect(result.unlocated).toEqual([first]);
  });

  it("chooses the occurrence nearest the stored offset", () => {
    const raw = "artículo 19";
    const body = `${raw} y más adelante ${raw}`;
    const second = body.lastIndexOf(raw);
    const stale = citation(
      "c",
      second - 4,
      second - 4 + raw.length,
      raw,
      "stale",
    );
    const result = bodySegments(body, [stale]);
    const marked = result.segments.findIndex((segment) => segment.citation);
    const before = result.segments
      .slice(0, marked)
      .map((segment) => segment.text)
      .join("");
    expect(before).toHaveLength(second);
    expect(result.unlocated).toEqual([]);
  });

  it("matches a citation bounded by punctuation", () => {
    const raw = "artículo 16";
    const body = `(${raw}).`;
    const mark = citation("c", 1, 1 + raw.length, raw);
    expect(bodySegments(body, [mark])).toEqual({
      segments: [{ text: "(" }, { text: raw, citation: mark }, { text: ")." }],
      unlocated: [],
    });
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

describe("VerdictBadge", () => {
  it("distinguishes SIN_CITAS and SIN_CORPUS from CON_PROBLEMAS and never marks them verified", () => {
    const none = VerdictBadge({ verdict: null });
    expect(none.props.children).toBe("verdict.notVerified");

    const ok = VerdictBadge({ verdict: "TODAS_VERIFICADAS" });
    expect(ok.props.status).toBe("verified");

    const problems = VerdictBadge({ verdict: "CON_PROBLEMAS" });
    expect(problems.props.children).toBe("verdict.hasProblems");
    expect(problems.props.className).toContain(STATUS_STYLES.refused.badge);

    const noCitations = VerdictBadge({ verdict: "SIN_CITAS" });
    expect(noCitations.props.children).toBe("verdict.noCitations");
    expect(noCitations.props.className).toContain(
      STATUS_STYLES.ambiguous.badge,
    );

    const noCorpus = VerdictBadge({ verdict: "SIN_CORPUS" });
    expect(noCorpus.props.children).toBe("verdict.noCorpus");
    expect(noCorpus.props.className).toContain(STATUS_STYLES.refused.badge);

    expect(enUS.verdict).toEqual({
      notVerified: "Not verified",
      hasProblems: "Has problems",
      noCitations: "No citations",
      noCorpus: "No corpus",
    });
    expect(esES.verdict).toEqual({
      notVerified: "No verificado",
      hasProblems: "Con problemas",
      noCitations: "Sin citas",
      noCorpus: "Sin corpus",
    });
  });
});

describe("ensureAppMigrations", () => {
  it("clears the cached promise after a failure so the next call can retry", async () => {
    vi.resetModules();
    const run = vi
      .fn()
      .mockRejectedValueOnce(new Error("transient db error"))
      .mockResolvedValueOnce(undefined);
    vi.doMock("@agent-native/core/db", () => ({
      runMigrations: () => run,
    }));
    const { ensureAppMigrations } = await import("../server/plugins/db.js");
    await expect(ensureAppMigrations()).rejects.toThrow("transient db error");
    await expect(ensureAppMigrations()).resolves.toBeUndefined();
    await expect(ensureAppMigrations()).resolves.toBeUndefined();
    expect(run).toHaveBeenCalledTimes(2);
    vi.doUnmock("@agent-native/core/db");
  });
});
