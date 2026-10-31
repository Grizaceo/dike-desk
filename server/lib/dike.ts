import { execFile } from "node:child_process";
import { createPublicKey } from "node:crypto";
import { constants } from "node:fs";
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  open,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { fail } from "@agent-native/core/action";

import type { CitationStatus } from "../db/schema.js";

// Adapter over the unchanged Diké engine (`dike constancia --json`).
// The engine is the only source of verification verdicts: this module parses
// its output and never upgrades a FALLO into anything else.
//
// Configure one of:
//   DIKE_DOCKER_IMAGE=dike   run the engine image built from the dike repo,
//                            network disabled (recommended, works on any OS)
//   DIKE_BIN=dike            run a locally installed engine (Linux)

export type DikeDetail = {
  cita_raw: string;
  gid: string;
  estado: "VERIFICADA" | "FALLO";
  resolucion: string;
  cuerpo: string | null;
  texto_hash: string | null;
  vigencia: string;
  fuente_url: string;
  fecha_recuperacion: string;
};

export type DikeResult = {
  veredicto: "TODAS_VERIFICADAS" | "CON_PROBLEMAS";
  mensaje: string;
  alcance: string;
  problemas: string[];
  detalles: DikeDetail[];
  meta: {
    as_of: string;
    fecha_constancia: string;
    pack_hash: string;
    total_citas: number;
    citas_verificadas: number;
    citas_fallidas: number;
  };
};

export type DikeRun = {
  result: DikeResult;
  commitment: unknown | null;
  signature: unknown | null;
  /** PEM-encoded public content-signing key (only present when --sign was used). */
  pubkey: string | null;
};

const TIMEOUT_MS = 120_000;
const MAX_BODY_BYTES = 400_000;
const MAX_JSON_BYTES = 8 * 1024 * 1024;
const MAX_PUBKEY_BYTES = 16 * 1024;
const IMAGE_HOME = "/home/dike";

function run(cmd: string, args: string[]) {
  return new Promise<{ code: number; stdout: string; stderr: string }>(
    (resolve) => {
      execFile(
        cmd,
        args,
        { timeout: TIMEOUT_MS, maxBuffer: 16 * 1024 * 1024, windowsHide: true },
        (error, stdout, stderr) => {
          const code =
            error && typeof (error as { code?: unknown }).code === "number"
              ? ((error as { code: number }).code ?? 1)
              : error
                ? -1
                : 0;
          resolve({ code, stdout: String(stdout), stderr: String(stderr) });
        },
      );
    },
  );
}

function badOutput(): never {
  return fail("Diké engine returned unsafe or malformed output.", {
    errorCode: "dike_bad_output",
    statusCode: 502,
  });
}

let dockerUserCache: Promise<string> | null = null;

/**
 * Identity the container runs as so it can read the 0700 work dir and write
 * the 0700 output dir we own. Rootless Docker maps container root to our host
 * uid; rootful Docker needs our own uid:gid. Fails closed when undetermined.
 */
function dockerUser(): Promise<string> {
  dockerUserCache ??= (async () => {
    const { code, stdout } = await run("docker", [
      "info",
      "--format",
      "{{json .SecurityOptions}}",
    ]);
    let options: unknown;
    try {
      options = JSON.parse(stdout);
    } catch {
      options = null;
    }
    if (
      code !== 0 ||
      !Array.isArray(options) ||
      !options.every((o) => typeof o === "string")
    ) {
      dockerUserCache = null;
      fail("Could not determine the Docker security mode.", {
        errorCode: "dike_docker_unavailable",
        statusCode: 503,
      });
    }
    if ((options as string[]).some((o) => /(^|,)name=rootless(,|$)/.test(o)))
      return "0:0";
    if (typeof process.getuid === "function" && process.getgid)
      return `${process.getuid()}:${process.getgid()}`;
    return "0:0";
  })();
  return dockerUserCache;
}

/** Run `dike constancia` on a brief body; optionally emit the commitment. */
export async function runConstancia(
  body: string,
  opts: { emitCommitment?: boolean } = {},
): Promise<DikeRun> {
  if (Buffer.byteLength(body, "utf8") > MAX_BODY_BYTES) {
    fail("The brief is larger than the 400 KB the verifier accepts.", {
      errorCode: "brief_too_large",
    });
  }
  const image = process.env.DIKE_DOCKER_IMAGE?.trim(); // guard:allow-env-credential — operator deploy config (engine image name), not a user credential
  const bin = process.env.DIKE_BIN?.trim(); // guard:allow-env-credential — operator deploy config (engine binary path), not a user credential
  if (!image && !bin) {
    fail(
      "Diké engine is not configured. Set DIKE_DOCKER_IMAGE (docker build -t dike . in the dike repo) or DIKE_BIN.",
      { errorCode: "dike_unavailable", statusCode: 503 },
    );
  }

  const docker = Boolean(image);
  const user = docker ? await dockerUser() : null;
  const work = await mkdtemp(path.join(tmpdir(), "dike-desk-"));
  try {
    await chmod(work, 0o700);
    await writeFile(path.join(work, "brief.md"), body, {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx",
    });
    if (opts.emitCommitment) {
      await mkdir(path.join(work, "out"), { mode: 0o700 });
    }
    const root = docker ? "/work" : work;
    const args = ["constancia", `${root}/brief.md`, "--json"];
    if (opts.emitCommitment) {
      args.push("--emit-commitment", `${root}/out`);
      // Signing only happens when the operator configured a content key for a
      // local engine. The app never generates, reads or moves signing keys.
      // guard:allow-env-credential — operator-level key path read only to pass --sign; the app never reads the key
      if (!docker && process.env.LEXO_CONTENT_SIGNING_KEY_PATH) {
        args.push("--sign");
      }
    }

    const { code, stdout } = docker
      ? await run("docker", [
          "run",
          "--rm",
          "--pull=never",
          "--network",
          "none",
          "--user",
          user!,
          "--env",
          `HOME=${IMAGE_HOME}`,
          // --mount takes the host path verbatim, so a Windows path such as
          // C:\Users\...\Temp\dike-desk-x needs no conversion (unlike -v,
          // which splits on the drive-letter colon).
          "--mount",
          `type=bind,source=${work},target=/work`,
          image!,
          "dike",
          ...args,
        ])
      : await run(bin!, args);

    // 0 = all verified, 1 = some were not. Anything else is an engine failure.
    // The engine's stderr can echo brief text or paths: it is never surfaced.
    if (code !== 0 && code !== 1) {
      fail(`Diké engine failed (exit ${code}).`, {
        errorCode: "dike_failed",
        statusCode: 502,
      });
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(stdout);
    } catch {
      return badOutput();
    }
    if (
      !isRecord(parsed) ||
      !Array.isArray(parsed.detalles) ||
      !isRecord(parsed.meta)
    )
      return badOutput();
    const result = parsed as unknown as DikeResult;

    let commitment: unknown = null;
    let signature: unknown = null;
    let pubkey: string | null = null;
    if (opts.emitCommitment) {
      const out = path.join(work, "out");
      await assertPlainDirectory(out);
      commitment = await readJson(path.join(out, "commitment.json"));
      signature = await readJson(path.join(out, "commitment.sig.json"));
      // The public key is only written when --sign was passed. Reading it here
      // lets the UI offer the full offline-verification kit without the lawyer
      // having to go back to the engine.
      pubkey = await readPublicKey(path.join(out, "content-signing-key.pub"));
    }
    return { result, commitment, signature, pubkey };
  } finally {
    // A failed cleanup must not turn a finished verification into an error,
    // but it leaves a copy of the brief on disk.
    await rm(work, { recursive: true, force: true }).catch(() =>
      console.error("[dike] could not remove a temporary work directory"),
    );
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMissing(error: unknown) {
  return (error as { code?: unknown })?.code === "ENOENT";
}

async function assertPlainDirectory(dir: string) {
  let info;
  try {
    info = await lstat(dir);
  } catch {
    return badOutput();
  }
  if (!info.isDirectory()) badOutput();
}

/** Read a regular, non-symlink file of bounded size, or null if absent. */
async function readBounded(file: string, maxBytes: number) {
  let before;
  try {
    before = await lstat(file);
  } catch (error) {
    if (isMissing(error)) return null;
    return badOutput();
  }
  if (!before.isFile() || before.size > maxBytes) badOutput();
  let handle;
  try {
    handle = await open(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  } catch (error) {
    if (isMissing(error)) return null;
    return badOutput();
  }
  try {
    const during = await handle.stat();
    if (
      !during.isFile() ||
      during.size > maxBytes ||
      during.ino !== before.ino ||
      during.dev !== before.dev
    )
      badOutput();
    return await handle.readFile({ encoding: "utf8" });
  } catch {
    return badOutput();
  } finally {
    await handle.close().catch(() => undefined);
  }
}

async function readJson(file: string): Promise<unknown | null> {
  const text = await readBounded(file, MAX_JSON_BYTES);
  if (text === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return badOutput();
  }
  if (!isRecord(parsed)) return badOutput();
  return parsed;
}

/** Normalized SPKI PEM of an Ed25519 public key, or null if absent. */
async function readPublicKey(file: string): Promise<string | null> {
  const text = await readBounded(file, MAX_PUBKEY_BYTES);
  if (text === null) return null;
  if (!text.includes("-----BEGIN PUBLIC KEY-----") || /PRIVATE/.test(text))
    return badOutput();
  try {
    const key = createPublicKey(text);
    if (key.asymmetricKeyType !== "ed25519") return badOutput();
    return key.export({ type: "spki", format: "pem" }).toString();
  } catch {
    return badOutput();
  }
}

/** Map an engine detail to the app status. Only VERIFICADA becomes verified. */
export function statusFor(detail: DikeDetail): CitationStatus {
  if (detail.estado === "VERIFICADA") return "verified";
  if (/AMBIG/i.test(detail.resolucion ?? "")) return "ambiguous";
  return "refused";
}

/**
 * Locate each reported citation in the body, in order, so the editor can
 * highlight it. Returns -1 offsets when the raw text cannot be found.
 */
export function locate(body: string, raws: string[]) {
  let cursor = 0;
  return raws.map((raw) => {
    const at = raw ? body.indexOf(raw, cursor) : -1;
    const start = at >= 0 ? at : raw ? body.indexOf(raw) : -1;
    if (start < 0) return { start: -1, end: -1 };
    cursor = start + raw.length;
    return { start, end: start + raw.length };
  });
}
