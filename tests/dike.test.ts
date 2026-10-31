import { generateKeyPairSync } from "node:crypto";
import {
  mkdtempSync,
  readFileSync,
  existsSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const holder = vi.hoisted(() => ({
  calls: [] as {
    cmd: string;
    args: string[];
    options: { env?: NodeJS.ProcessEnv };
  }[],
  handler: null as
    | null
    | ((
        cmd: string,
        args: string[],
      ) => {
        code?: number;
        stdout?: string;
        stderr?: string;
      }),
}));

vi.mock("node:child_process", () => ({
  execFile: (
    cmd: string,
    args: string[],
    options: { env?: NodeJS.ProcessEnv },
    callback: (error: Error | null, stdout: string, stderr: string) => void,
  ) => {
    holder.calls.push({ cmd, args, options });
    const reply = holder.handler!(cmd, args);
    const code = reply.code ?? 0;
    const error = code
      ? Object.assign(new Error("exec failed"), { code })
      : null;
    callback(error, reply.stdout ?? "", reply.stderr ?? "");
  },
}));

const CANARY = "CANARY-SECRET-0xDEADBEEF";
const IMAGE = "dike:test";
const ROOTLESS = JSON.stringify([
  "name=seccomp,profile=builtin",
  "name=rootless",
  "name=cgroupns",
]);
const ROOTFUL = JSON.stringify(["name=seccomp,profile=builtin"]);

const ENGINE_JSON = JSON.stringify({
  veredicto: "TODAS_VERIFICADAS",
  mensaje: "ok",
  alcance: "test",
  problemas: [],
  detalles: [],
  meta: {
    as_of: "2026-10-30",
    fecha_constancia: "2026-10-30",
    pack_hash: "TEST_ONLY",
    total_citas: 0,
    citas_verificadas: 0,
    citas_fallidas: 0,
  },
});

const BODY = "Cuerpo del escrito con art. 161 CT. SECRETO-DEL-ESCRITO";

const scratch: string[] = [];
function scratchDir() {
  const dir = mkdtempSync(path.join(tmpdir(), "dike-test-"));
  scratch.push(dir);
  return dir;
}

function mountedWork(args: string[]) {
  const mount = args[args.indexOf("--mount") + 1];
  return /source=([^,]+),/.exec(mount)![1];
}

function runCalls() {
  return holder.calls.filter((c) => c.args[0] === "run");
}

function mode(file: string) {
  return statSync(file).mode & 0o777;
}

async function load() {
  vi.resetModules();
  return import("../server/lib/dike.js");
}

function engine(
  info: { code?: number; stdout?: string; stderr?: string },
  run: (
    work: string,
    args: string[],
  ) => { code?: number; stdout?: string; stderr?: string } | void,
) {
  holder.handler = (cmd, args) => {
    if (cmd === "docker" && args[0] === "info") return info;
    const work = cmd === "docker" ? mountedWork(args) : path.dirname(args[1]);
    return run(work, args) ?? { stdout: ENGINE_JSON };
  };
}

async function failure(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return error as {
      message: string;
      errorCode?: string;
      statusCode?: number;
    };
  }
  throw new Error("expected the call to fail");
}

describe("runConstancia", () => {
  let seenWorkDirs: string[];
  let errorLog: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    holder.calls = [];
    seenWorkDirs = [];
    vi.stubEnv("DIKE_DOCKER_IMAGE", IMAGE);
    vi.stubEnv("DIKE_BIN", undefined);
    errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    for (const dir of scratch.splice(0))
      rmSync(dir, { recursive: true, force: true });
  });

  describe("docker command", () => {
    it("rootless: runs as 0:0, offline, never pulls, with only HOME in env", async () => {
      engine({ stdout: ROOTLESS }, (_work, args) => {
        seenWorkDirs.push(mountedWork(args));
      });
      const { runConstancia } = await load();
      await runConstancia(BODY);
      const [call] = runCalls();
      expect(call.cmd).toBe("docker");
      expect(call.args.slice(0, 2)).toEqual(["run", "--rm"]);
      expect(call.args).toContain("--pull=never");
      expect(call.args[call.args.indexOf("--network") + 1]).toBe("none");
      expect(call.args[call.args.indexOf("--user") + 1]).toBe("0:0");
      const envs = call.args.flatMap((a, i) =>
        call.args[i - 1] === "--env" ? [a] : [],
      );
      expect(envs).toEqual(["HOME=/home/dike"]);
      expect(call.args).not.toContain("--privileged");
      expect(call.args.some((a) => a.startsWith("--cap-add"))).toBe(false);
    });

    it("rootful: runs as the host uid:gid", async () => {
      engine({ stdout: ROOTFUL }, () => undefined);
      const { runConstancia } = await load();
      await runConstancia(BODY);
      const [call] = runCalls();
      expect(call.args[call.args.indexOf("--user") + 1]).toBe(
        `${process.getuid!()}:${process.getgid!()}`,
      );
    });

    it("rootful without getuid (Docker Desktop on Windows): 0:0", async () => {
      const original = process.getuid;
      Object.defineProperty(process, "getuid", {
        value: undefined,
        configurable: true,
      });
      try {
        engine({ stdout: ROOTFUL }, () => undefined);
        const { runConstancia } = await load();
        await runConstancia(BODY);
        const [call] = runCalls();
        expect(call.args[call.args.indexOf("--user") + 1]).toBe("0:0");
      } finally {
        Object.defineProperty(process, "getuid", {
          value: original,
          configurable: true,
        });
      }
    });

    it("caches the security mode for the process", async () => {
      engine({ stdout: ROOTLESS }, () => undefined);
      const { runConstancia } = await load();
      await runConstancia(BODY);
      await runConstancia(BODY);
      expect(holder.calls.filter((c) => c.args[0] === "info")).toHaveLength(1);
    });

    it("fails closed when the security mode cannot be determined", async () => {
      engine({ code: 1, stderr: CANARY }, () => undefined);
      const { runConstancia } = await load();
      const error = await failure(runConstancia(BODY));
      expect(error).toMatchObject({
        errorCode: "dike_docker_unavailable",
        statusCode: 503,
      });
      expect(error.message).not.toContain(CANARY);
      expect(runCalls()).toHaveLength(0);
    });

    it("fails closed on unexpected security output", async () => {
      engine({ stdout: "not json" }, () => undefined);
      const { runConstancia } = await load();
      await expect(runConstancia(BODY)).rejects.toMatchObject({
        errorCode: "dike_docker_unavailable",
      });
      expect(runCalls()).toHaveLength(0);
    });

    it("mounts only its temp dir and passes the body as a file, not argv", async () => {
      let observed: {
        work: string;
        workMode: number;
        briefMode: number;
        briefText: string;
      } | null = null;
      engine({ stdout: ROOTLESS }, (work) => {
        observed = {
          work,
          workMode: mode(work),
          briefMode: mode(path.join(work, "brief.md")),
          briefText: readFileSync(path.join(work, "brief.md"), "utf8"),
        };
      });
      const { runConstancia } = await load();
      await runConstancia(BODY);
      const [call] = runCalls();
      expect(call.args.filter((a) => a === "--mount")).toHaveLength(1);
      expect(call.args.some((a) => a.includes("SECRETO-DEL-ESCRITO"))).toBe(
        false,
      );
      expect(call.args.some((a) => a === "-v" || a === "--volume")).toBe(false);
      expect(observed!.work.startsWith(tmpdir())).toBe(true);
      expect(observed!.workMode).toBe(0o700);
      expect(observed!.briefMode).toBe(0o600);
      expect(observed!.briefText).toBe(BODY);
    });

    it("emitting precreates a private out dir and never makes anything world-accessible", async () => {
      let outMode = -1;
      let workMode = -1;
      engine({ stdout: ROOTLESS }, (work) => {
        outMode = mode(path.join(work, "out"));
        workMode = mode(work);
      });
      const { runConstancia } = await load();
      await runConstancia(BODY, { emitCommitment: true });
      expect(outMode).toBe(0o700);
      expect(workMode).toBe(0o700);
      const [call] = runCalls();
      expect(call.args).toContain("--emit-commitment");
      expect(call.args).not.toContain("--sign");
    });
  });

  describe("local binary", () => {
    it("runs DIKE_BIN directly with a private out dir", async () => {
      vi.stubEnv("DIKE_DOCKER_IMAGE", undefined);
      vi.stubEnv("DIKE_BIN", "/opt/dike/bin/dike");
      let outMode = -1;
      engine({}, (work) => {
        outMode = mode(path.join(work, "out"));
      });
      const { runConstancia } = await load();
      await runConstancia(BODY, { emitCommitment: true });
      expect(holder.calls).toHaveLength(1);
      expect(holder.calls[0].cmd).toBe("/opt/dike/bin/dike");
      expect(outMode).toBe(0o700);
    });

    it("passes only engine and runtime environment variables to the local binary", async () => {
      vi.stubEnv("DIKE_DOCKER_IMAGE", undefined);
      vi.stubEnv("DIKE_BIN", "/opt/dike/bin/dike");
      vi.stubEnv("OPENAI_API_KEY", CANARY);
      vi.stubEnv("BETTER_AUTH_SECRET", CANARY);
      vi.stubEnv("DATABASE_URL", CANARY);
      vi.stubEnv("PATH", "/synthetic/bin");
      vi.stubEnv("LEXO_CONTENT_SIGNING_KEY_PATH", "/synthetic/key");
      vi.stubEnv("DIKE_VAULT_ROOT", "/synthetic/vault");
      engine({}, () => ({ stdout: ENGINE_JSON }));
      const { runConstancia } = await load();
      await runConstancia(BODY);
      const env = holder.calls[0].options.env!;
      expect(env.PATH).toBe("/synthetic/bin");
      expect(env.LEXO_CONTENT_SIGNING_KEY_PATH).toBe("/synthetic/key");
      expect(env.DIKE_VAULT_ROOT).toBe("/synthetic/vault");
      expect(env.OPENAI_API_KEY).toBeUndefined();
      expect(env.BETTER_AUTH_SECRET).toBeUndefined();
      expect(env.DATABASE_URL).toBeUndefined();
      expect(
        Object.keys(env).every(
          (key) =>
            [
              "PATH",
              "HOME",
              "LANG",
              "LANGUAGE",
              "TZ",
              "TMPDIR",
              "VIRTUAL_ENV",
            ].includes(key) || /^(LC_|PYTHON|DIKE_|LEXO_)/.test(key),
        ),
      ).toBe(true);
    });
  });

  describe("exit codes and output", () => {
    it.each([0, 1])("accepts engine exit %i with valid JSON", async (code) => {
      engine({ stdout: ROOTLESS }, () => ({ code, stdout: ENGINE_JSON }));
      const { runConstancia } = await load();
      const run = await runConstancia(BODY);
      expect(run.result.veredicto).toBe("TODAS_VERIFICADAS");
      expect(run.commitment).toBeNull();
      expect(run.pubkey).toBeNull();
    });

    it("exit 2 reports only the exit code, never stderr or logs it", async () => {
      engine({ stdout: ROOTLESS }, () => ({
        code: 2,
        stderr: `trace ${CANARY} from ${BODY}`,
      }));
      const { runConstancia } = await load();
      const error = await failure(runConstancia(BODY));
      expect(error).toMatchObject({
        errorCode: "dike_failed",
        statusCode: 502,
      });
      expect(error.message).toBe("Diké engine failed (exit 2).");
      expect(JSON.stringify(errorLog.mock.calls)).not.toContain(CANARY);
    });

    it.each([
      ["not json", "<html>"],
      ["a JSON array", "[]"],
      ["a JSON string", '"ok"'],
      ["an object without detalles", "{}"],
    ])("rejects stdout that is %s", async (_label, stdout) => {
      engine({ stdout: ROOTLESS }, () => ({ stdout }));
      const { runConstancia } = await load();
      await expect(runConstancia(BODY)).rejects.toMatchObject({
        errorCode: "dike_bad_output",
        statusCode: 502,
      });
    });

    it.each([
      [
        "missing verdict",
        (result: any) => {
          delete result.veredicto;
        },
      ],
      [
        "unknown verdict",
        (result: any) => {
          result.veredicto = "UNKNOWN";
        },
      ],
      [
        "non-string citation",
        (result: any) => {
          result.detalles = [{ cita_raw: 42, estado: "FALLO" }];
        },
      ],
      [
        "counter mismatch",
        (result: any) => {
          result.meta.total_citas = 1;
        },
      ],
    ])("rejects %s", async (_label, mutate) => {
      const result = JSON.parse(ENGINE_JSON);
      mutate(result);
      engine({ stdout: ROOTLESS }, () => ({ stdout: JSON.stringify(result) }));
      const { runConstancia } = await load();
      await expect(runConstancia(BODY)).rejects.toMatchObject({
        errorCode: "dike_bad_output",
        statusCode: 502,
      });
    });

    it("accepts SIN_CITAS without optional fields and strips document paths", async () => {
      const result = JSON.parse(ENGINE_JSON);
      result.veredicto = "SIN_CITAS";
      delete result.alcance;
      delete result.problemas;
      delete result.meta.total_citas;
      delete result.meta.citas_verificadas;
      delete result.meta.citas_fallidas;
      result.meta.documento = "/tmp/synthetic-brief.md";
      result.meta.origen = "synthetic";
      engine({ stdout: ROOTLESS }, () => ({ stdout: JSON.stringify(result) }));
      const { runConstancia } = await load();
      const { result: parsed } = await runConstancia(BODY);
      expect(parsed.veredicto).toBe("SIN_CITAS");
      expect(parsed.problemas).toEqual([]);
      expect(parsed.meta).toMatchObject({
        total_citas: 0,
        citas_verificadas: 0,
        citas_fallidas: 0,
      });
      expect(parsed.meta).not.toHaveProperty("documento");
      expect(parsed.meta).not.toHaveProperty("origen");
    });

    it("normalizes missing counters and accepts nullish detail fields", async () => {
      const result = JSON.parse(ENGINE_JSON);
      result.veredicto = "CON_PROBLEMAS";
      result.detalles = [
        { cita_raw: "art. 1", estado: "VERIFICADA", gid: null },
        { cita_raw: "art. 2", estado: "FALLO", cuerpo: null, fuente_url: "" },
      ];
      delete result.meta.total_citas;
      delete result.meta.citas_verificadas;
      delete result.meta.citas_fallidas;
      engine({ stdout: ROOTLESS }, () => ({ stdout: JSON.stringify(result) }));
      const { runConstancia } = await load();
      const { result: parsed } = await runConstancia(BODY);
      expect(parsed.meta).toMatchObject({
        total_citas: 2,
        citas_verificadas: 1,
        citas_fallidas: 1,
      });
      expect(parsed.detalles[0].gid).toBeNull();
    });
  });

  describe("temp dir cleanup", () => {
    it("removes the work dir after success", async () => {
      let work = "";
      engine({ stdout: ROOTLESS }, (dir) => {
        work = dir;
      });
      const { runConstancia } = await load();
      await runConstancia(BODY);
      expect(existsSync(work)).toBe(false);
    });

    it("removes the work dir after a failure", async () => {
      let work = "";
      engine({ stdout: ROOTLESS }, (dir) => {
        work = dir;
        return { code: 2, stderr: CANARY };
      });
      const { runConstancia } = await load();
      await failure(runConstancia(BODY));
      expect(existsSync(work)).toBe(false);
    });
  });

  describe("commitment outputs", () => {
    function emitWith(write: (out: string) => void) {
      engine({ stdout: ROOTLESS }, (work) => {
        write(path.join(work, "out"));
      });
    }

    it("reads the commitment, signature and a normalized Ed25519 public key", async () => {
      const { publicKey } = generateKeyPairSync("ed25519");
      const pem = publicKey.export({ type: "spki", format: "pem" }).toString();
      emitWith((out) => {
        writeFileSync(path.join(out, "commitment.json"), '{"a":1}');
        writeFileSync(path.join(out, "commitment.sig.json"), '{"s":"x"}');
        writeFileSync(path.join(out, "content-signing-key.pub"), `\n${pem}\n`);
      });
      const { runConstancia } = await load();
      const run = await runConstancia(BODY, { emitCommitment: true });
      expect(run.commitment).toEqual({ a: 1 });
      expect(run.signature).toEqual({ s: "x" });
      expect(run.pubkey).toBe(pem);
    });

    it("returns null for optional files that are absent", async () => {
      emitWith((out) => {
        writeFileSync(path.join(out, "commitment.json"), '{"a":1}');
      });
      const { runConstancia } = await load();
      const run = await runConstancia(BODY, { emitCommitment: true });
      expect(run.signature).toBeNull();
      expect(run.pubkey).toBeNull();
    });

    it("rejects a private key even though crypto could derive the public one", async () => {
      const { privateKey } = generateKeyPairSync("ed25519");
      const pem = privateKey
        .export({ type: "pkcs8", format: "pem" })
        .toString();
      emitWith((out) => {
        writeFileSync(path.join(out, "content-signing-key.pub"), pem);
      });
      const { runConstancia } = await load();
      const error = await failure(
        runConstancia(BODY, { emitCommitment: true }),
      );
      expect(error).toMatchObject({ errorCode: "dike_bad_output" });
      expect(error.message).not.toContain("PRIVATE");
    });

    it("rejects a public key that is not Ed25519", async () => {
      const { publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
      emitWith((out) => {
        writeFileSync(
          path.join(out, "content-signing-key.pub"),
          publicKey.export({ type: "spki", format: "pem" }),
        );
      });
      const { runConstancia } = await load();
      await expect(
        runConstancia(BODY, { emitCommitment: true }),
      ).rejects.toMatchObject({ errorCode: "dike_bad_output" });
    });

    it("rejects a public key file that is not a key", async () => {
      emitWith((out) => {
        writeFileSync(path.join(out, "content-signing-key.pub"), "hello");
      });
      const { runConstancia } = await load();
      await expect(
        runConstancia(BODY, { emitCommitment: true }),
      ).rejects.toMatchObject({ errorCode: "dike_bad_output" });
    });

    it.each([
      ["malformed JSON", "{nope"],
      ["a JSON array", "[1]"],
      ["a JSON scalar", "7"],
    ])("rejects commitment.json that is %s", async (_label, content) => {
      emitWith((out) => {
        writeFileSync(path.join(out, "commitment.json"), content);
      });
      const { runConstancia } = await load();
      await expect(
        runConstancia(BODY, { emitCommitment: true }),
      ).rejects.toMatchObject({
        errorCode: "dike_bad_output",
        statusCode: 502,
      });
    });

    it("refuses a symlinked output file and never reads its target", async () => {
      const outside = scratchDir();
      writeFileSync(path.join(outside, "secret.json"), `{"k":"${CANARY}"}`);
      emitWith((out) => {
        symlinkSync(
          path.join(outside, "secret.json"),
          path.join(out, "commitment.json"),
        );
      });
      const { runConstancia } = await load();
      const error = await failure(
        runConstancia(BODY, { emitCommitment: true }),
      );
      expect(error).toMatchObject({ errorCode: "dike_bad_output" });
      expect(error.message).not.toContain(CANARY);
    });

    it("refuses a symlinked public key", async () => {
      const outside = scratchDir();
      const { publicKey } = generateKeyPairSync("ed25519");
      writeFileSync(
        path.join(outside, "k.pub"),
        publicKey.export({ type: "spki", format: "pem" }),
      );
      emitWith((out) => {
        writeFileSync(path.join(out, "commitment.json"), "{}");
        symlinkSync(
          path.join(outside, "k.pub"),
          path.join(out, "content-signing-key.pub"),
        );
      });
      const { runConstancia } = await load();
      await expect(
        runConstancia(BODY, { emitCommitment: true }),
      ).rejects.toMatchObject({ errorCode: "dike_bad_output" });
    });

    it("refuses an out directory replaced by a symlink", async () => {
      const outside = scratchDir();
      writeFileSync(path.join(outside, "commitment.json"), `{"k":"${CANARY}"}`);
      engine({ stdout: ROOTLESS }, (work) => {
        rmSync(path.join(work, "out"), { recursive: true });
        symlinkSync(outside, path.join(work, "out"));
      });
      const { runConstancia } = await load();
      const error = await failure(
        runConstancia(BODY, { emitCommitment: true }),
      );
      expect(error).toMatchObject({ errorCode: "dike_bad_output" });
      expect(error.message).not.toContain(CANARY);
      expect(existsSync(path.join(outside, "commitment.json"))).toBe(true);
    });

    it("rejects oversized commitment and public key files", async () => {
      emitWith((out) => {
        writeFileSync(
          path.join(out, "commitment.json"),
          `{"pad":"${"x".repeat(8 * 1024 * 1024)}"}`,
        );
      });
      const { runConstancia } = await load();
      await expect(
        runConstancia(BODY, { emitCommitment: true }),
      ).rejects.toMatchObject({ errorCode: "dike_bad_output" });

      emitWith((out) => {
        writeFileSync(path.join(out, "commitment.json"), "{}");
        writeFileSync(
          path.join(out, "content-signing-key.pub"),
          "-----BEGIN PUBLIC KEY-----\n" + "A".repeat(17 * 1024),
        );
      });
      await expect(
        (await load()).runConstancia(BODY, { emitCommitment: true }),
      ).rejects.toMatchObject({ errorCode: "dike_bad_output" });
    });

    it("rejects a non-regular output file", async () => {
      emitWith((out) => {
        writeFileSync(path.join(out, "commitment.json"), "{}");
        symlinkSync(out, path.join(out, "commitment.sig.json"));
      });
      const { runConstancia } = await load();
      await expect(
        runConstancia(BODY, { emitCommitment: true }),
      ).rejects.toMatchObject({ errorCode: "dike_bad_output" });
    });
  });
});

describe("statusFor and locate", () => {
  it("only VERIFICADA becomes verified", async () => {
    const { statusFor } = await load();
    const base = {
      cita_raw: "x",
      gid: "",
      cuerpo: null,
      texto_hash: null,
      vigencia: "",
      fuente_url: "",
      fecha_recuperacion: "",
    };
    expect(
      statusFor({ ...base, estado: "VERIFICADA", resolucion: "EXACT" }),
    ).toBe("verified");
    expect(statusFor({ ...base, estado: "FALLO", resolucion: "AMBIGUA" })).toBe(
      "ambiguous",
    );
    expect(statusFor({ ...base, estado: "FALLO", resolucion: "NONE" })).toBe(
      "refused",
    );
  });

  it("does not match artículo 16 inside artículo 161", async () => {
    const { locate } = await load();
    const body = "Según el artículo 161 y el artículo 16.";
    expect(locate(body, ["artículo 16", "artículo 161"])).toEqual([
      { start: 27, end: 38 },
      { start: 9, end: 21 },
    ]);
    expect(body.slice(27, 38)).toBe("artículo 16");
    expect(body.slice(9, 21)).toBe("artículo 161");
  });

  it("assigns each occurrence of a repeated raw once", async () => {
    const { locate } = await load();
    const body = "Véase el artículo 16.";
    const start = body.indexOf("artículo 16");
    expect(locate(body, ["artículo 16", "artículo 16"])).toEqual([
      { start, end: start + "artículo 16".length },
      { start: -1, end: -1 },
    ]);
  });

  it("locates citations reported out of document order", async () => {
    const { locate } = await load();
    const body = "Según el artículo 161 y el artículo 16.";
    expect(locate(body, ["artículo 161", "artículo 16"])).toEqual([
      { start: 9, end: 21 },
      { start: 27, end: 38 },
    ]);
  });

  it("returns -1 when the raw is missing or not on a word boundary", async () => {
    const { locate } = await load();
    expect(locate("sin citas", ["artículo 16"])).toEqual([
      { start: -1, end: -1 },
    ]);
    expect(locate("xartículo 16", ["artículo 16"])).toEqual([
      { start: -1, end: -1 },
    ]);
    expect(locate("(artículo 16).", ["artículo 16"])).toEqual([
      { start: 1, end: 12 },
    ]);
  });
});
