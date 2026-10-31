import { createHash } from "node:crypto";

import { normalizeBriefText } from "../../shared/brief-text.js";

/** SHA-256 (lowercase hex) of the UTF-8 bytes of the normalized brief text. */
export function briefSha256(body: string) {
  return createHash("sha256")
    .update(normalizeBriefText(body), "utf8")
    .digest("hex");
}

/**
 * The canonical JSON the engine hashes and signs:
 * Python `json.dumps(value, ensure_ascii=False, sort_keys=True,
 * separators=(",", ":"))`. Keys sort recursively by UTF-16 code unit order,
 * which matches Python's code-point order for every key these payloads use.
 */
export function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  switch (typeof value) {
    case "boolean":
      return value ? "true" : "false";
    case "string":
      return JSON.stringify(value);
    case "number":
      if (!Number.isFinite(value))
        throw new Error("canonicalJson: non-finite number");
      if (!Number.isInteger(value))
        throw new Error("canonicalJson: non-integer number");
      return String(value);
    case "object": {
      if (Array.isArray(value))
        return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
      const entries = Object.keys(value as Record<string, unknown>)
        .sort()
        .map(
          (key) =>
            `${JSON.stringify(key)}:${canonicalJson(
              (value as Record<string, unknown>)[key],
            )}`,
        );
      return `{${entries.join(",")}}`;
    }
    default:
      throw new Error(`canonicalJson: unsupported value (${typeof value})`);
  }
}

/** SHA-256 (lowercase hex) of canonicalJson(commitment) — the seal's hash. */
export function commitmentHash(commitment: unknown) {
  return createHash("sha256")
    .update(canonicalJson(commitment), "utf8")
    .digest("hex");
}
