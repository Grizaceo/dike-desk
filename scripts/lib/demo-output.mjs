import { constants } from "node:fs";
import { chmod, lstat, mkdir, open, realpath } from "node:fs/promises";
import path from "node:path";

const REDACTED = "[REDACTED]";

export const SIGNED_ARTIFACTS = Object.freeze({
  "commitment.json": 8 * 1024 * 1024,
  "commitment.sig.json": 8 * 1024 * 1024,
  "content-signing-key.pub": 16 * 1024,
});

const HEADER_KEYS =
  "set-cookie|cookie|authorization|proxy-authorization|x-api-key";

const SENSITIVE_NAME =
  "[A-Za-z0-9_.-]*(?:api[_-]?key|secret|passw(?:or)?d|token|credential|private[_-]?key)[A-Za-z0-9_.-]*";
const SENSITIVE_KEY = new RegExp(
  `^${SENSITIVE_NAME}$|^(?:${HEADER_KEYS})$`,
  "i",
);

const PATTERNS = [
  {
    re: /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z0-9 ]*PRIVATE KEY-----|$)/g,
    to: REDACTED,
  },
  { re: /\bnvapi-[A-Za-z0-9_-]+/g, to: REDACTED },
  { re: /\bsk-[A-Za-z0-9_-]{6,}/g, to: REDACTED },
  { re: /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, to: `Bearer ${REDACTED}` },
  {
    re: new RegExp(
      `(\\\\?["'](?:${HEADER_KEYS})\\\\?["']\\s*:\\s*)(?:\\[[^\\]]*\\]|"(?:[^"\\\\]|\\\\.)*"|'(?:[^'\\\\]|\\\\.)*'|\\\\"(?:[^\\\\]|\\\\(?!"))*\\\\")`,
      "gi",
    ),
    to: `$1"${REDACTED}"`,
  },
  {
    re: /\b(set-cookie|cookie|authorization|proxy-authorization|x-api-key)(\s*[:=]\s*)[^\r\n]*/gi,
    to: `$1$2${REDACTED}`,
  },
  {
    re: new RegExp(
      `\\b(${SENSITIVE_NAME})(\\\\?["']?\\s*[=:]\\s*)(?:\\[[^\\]]*\\]|\\\\"(?:[^\\\\]|\\\\(?!"))*\\\\"|"(?:[^"\\\\]|\\\\.)*"|'(?:[^'\\\\]|\\\\.)*'|[^\\s,;&"']+)`,
      "gi",
    ),
    to: `$1$2${REDACTED}`,
  },
];

/** Case-insensitive test of every credential shape, for DOM masking. */
export const SECRET_PATTERN = new RegExp(
  PATTERNS.map(({ re }) => `(?:${re.source})`).join("|"),
  "i",
);

export function redactText(text) {
  let out = String(text);
  for (const { re, to } of PATTERNS) out = out.replace(re, to);
  return out;
}

export function redactValue(value) {
  if (typeof value === "string") return redactText(value);
  if (Array.isArray(value)) return value.map(redactValue);
  if (value && typeof value === "object") {
    const out = {};
    for (const [key, inner] of Object.entries(value)) {
      out[redactText(key)] =
        SENSITIVE_KEY.test(key) && inner !== null && inner !== undefined
          ? REDACTED
          : redactValue(inner);
    }
    return out;
  }
  return value;
}

/** Canonical path of a NEW 0700 directory outside the repo. */
export async function prepareOutputDirectory(repoRoot, requested) {
  if (typeof requested !== "string" || !requested)
    throw new Error("--out is required");
  const resolved = path.resolve(requested);
  const name = path.basename(resolved);
  if (!name || name === "." || name === "..")
    throw new Error("--out must name a new directory");
  let parent;
  try {
    parent = await realpath(path.dirname(resolved));
  } catch {
    throw new Error("--out parent does not exist");
  }
  const repo = await realpath(repoRoot);
  const target = path.join(parent, name);
  if (target === repo || target.startsWith(repo + path.sep))
    throw new Error("refusing to write artifacts inside the repo");
  try {
    await mkdir(target, { mode: 0o700 });
  } catch (error) {
    if (error?.code === "EEXIST")
      throw new Error("--out already exists; choose a new directory");
    throw new Error("could not create --out");
  }
  const info = await lstat(target);
  if (!info.isDirectory() || info.isSymbolicLink())
    throw new Error("could not create --out");
  await chmod(target, 0o700);
  return target;
}

/** `out/filename` for a single safe basename; anything else throws. */
export function artifactPath(out, filename) {
  if (
    typeof filename !== "string" ||
    !filename ||
    filename === "." ||
    filename === ".." ||
    filename.includes("/") ||
    filename.includes("\\") ||
    filename.includes("\0") ||
    path.basename(filename) !== filename
  )
    throw new Error("artifact name must be a plain file name");
  return path.join(out, filename);
}

async function writeExclusive(file, data) {
  const handle = await open(
    file,
    constants.O_WRONLY |
      constants.O_CREAT |
      constants.O_EXCL |
      (constants.O_NOFOLLOW ?? 0),
    0o600,
  );
  try {
    await handle.writeFile(data);
  } finally {
    await handle.close();
  }
}

/**
 * Write text, JSON (recursively redacted) or raw bytes as a new 0600 file.
 * Text is redacted before `maxChars` truncation.
 */
export async function writeArtifact(out, filename, content, options = {}) {
  const file = artifactPath(out, filename);
  if (content instanceof Uint8Array) return writeExclusive(file, content);
  let text;
  if (typeof content === "string" && !filename.endsWith(".json")) {
    text = redactText(content);
  } else {
    let value = content;
    if (typeof content === "string") {
      try {
        value = JSON.parse(content);
      } catch {
        throw new Error("JSON artifact is not valid JSON");
      }
    }
    text = JSON.stringify(redactValue(value), null, 2);
  }
  if (options.maxChars && text.length > options.maxChars)
    text = `${text.slice(0, options.maxChars)}\n...[truncated]`;
  return writeExclusive(file, text);
}

/** Collect a stream into a string, refusing anything over `maxBytes`. */
export async function readBoundedStream(stream, maxBytes) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0)
    throw new Error("invalid size limit");
  const chunks = [];
  let total = 0;
  for await (const chunk of stream) {
    const bytes = Buffer.from(chunk);
    total += bytes.byteLength;
    if (total > maxBytes) {
      stream.destroy?.();
      throw new Error("artifact is larger than allowed");
    }
    chunks.push(bytes);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/** Save one of the three signed artifacts verbatim, or refuse it. */
export async function writeSignedArtifact(out, filename, text) {
  if (!Object.hasOwn(SIGNED_ARTIFACTS, filename))
    throw new Error("not a signed artifact name");
  const cap = SIGNED_ARTIFACTS[filename];
  if (typeof text !== "string" || Buffer.byteLength(text, "utf8") > cap)
    throw new Error("signed artifact is missing or too large");
  if (filename.endsWith(".json")) {
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error("signed artifact is not valid JSON");
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      throw new Error("signed artifact is not a JSON object");
    if (JSON.stringify(redactValue(parsed)) !== JSON.stringify(parsed))
      throw new Error(
        "signed artifact contains secret-shaped content; refused",
      );
  } else if (!text.includes("-----BEGIN PUBLIC KEY-----")) {
    throw new Error("signed artifact is not a public key");
  }
  if (redactText(text) !== text)
    throw new Error("signed artifact contains secret-shaped content; refused");
  return writeExclusive(artifactPath(out, filename), text);
}

/** Origin of an http(s) base URL with no credentials, path, query or fragment. */
export function validateBaseOrigin(value) {
  let url;
  try {
    url = new URL(String(value));
  } catch {
    throw new Error("--base must be an http(s) origin");
  }
  const raw = String(value);
  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username ||
    url.password ||
    raw.includes("?") ||
    raw.includes("#") ||
    url.pathname !== "/"
  )
    throw new Error("--base must be an http(s) origin");
  return url.origin;
}
