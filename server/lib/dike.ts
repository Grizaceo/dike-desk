import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
};

const TIMEOUT_MS = 120_000;
const MAX_BODY_BYTES = 400_000;

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

  const work = await mkdtemp(path.join(tmpdir(), "dike-desk-"));
  try {
    await writeFile(path.join(work, "brief.md"), body, "utf8");
    const docker = Boolean(image);
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

    const { code, stdout, stderr } = docker
      ? await run("docker", [
          "run",
          "--rm",
          "--network",
          "none",
          "-v",
          `${work}:/work`,
          image!,
          "dike",
          ...args,
        ])
      : await run(bin!, args);

    // 0 = all verified, 1 = some were not. Anything else is an engine failure.
    if (code !== 0 && code !== 1) {
      fail(`Diké engine failed (exit ${code}). ${stderr.slice(-400)}`, {
        errorCode: "dike_failed",
        statusCode: 502,
      });
    }
    let result: DikeResult;
    try {
      result = JSON.parse(stdout) as DikeResult;
    } catch {
      fail("Diké engine returned output that is not JSON.", {
        errorCode: "dike_bad_output",
        statusCode: 502,
      });
    }

    let commitment: unknown = null;
    let signature: unknown = null;
    if (opts.emitCommitment) {
      commitment = await readJson(path.join(work, "out", "commitment.json"));
      signature = await readJson(path.join(work, "out", "commitment.sig.json"));
    }
    return { result, commitment, signature };
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

async function readJson(file: string): Promise<unknown | null> {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return null;
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
