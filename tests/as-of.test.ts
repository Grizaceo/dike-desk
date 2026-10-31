import { describe, expect, it } from "vitest";

import { parseAsOf } from "../server/lib/as-of.js";

const INVALID = { errorCode: "invalid_as_of", statusCode: 400 };

// 2026-10-31T01:30:00Z is 2026-10-30 22:30 in Santiago (UTC-3 in October):
// UTC and Santiago disagree, which is what makes the test discriminating.
const NOW = new Date("2026-10-31T01:30:00Z");

describe("parseAsOf", () => {
  it("returns a valid date that is not after today in Santiago", () => {
    expect(parseAsOf("2026-10-30", NOW)).toBe("2026-10-30");
    expect(parseAsOf("2026-10-15", NOW)).toBe("2026-10-15");
    expect(parseAsOf("2020-01-01", NOW)).toBe("2020-01-01");
  });

  it("rejects a date that is today in UTC but already tomorrow is wrong too", () => {
    // 2026-10-31 is "today" in UTC at NOW but still the future in Santiago.
    expect(() => parseAsOf("2026-10-31", NOW)).toThrowError(
      expect.objectContaining(INVALID),
    );
  });

  it("rejects dates after today", () => {
    expect(() => parseAsOf("2026-11-15", NOW)).toThrowError(
      expect.objectContaining(INVALID),
    );
    expect(() => parseAsOf("2999-01-01", NOW)).toThrowError(
      expect.objectContaining(INVALID),
    );
  });

  it("rejects dates that do not exist on the calendar", () => {
    expect(() => parseAsOf("2026-02-30", NOW)).toThrowError(
      expect.objectContaining(INVALID),
    );
    expect(() => parseAsOf("2025-02-29", NOW)).toThrowError(
      expect.objectContaining(INVALID),
    );
    expect(() => parseAsOf("2026-13-01", NOW)).toThrowError(
      expect.objectContaining(INVALID),
    );
    // 2024 is a leap year: 2024-02-29 does exist.
    expect(parseAsOf("2024-02-29", NOW)).toBe("2024-02-29");
  });

  it("rejects malformed values", () => {
    for (const bad of [
      "",
      "hoy",
      "31-10-2026",
      "2026-1-5",
      "2026-10-30T00:00:00Z",
      " 2026-10-30",
      "2026-10-30 ",
    ])
      expect(() => parseAsOf(bad, NOW)).toThrowError(
        expect.objectContaining(INVALID),
      );
  });

  it("defaults to the current instant", () => {
    expect(parseAsOf("2000-01-01")).toBe("2000-01-01");
  });
});
