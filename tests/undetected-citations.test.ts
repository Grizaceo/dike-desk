import { describe, expect, it } from "vitest";

import { findUndetectedCitations } from "../app/lib/brief-review.js";

const BODY =
  "Invoca el art. 161 del Código del Trabajo y el artículo 5 del Código Civil.";

function span(raw: string, body = BODY) {
  const start = body.indexOf(raw);
  return { raw, start, end: start + raw.length };
}

describe("findUndetectedCitations (RJ-24)", () => {
  it("reports nothing when every mention is a detected citation", () => {
    const citations = [span("art. 161"), span("artículo 5")];
    expect(findUndetectedCitations(BODY, citations)).toEqual([]);
  });

  it("finds an extra mention the engine did not report", () => {
    const body = `${BODY} También el art. 7 del Código Procesal.`;
    const citations = [span("art. 161", body), span("artículo 5", body)];
    expect(findUndetectedCitations(body, citations)).toEqual([
      expect.objectContaining({ text: "art. 7" }),
    ]);
  });

  it("does not flag a mention inside a wider detected span", () => {
    const body =
      "El artículo 161 del Código del Trabajo regula el despido por necesidades.";
    const raw = "artículo 161 del Código del Trabajo";
    const citations = [span(raw, body)];
    expect(findUndetectedCitations(body, citations)).toEqual([]);
  });

  it("does not flag a mention inside an unlocated citation's raw", () => {
    const body = `${BODY} Y el artículo 55 del Código Penal.`;
    const citations = [
      span("art. 161", body),
      span("artículo 5", body),
      { raw: "artículo 55 del Código Penal", start: -1, end: -1 },
    ];
    expect(findUndetectedCitations(body, citations)).toEqual([]);
  });

  it("respects word boundaries", () => {
    expect(findUndetectedCitations("particular 5", [])).toEqual([]);
    expect(findUndetectedCitations("Xartículo 5", [])).toEqual([]);
  });
});
