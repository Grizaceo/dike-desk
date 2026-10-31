import { describe, expect, it } from "vitest";

import { actionErrorText } from "../app/lib/brief-review.js";

function recorder() {
  const keys: string[] = [];
  const t = (key: string) => {
    keys.push(key);
    return `<${key}>`;
  };
  return { t, keys };
}

describe("actionErrorText (RJ-20)", () => {
  it("maps a known errorCode to its errors.* catalog key", () => {
    const { t, keys } = recorder();
    const text = actionErrorText(
      t,
      { errorCode: "dike_failed", actionMessage: "engine blew up" },
      "brief.verifyFailed",
    );
    expect(keys).toEqual(["errors.dike_failed"]);
    expect(text).toBe("<errors.dike_failed>");
  });

  it("falls back to the caller's key for unknown codes", () => {
    const { t, keys } = recorder();
    actionErrorText(
      t,
      { errorCode: "ui_only", actionMessage: "nope" },
      "brief.commitFailed",
    );
    expect(keys).toEqual(["brief.commitFailed"]);
  });

  it("falls back when there is no code and never shows the raw message", () => {
    const { t, keys } = recorder();
    const text = actionErrorText(
      t,
      { actionMessage: "raw server detail" },
      "brief.saveFailed",
    );
    expect(keys).toEqual(["brief.saveFailed"]);
    expect(text).not.toContain("raw server detail");
  });
});
