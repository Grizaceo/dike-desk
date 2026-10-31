import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  briefSha256,
  canonicalJson,
  commitmentHash,
} from "../server/lib/brief-hash.js";
import { BRIEF_NORMALIZATION } from "../shared/brief-text.js";

// Hash of tests/fixtures/commitment-sample.json computed with
// python3 -c 'import json,hashlib; c=json.load(open(f)); print(hashlib.sha256(
//   json.dumps(c, ensure_ascii=False, sort_keys=True,
//   separators=(",",":")).encode()).hexdigest())'
// The fixture is real output of `dike constancia --json --emit-commitment`.
const FIXTURE_COMMITMENT_HASH =
  "093651f072e78fa67fd32b53af6355bb5f7a43eefb66a63f77114df5fcb56b07";

describe("normalizeBriefText via briefSha256", () => {
  it("gives the same hash for CRLF and LF line endings", () => {
    expect(briefSha256("línea uno\r\nlínea dos\r\n")).toBe(
      briefSha256("línea uno\nlínea dos"),
    );
    expect(briefSha256("a\rb\rc")).toBe(briefSha256("a\nb\nc"));
  });

  it("gives the same hash with trailing spaces and tabs", () => {
    expect(briefSha256("a   \nb\t\n")).toBe(briefSha256("a\nb"));
  });

  it("gives the same hash for NFC and NFD text", () => {
    expect(briefSha256("artículo".normalize("NFC"))).toBe(
      briefSha256("artículo".normalize("NFD")),
    );
  });

  it("gives the same hash ignoring trailing newlines", () => {
    expect(briefSha256("a\n\n\n")).toBe(briefSha256("a"));
    expect(briefSha256("a\n")).toBe(briefSha256("a"));
  });

  it("changes the hash for any other difference", () => {
    expect(briefSha256("a b")).not.toBe(briefSha256("a  b"));
    expect(briefSha256(" a")).not.toBe(briefSha256("a"));
    expect(briefSha256("a\n\nb")).not.toBe(briefSha256("a\nb"));
    expect(briefSha256("a\nb")).not.toBe(briefSha256("a\nx"));
  });
});

describe("canonicalJson", () => {
  it("serializes like Python's sorted, compact, ensure_ascii=False dumps", () => {
    expect(
      canonicalJson({
        b: 1,
        á: "eñe",
        a: { d: [true, null, "x"], c: { z: 0, y: "último" } },
      }),
    ).toBe(
      '{"a":{"c":{"y":"último","z":0},"d":[true,null,"x"]},"b":1,"á":"eñe"}',
    );
  });

  it("throws on non-integer or non-finite numbers and undefined", () => {
    for (const bad of [1.5, Number.NaN, Number.POSITIVE_INFINITY, undefined])
      expect(() => canonicalJson(bad)).toThrow();
    expect(() => canonicalJson({ a: 0.1 })).toThrow();
    expect(() => canonicalJson({ a: undefined })).toThrow();
  });
});

describe("commitmentHash", () => {
  it("matches the engine's canonical hash of a real commitment", () => {
    const commitment = JSON.parse(
      readFileSync(
        path.join(__dirname, "fixtures", "commitment-sample.json"),
        "utf8",
      ),
    );
    expect(commitmentHash(commitment)).toBe(FIXTURE_COMMITMENT_HASH);
  });
});

describe("BRIEF_NORMALIZATION", () => {
  it("is the v1 id the certificate and the python verifier share", () => {
    expect(BRIEF_NORMALIZATION).toBe("dike-desk-texto-v1");
  });
});
