import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const factory = vi.hoisted(() => vi.fn(() => ({ plugin: true })));

vi.mock("@agent-native/toolkit/app/auth/server", () => ({
  createToolkitAuthPlugin: factory,
}));

async function load() {
  vi.resetModules();
  return import("../server/plugins/auth.js");
}

describe("auth plugin production guard", () => {
  beforeEach(() => {
    factory.mockClear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each(["true", "1", "TRUE", " True ", " 1 "])(
    "refuses production with AUTH_DISABLED=%j",
    async (value) => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("AUTH_DISABLED", value);
      const error = await load().then(
        () => null,
        (e: Error) => e,
      );
      expect(error?.message).toBe(
        "AUTH_DISABLED must not be set in production.",
      );
      expect(error?.message).not.toContain(value.trim());
      expect(factory).not.toHaveBeenCalled();
    },
  );

  it.each(["false", "0", "", "yes"])(
    "creates the auth plugin in production with AUTH_DISABLED=%j",
    async (value) => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("AUTH_DISABLED", value);
      await load();
      expect(factory).toHaveBeenCalledTimes(1);
    },
  );

  it("creates the auth plugin in production when AUTH_DISABLED is unset", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_DISABLED", undefined);
    await load();
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it.each(["true", "1", undefined])(
    "leaves development unchanged with AUTH_DISABLED=%j",
    async (value) => {
      vi.stubEnv("NODE_ENV", "development");
      vi.stubEnv("AUTH_DISABLED", value);
      await load();
      expect(factory).toHaveBeenCalledTimes(1);
    },
  );

  it.each(["CONTEXT", "VERCEL_ENV"])(
    "refuses AUTH_DISABLED when %s is production",
    async (name) => {
      vi.stubEnv("NODE_ENV", "development");
      vi.stubEnv(name, "production");
      vi.stubEnv("AUTH_DISABLED", "true");
      await expect(load()).rejects.toThrow(
        "AUTH_DISABLED must not be set in production.",
      );
      expect(factory).not.toHaveBeenCalled();
    },
  );

  it("allows AUTH_DISABLED in a deploy preview", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("CONTEXT", "deploy-preview");
    vi.stubEnv("VERCEL_ENV", undefined);
    vi.stubEnv("AUTH_DISABLED", "true");
    await load();
    expect(factory).toHaveBeenCalledTimes(1);
  });
});
