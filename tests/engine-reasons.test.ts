import { describe, expect, it } from "vitest";

import { engineReasonKeys } from "../app/lib/brief-review.js";

type C = Parameters<typeof engineReasonKeys>[0];

function c(partial: Partial<C>): C {
  return {
    status: "refused",
    resolution: null,
    vigencia: null,
    historicalTextState: null,
    ...partial,
  } as C;
}

describe("engineReasonKeys (RJ-10/RJ-11)", () => {
  it("maps each resolution to its sentence for non-verified citations", () => {
    expect(engineReasonKeys(c({ resolution: "AMBIGUOUS" }))).toEqual([
      "reason.ambiguous",
    ]);
    expect(engineReasonKeys(c({ resolution: "UNRESOLVABLE" }))).toEqual([
      "reason.unresolvable",
    ]);
    expect(engineReasonKeys(c({ resolution: "RESOLVED" }))).toEqual([
      "reason.resolvedNotVerified",
    ]);
  });

  it("maps vigencia codes and historical text state, in order", () => {
    expect(
      engineReasonKeys(
        c({ resolution: "UNRESOLVABLE", vigencia: "OUT_OF_FORCE" }),
      ),
    ).toEqual(["reason.unresolvable", "vigencia.outOfForce"]);
    expect(engineReasonKeys(c({ vigencia: "IN_FORCE" }))).toEqual([
      "vigencia.inForce",
    ]);
    expect(
      engineReasonKeys(c({ vigencia: "UNKNOWN_BEFORE_SNAPSHOT" })),
    ).toEqual(["vigencia.unknownBeforeSnapshot"]);
    expect(engineReasonKeys(c({ vigencia: "DESCONOCIDO" }))).toEqual([
      "vigencia.desconocido",
    ]);
    expect(
      engineReasonKeys(
        c({
          resolution: "RESOLVED",
          vigencia: "UNKNOWN_BEFORE_SNAPSHOT",
          historicalTextState: "HISTORICAL_TEXT_UNAVAILABLE",
        }),
      ),
    ).toEqual([
      "reason.resolvedNotVerified",
      "vigencia.unknownBeforeSnapshot",
      "historical.unavailable",
    ]);
  });

  it("yields no keys for unknown codes", () => {
    expect(
      engineReasonKeys(
        c({
          resolution: "WHATEVER",
          vigencia: "SOME_CODE",
          historicalTextState: "OTHER",
        }),
      ),
    ).toEqual([]);
  });

  it("skips resolution sentences on verified citations", () => {
    expect(
      engineReasonKeys(
        c({ status: "verified", resolution: "EXACT", vigencia: "IN_FORCE" }),
      ),
    ).toEqual(["vigencia.inForce"]);
  });
});
