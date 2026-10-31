import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("netlify.toml", () => {
  const toml = readFileSync("netlify.toml", "utf8");

  it("does not trust the template hosts or ship the template analytics ids", () => {
    expect(toml).not.toContain("BETTER_AUTH_TRUSTED_ORIGINS");
    expect(toml).not.toContain("starter.agent-native.com");
    expect(toml).not.toContain("chat.agent-native.com");
    expect(toml).not.toContain("GA_MEASUREMENT_ID");
    expect(toml).not.toContain("GTM_CONTAINER_ID");
    expect(toml).not.toMatch(/G-ESF7FYXGN9|GTM-N3WSTXZ/);
  });
});
