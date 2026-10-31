import {
  actionCallIntent,
  preparedCallNeedsApproval,
} from "@agent-native/core/action";
import { describe, expect, it } from "vitest";

import providerApiRequest, {
  requiresProviderApiApproval,
} from "../actions/provider-api-request.js";

async function needsApproval(args: Record<string, unknown>) {
  const prepared = await actionCallIntent(providerApiRequest, args);
  if (!prepared.valid) throw new Error("fixture arguments must be valid");
  return preparedCallNeedsApproval(providerApiRequest, prepared, {
    caller: "tool",
    userEmail: "lawyer@example.invalid",
  } as never);
}

describe("provider-api-request approval", () => {
  it("requires approval for GET /chat.postMessage and a plain GET read", async () => {
    expect(requiresProviderApiApproval({ method: "GET" })).toBe(true);
    expect(requiresProviderApiApproval({ method: "HEAD" })).toBe(true);
    expect(
      await needsApproval({ method: "GET", path: "/chat.postMessage" }),
    ).toBe(true);
    expect(await needsApproval({ method: "GET", path: "/auth.test" })).toBe(
      true,
    );
  });
});
