import { generateKeyPairSync } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  SECRET_PATTERN,
  artifactPath,
  prepareOutputDirectory,
  readBoundedStream,
  redactText,
  redactValue,
  validateBaseOrigin,
  writeArtifact,
  writeSignedArtifact,
} from "../scripts/lib/demo-output.mjs";

const CANARY = "CANARYSECRET0xDEADBEEF";

let base: string;
let repo: string;

beforeEach(() => {
  base = realpathSync(mkdtempSync(path.join(tmpdir(), "demo-output-")));
  repo = path.join(base, "repo");
  mkdirSync(repo);
  writeFileSync(path.join(repo, "tracked.txt"), "tracked");
});

afterEach(() => {
  rmSync(base, { recursive: true, force: true });
});

function mode(file: string) {
  return statSync(file).mode & 0o777;
}

describe("prepareOutputDirectory", () => {
  const repoUntouched = () => {
    expect(readdirSync(repo)).toEqual(["tracked.txt"]);
    expect(readFileSync(path.join(repo, "tracked.txt"), "utf8")).toBe(
      "tracked",
    );
  };

  it("creates a fresh 0700 directory outside the repo and returns its canonical path", async () => {
    const out = await prepareOutputDirectory(repo, path.join(base, "out"));
    expect(out).toBe(path.join(base, "out"));
    expect(statSync(out).isDirectory()).toBe(true);
    expect(mode(out)).toBe(0o700);
    expect(readdirSync(out)).toEqual([]);
  });

  it("returns the canonical path when the parent is reached through a symlink", async () => {
    const alias = path.join(base, "alias");
    symlinkSync(base, alias);
    const out = await prepareOutputDirectory(repo, path.join(alias, "out"));
    expect(out).toBe(path.join(base, "out"));
  });

  it("rejects the repo itself and a path inside it, leaving the repo untouched", async () => {
    await expect(prepareOutputDirectory(repo, repo)).rejects.toThrow();
    await expect(
      prepareOutputDirectory(repo, path.join(repo, "evidence")),
    ).rejects.toThrow("inside the repo");
    repoUntouched();
  });

  it("rejects a symlinked ancestor that resolves into the repo", async () => {
    const alias = path.join(base, "into-repo");
    symlinkSync(repo, alias);
    await expect(
      prepareOutputDirectory(repo, path.join(alias, "out")),
    ).rejects.toThrow("inside the repo");
    repoUntouched();
  });

  it("rejects a symlink leaf, dangling or not, and never writes through it", async () => {
    const outside = path.join(base, "outside");
    mkdirSync(outside);
    symlinkSync(outside, path.join(base, "leaf"));
    await expect(
      prepareOutputDirectory(repo, path.join(base, "leaf")),
    ).rejects.toThrow("already exists");
    symlinkSync(path.join(base, "nowhere"), path.join(base, "dangling"));
    await expect(
      prepareOutputDirectory(repo, path.join(base, "dangling")),
    ).rejects.toThrow("already exists");
    expect(readdirSync(outside)).toEqual([]);
    expect(existsSync(path.join(base, "nowhere"))).toBe(false);
  });

  it("rejects an existing directory or file instead of reusing it", async () => {
    mkdirSync(path.join(base, "existing"));
    writeFileSync(path.join(base, "file"), "x");
    await expect(
      prepareOutputDirectory(repo, path.join(base, "existing")),
    ).rejects.toThrow("already exists");
    await expect(
      prepareOutputDirectory(repo, path.join(base, "file")),
    ).rejects.toThrow("already exists");
  });

  it("rejects a missing parent without creating it", async () => {
    await expect(
      prepareOutputDirectory(repo, path.join(base, "missing", "out")),
    ).rejects.toThrow("parent does not exist");
    expect(existsSync(path.join(base, "missing"))).toBe(false);
  });

  it("rejects an empty request", async () => {
    await expect(prepareOutputDirectory(repo, "")).rejects.toThrow();
  });
});

describe("artifactPath", () => {
  it("accepts a plain file name", () => {
    expect(artifactPath("/o", "summary.json")).toBe(
      path.join("/o", "summary.json"),
    );
  });

  it.each(["../x", "a/b", "..", ".", "", "a\\b", "/etc/passwd", "x\0y"])(
    "rejects %j",
    (name) => {
      expect(() => artifactPath("/o", name)).toThrow();
    },
  );
});

describe("redaction", () => {
  const publicPem = generateKeyPairSync("ed25519")
    .publicKey.export({ type: "spki", format: "pem" })
    .toString();
  const privatePem = generateKeyPairSync("ed25519")
    .privateKey.export({ type: "pkcs8", format: "pem" })
    .toString();

  const channels: [string, string][] = [
    ["nvapi token", `key nvapi-${CANARY} end`],
    ["sk token", `key sk-${CANARY} end`],
    ["Bearer", `Authorization header Bearer ${CANARY}.abc.def`],
    ["Cookie header", `Cookie: session=${CANARY}; theme=dark`],
    ["Set-Cookie header", `Set-Cookie: sid=${CANARY}; HttpOnly`],
    ["inline assignment", `retry with password=${CANARY} again`],
    ["quoted assignment", `API_KEY: "${CANARY}"`],
    ["JSON-in-text assignment", `{"client_secret": "${CANARY}"}`],
    ["token assignment", `access_token=${CANARY}&x=1`],
    ["private PEM", `${privatePem.replace(/\n.*\n/, `\n${CANARY}\n`)}`],
    ["truncated private PEM", `-----BEGIN PRIVATE KEY-----\nMC4CAQAw${CANARY}`],
    [
      "RSA private PEM",
      `-----BEGIN RSA PRIVATE KEY-----\n${CANARY}\n-----END RSA PRIVATE KEY-----`,
    ],
  ];

  it.each(channels)("redacts a %s in text", (_name, text) => {
    const out = redactText(text);
    expect(out).not.toContain(CANARY);
    expect(out).toContain("[REDACTED]");
  });

  it.each(channels)("flags a %s for DOM masking", (_name, text) => {
    expect(SECRET_PATTERN.test(text)).toBe(true);
  });

  it("redacts recursively in JSON values and sensitive keys", () => {
    const value = redactValue({
      note: `see nvapi-${CANARY}`,
      nested: [{ apiKey: CANARY }, { headers: { Authorization: CANARY } }],
      password: CANARY,
      cookie: CANARY,
      safe: { key_id: "abc123" },
    });
    expect(JSON.stringify(value)).not.toContain(CANARY);
    expect((value as { safe: { key_id: string } }).safe.key_id).toBe("abc123");
  });

  it("keeps public material intact", () => {
    const text = [
      publicPem,
      '{"key_id":"0f3a9c","signature":"deadbeef0123456789abcdef","pack_hash":"3b1f9a","texto_hash":"ffee00"}',
      "RESULTADO: VERIFICADO",
    ].join("\n");
    expect(redactText(text)).toBe(text);
    const json = {
      key_id: "0f3a9c",
      signature: "aGVsbG8=",
      pubkey: publicPem,
      pack_hash: "3b1f9a",
    };
    expect(redactValue(json)).toEqual(json);
  });

  describe("artifact writers", () => {
    let out: string;
    beforeEach(async () => {
      out = await prepareOutputDirectory(repo, path.join(base, "out"));
    });

    it("writes redacted text and JSON as exclusive 0600 files", async () => {
      await writeArtifact(out, "log.txt", `ok nvapi-${CANARY}`);
      await writeArtifact(out, "data.json", {
        a: `Bearer ${CANARY}`,
        token: CANARY,
      });
      for (const name of ["log.txt", "data.json"]) {
        expect(readFileSync(path.join(out, name), "utf8")).not.toContain(
          CANARY,
        );
        expect(mode(path.join(out, name))).toBe(0o600);
      }
      await expect(writeArtifact(out, "log.txt", "again")).rejects.toThrow();
      expect(readFileSync(path.join(out, "log.txt"), "utf8")).toContain("ok ");
    });

    it("refuses path-like names and writes nothing", async () => {
      await expect(writeArtifact(out, "../escape.txt", "x")).rejects.toThrow();
      await expect(writeArtifact(out, "sub/x.txt", "x")).rejects.toThrow();
      expect(readdirSync(out)).toEqual([]);
      expect(existsSync(path.join(base, "escape.txt"))).toBe(false);
    });

    it("does not write through a symlink planted at the target", async () => {
      const victim = path.join(base, "victim.txt");
      writeFileSync(victim, "original");
      symlinkSync(victim, path.join(out, "planted.txt"));
      await expect(writeArtifact(out, "planted.txt", "pwn")).rejects.toThrow();
      expect(readFileSync(victim, "utf8")).toBe("original");
    });

    it("redacts before truncating, whatever the cut point", async () => {
      const text = `password=${CANARY} and nvapi-${CANARY} then Bearer ${CANARY}`;
      for (let cut = 1; cut <= text.length + 1; cut += 1) {
        const name = `cut-${cut}.txt`;
        await writeArtifact(out, name, text, { maxChars: cut });
        const written = readFileSync(path.join(out, name), "utf8");
        expect(written).not.toContain("CANARY");
      }
    });

    it("writes raw bytes unchanged", async () => {
      const bytes = new Uint8Array([137, 80, 78, 71, 0, 1, 2]);
      await writeArtifact(out, "shot.png", bytes);
      expect([...readFileSync(path.join(out, "shot.png"))]).toEqual([...bytes]);
    });

    describe("signed artifacts", () => {
      const commitment = JSON.stringify({
        pack_hash: "3b1f9a",
        citas_verificadas: 5,
      });
      const signature = JSON.stringify({
        key_id: "0f3a9c",
        algorithm: "ed25519",
        signature: "deadbeef0123456789abcdef",
      });

      it("saves the three artifacts byte-for-byte", async () => {
        await writeSignedArtifact(out, "commitment.json", commitment);
        await writeSignedArtifact(out, "commitment.sig.json", signature);
        await writeSignedArtifact(out, "content-signing-key.pub", publicPem);
        expect(readFileSync(path.join(out, "commitment.json"), "utf8")).toBe(
          commitment,
        );
        expect(
          readFileSync(path.join(out, "commitment.sig.json"), "utf8"),
        ).toBe(signature);
        expect(
          readFileSync(path.join(out, "content-signing-key.pub"), "utf8"),
        ).toBe(publicPem);
        expect(mode(path.join(out, "commitment.json"))).toBe(0o600);
      });

      it("refuses content redaction would alter, saving nothing", async () => {
        const tainted = JSON.stringify({ note: `password=${CANARY}` });
        await expect(
          writeSignedArtifact(out, "commitment.json", tainted),
        ).rejects.toThrow("refused");
        await expect(
          writeSignedArtifact(out, "content-signing-key.pub", privatePem),
        ).rejects.toThrow();
        expect(readdirSync(out)).toEqual([]);
      });

      it.each([
        ["an unknown name", "other.json", "{}"],
        ["malformed JSON", "commitment.json", "{nope"],
        ["a JSON array", "commitment.sig.json", "[1]"],
        ["a non-key pub file", "content-signing-key.pub", "hello"],
        [
          "an oversized public key",
          "content-signing-key.pub",
          "x".repeat(20_000),
        ],
      ])("refuses %s", async (_label, name, text) => {
        await expect(writeSignedArtifact(out, name, text)).rejects.toThrow();
        expect(readdirSync(out)).toEqual([]);
      });
    });
  });
});

describe("readBoundedStream", () => {
  it("reads a stream within the cap", async () => {
    const text = await readBoundedStream(Readable.from(["ab", "cd"]), 10);
    expect(text).toBe("abcd");
  });

  it("refuses a stream over the cap", async () => {
    await expect(
      readBoundedStream(Readable.from(["abcdef", "ghijkl"]), 8),
    ).rejects.toThrow("larger than allowed");
  });
});

describe("validateBaseOrigin", () => {
  it.each([
    ["http://localhost:8080", "http://localhost:8080"],
    ["http://localhost:8080/", "http://localhost:8080"],
    ["https://example.com", "https://example.com"],
  ])("accepts %s", (input, origin) => {
    expect(validateBaseOrigin(input)).toBe(origin);
  });

  it.each([
    "http://user:pw@localhost:8080",
    "http://user@localhost:8080",
    "http://localhost:8080?x=1",
    "http://localhost:8080/?x=1",
    "http://localhost:8080#frag",
    "http://localhost:8080/#",
    "http://localhost:8080/app",
    "ftp://localhost",
    "not a url",
    "",
  ])("rejects %j without echoing it", (input) => {
    let message = "";
    try {
      validateBaseOrigin(input);
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain("--base");
    expect(message).not.toContain("pw@");
  });
});

describe("JSON-in-text, escaped keys and artifact allowlist", () => {
  const publicPem = generateKeyPairSync("ed25519")
    .publicKey.export({ type: "spki", format: "pem" })
    .toString();
  let out: string;

  beforeEach(async () => {
    out = await prepareOutputDirectory(repo, path.join(base, "out2"));
  });

  it("redacts quoted cookie and non-Bearer Authorization values in JSON text", () => {
    const text = `{"cookie":"session=${CANARY}","authorization":"Basic ${CANARY}","Set-Cookie":"sid=${CANARY}","x-api-key":"${CANARY}","proxy-authorization":"Basic ${CANARY}"}`;
    const redacted = redactText(text);
    expect(redacted).not.toContain(CANARY);
    expect(SECRET_PATTERN.test(text)).toBe(true);
  });

  it("redacts quoted values that contain escaped quotes", () => {
    const text = `{"cookie":"a=\\"${CANARY}\\"; b=2","note":"kept"}`;
    const redacted = redactText(text);
    expect(redacted).not.toContain(CANARY);
    expect(redacted).toContain('"note":"kept"');
  });

  it("redacts keys that are themselves escaped inside a JSON string", () => {
    const text = `{\\"cookie\\":\\"session=${CANARY}\\"}`;
    expect(redactText(text)).not.toContain(CANARY);
  });

  it.each([
    String.raw`{\"token\":\"${CANARY}\"}`,
    String.raw`{\"apiKey\": \"${CANARY}\"}`,
    String.raw`"{\"password\":\"${CANARY}\"}"`,
    `{"set-cookie":["s=${CANARY}"]}`,
  ])("redacts escaped sensitive values and header arrays: %s", (text) => {
    expect(redactText(text)).not.toContain(CANARY);
    expect(SECRET_PATTERN.test(text)).toBe(true);
  });

  it("redacts a JSON string nested inside another JSON string", () => {
    const value = { str: JSON.stringify(JSON.stringify({ token: CANARY })) };
    expect(JSON.stringify(redactValue(value))).not.toContain(CANARY);
  });

  it("writeArtifact parses .json strings and redacts them recursively", async () => {
    const json = `{"\\u0063ookie":"opaque-${CANARY}","nested":[{"Authorization":"Basic ${CANARY}"}],"key_id":"0f3a9c"}`;
    await writeArtifact(out, "headers.json", json);
    const written = readFileSync(path.join(out, "headers.json"), "utf8");
    expect(written).not.toContain(CANARY);
    expect(JSON.parse(written).key_id).toBe("0f3a9c");
  });

  it("accepts a JSON array root and rejects invalid JSON for .json names", async () => {
    await writeArtifact(out, "threads.json", [{ id: "t1", labels: ["a"] }]);
    await writeArtifact(out, "arr.json", '[{"id":"t1"}]');
    expect(
      JSON.parse(readFileSync(path.join(out, "arr.json"), "utf8")),
    ).toEqual([{ id: "t1" }]);
    await expect(writeArtifact(out, "bad.json", "{nope")).rejects.toThrow(
      "not valid JSON",
    );
    expect(existsSync(path.join(out, "bad.json"))).toBe(false);
  });

  it("writeSignedArtifact refuses escaped-key sensitive JSON and writes nothing", async () => {
    const tainted = `{"\\u0063ookie":"opaque-${CANARY}","key_id":"0f3a9c"}`;
    await expect(
      writeSignedArtifact(out, "commitment.json", tainted),
    ).rejects.toThrow("refused");
    expect(readdirSync(out)).toEqual([]);
  });

  it.each(["toString", "constructor", "__proto__", "hasOwnProperty"])(
    "writeSignedArtifact rejects the inherited name %s",
    async (name) => {
      await expect(writeSignedArtifact(out, name, "{}")).rejects.toThrow(
        "not a signed artifact name",
      );
      expect(readdirSync(out)).toEqual([]);
    },
  );

  it("keeps the three public artifacts byte-identical", async () => {
    const commitment = '{"pack_hash":"3b1f9a","citas_verificadas":5}';
    const signature =
      '{"key_id":"0f3a9c","algorithm":"ed25519","signature":"deadbeef0123456789abcdef"}';
    await writeSignedArtifact(out, "commitment.json", commitment);
    await writeSignedArtifact(out, "commitment.sig.json", signature);
    await writeSignedArtifact(out, "content-signing-key.pub", publicPem);
    expect(readFileSync(path.join(out, "commitment.json"), "utf8")).toBe(
      commitment,
    );
    expect(readFileSync(path.join(out, "commitment.sig.json"), "utf8")).toBe(
      signature,
    );
    expect(
      readFileSync(path.join(out, "content-signing-key.pub"), "utf8"),
    ).toBe(publicPem);
  });

  describe.each([
    "cookie",
    "set-cookie",
    "authorization",
    "proxy-authorization",
    "x-api-key",
    "Proxy-Authorization",
  ])("header key %s", (key) => {
    const value = `opaque-${CANARY}`;

    it("is redacted from an object", async () => {
      await writeArtifact(out, "obj.json", { [key]: value, key_id: "0f3a9c" });
      const written = readFileSync(path.join(out, "obj.json"), "utf8");
      expect(written).not.toContain(CANARY);
      expect(JSON.parse(written).key_id).toBe("0f3a9c");
    });

    it("is redacted from a JSON string", async () => {
      await writeArtifact(out, "str.json", JSON.stringify({ [key]: value }));
      expect(readFileSync(path.join(out, "str.json"), "utf8")).not.toContain(
        CANARY,
      );
    });
  });

  it("truncation marker is ASCII", async () => {
    await writeArtifact(out, "long.txt", "x".repeat(50), { maxChars: 10 });
    const written = readFileSync(path.join(out, "long.txt"), "utf8");
    expect(written.endsWith("\n...[truncated]")).toBe(true);
    expect(/^[\x00-\x7f]*$/.test(written)).toBe(true);
  });
});

describe("readBoundedStream byte accounting", () => {
  it("counts UTF-8 bytes of string chunks, not characters", async () => {
    await expect(readBoundedStream(Readable.from(["éé"]), 3)).rejects.toThrow(
      "larger than allowed",
    );
    expect(await readBoundedStream(Readable.from(["éé"]), 4)).toBe("éé");
  });

  it("counts bytes of Buffer chunks across chunks", async () => {
    const chunks = [Buffer.from("éé"), Buffer.from("é")];
    await expect(readBoundedStream(Readable.from(chunks), 5)).rejects.toThrow(
      "larger than allowed",
    );
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, undefined, "8"])(
    "rejects an invalid limit %s",
    async (limit) => {
      await expect(
        readBoundedStream(Readable.from(["a"]), limit as never),
      ).rejects.toThrow("invalid size limit");
    },
  );
});
