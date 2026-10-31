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
import { z } from "zod";

import type { CitationStatus } from "../db/schema.js";

// Adapter over the unchanged Diké engine (`dike constancia --json`).
// The engine is the only source of verification verdicts: this module parses
// its output and never upgrades a FALLO into anything else.
//
// Configure one of:
//   DIKE_DOCKER_IMAGE=dike   run the engine image built from the dike repo,
//                            network disabled (recommended, works on any OS)
//   DIKE_BIN=dike            run a locally installed engine (Linux)

const detailSchema = z.object({
  cita_raw: z.string(),
  estado: z.enum(["VERIFICADA", "FALLO"]),
  gid: z.string().nullish(),
  resolucion: z.string().nullish(),
  cuerpo: z.string().nullish(),
  texto_hash: z.string().nullish(),
  vigencia: z.string().nullish(),
  vigencia_legible: z.string().nullish(),
  estado_texto_historico: z.string().nullish(),
  fuente_url: z.string().nullish(),
  fecha_recuperacion: z.string().nullish(),
});

const resultSchema = z.object({
  veredicto: z.enum([
    "TODAS_VERIFICADAS",
    "CON_PROBLEMAS",
    "SIN_CITAS",
    "SIN_CORPUS",
  ]),
  mensaje: z.string(),
  alcance: z.string().optional(),
  problemas: z.array(z.string()).default([]),
  detalles: z.array(detailSchema),
  meta: z.object({
    as_of: z.string(),
    fecha_constancia: z.string(),
    pack_hash: z.string(),
    total_citas: z.number().int().nonnegative().optional(),
    citas_verificadas: z.number().int().nonnegative().optional(),
    citas_fallidas: z.number().int().nonnegative().optional(),
  }),
});

export type DikeDetail = z.infer<typeof detailSchema>;
export type DikeResult = Omit<z.infer<typeof resultSchema>, "meta"> & {
  meta: z.infer<typeof resultSchema>["meta"] & {
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

function run(cmd: string, args: string[], env?: NodeJS.ProcessEnv) {
  return new Promise<{ code: number; stdout: string; stderr: string }>(
    (resolve) => {
      execFile(
        cmd,
        args,
        {
          timeout: TIMEOUT_MS,
          maxBuffer: 16 * 1024 * 1024,
          windowsHide: true,
          ...(env ? { env } : {}),
        },
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

function localEngineEnv() {
  return Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) =>
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
  );
}

function badOutput(): never {
  return fail("El motor Diké devolvió una salida no válida.", {
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
      fail("No se pudo usar Docker para ejecutar el motor Diké.", {
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
  opts: { emitCommitment?: boolean; asOf?: string | undefined } = {},
): Promise<DikeRun> {
  if (Buffer.byteLength(body, "utf8") > MAX_BODY_BYTES) {
    fail("El escrito supera los 400 KB que acepta el verificador.", {
      errorCode: "brief_too_large",
    });
  }
  // Defense in depth: callers validate the date through parseAsOf (real
  // calendar day, not in the future); here we only bound what reaches argv.
  if (
    opts.asOf !== undefined &&
    !/^\d{4}-\d{2}-\d{2}$/.test(opts.asOf)
  ) {
    fail(
      "La fecha de referencia debe ser una fecha válida (AAAA-MM-DD) que no sea posterior a hoy.",
      { errorCode: "invalid_as_of", statusCode: 400 },
    );
  }
  const image = process.env.DIKE_DOCKER_IMAGE?.trim(); // guard:allow-env-credential — operator deploy config (engine image name), not a user credential
  const bin = process.env.DIKE_BIN?.trim(); // guard:allow-env-credential — operator deploy config (engine binary path), not a user credential
  if (!image && !bin) {
    fail("El motor Diké no está configurado en esta instalación.", {
      errorCode: "dike_unavailable",
      statusCode: 503,
    });
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
    if (opts.asOf !== undefined) {
      args.push("--as-of", opts.asOf);
    }
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
      : await run(bin!, args, localEngineEnv());

    // 0 = all verified, 1 = some were not. Anything else is an engine failure.
    // The engine's stderr can echo brief text or paths: it is never surfaced.
    if (code !== 0 && code !== 1) {
      fail("El motor Diké falló. Inténtalo de nuevo.", {
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
    const validated = resultSchema.safeParse(parsed);
    if (!validated.success) return badOutput();
    const value = validated.data;
    const counters = {
      total_citas: value.detalles.length,
      citas_verificadas: value.detalles.filter((d) => d.estado === "VERIFICADA")
        .length,
      citas_fallidas: value.detalles.filter((d) => d.estado === "FALLO").length,
    };
    for (const key of Object.keys(counters) as (keyof typeof counters)[]) {
      if (value.meta[key] !== undefined && value.meta[key] !== counters[key])
        return badOutput();
    }
    const result: DikeResult = {
      ...value,
      meta: { ...value.meta, ...counters },
    };
    // When we asked for a reference date the engine must answer with exactly
    // that date: a silent fallback to "today" would mislabel the whole run.
    if (opts.asOf !== undefined && result.meta.as_of !== opts.asOf)
      return badOutput();

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

// Unicode letters, numbers and marks. ASCII `\b` would treat "artículo" as a
// boundary in the middle of the word and would treat "16" as a match inside
// "161".
const WORD_CHAR = /[\p{L}\p{N}\p{M}_]/u;

function codePointBefore(body: string, index: number): string | null {
  if (index <= 0) return null;
  let prev = index - 1;
  const trail = body.charCodeAt(prev);
  if (trail >= 0xdc00 && trail <= 0xdfff && prev > 0) {
    const lead = body.charCodeAt(prev - 1);
    if (lead >= 0xd800 && lead <= 0xdbff) prev -= 1;
  }
  const codePoint = body.codePointAt(prev);
  return codePoint === undefined ? null : String.fromCodePoint(codePoint);
}

function bounded(body: string, start: number, end: number) {
  const before = codePointBefore(body, start);
  if (before !== null && WORD_CHAR.test(before)) return false;
  if (end >= body.length) return true;
  const after = body.codePointAt(end);
  return after === undefined || !WORD_CHAR.test(String.fromCodePoint(after));
}

function overlaps(
  span: { start: number; end: number },
  used: { start: number; end: number }[],
) {
  return used.some(
    (other) => span.start < other.end && other.start < span.end,
  );
}

/**
 * Locate each reported citation on a Unicode word boundary.
 *
 * Citations are walked in report order. Each one takes the earliest unused
 * match of its raw text, which is its occurrence index. A span is never given
 * to two citations. When no unused word-bounded match remains, the citation
 * is unlocated (`-1`), and `decide-suggestion` rejects that span.
 */
export function locate(body: string, raws: string[]) {
  const used: { start: number; end: number }[] = [];
  return raws.map((raw) => {
    if (!raw) return { start: -1, end: -1 };
    let from = 0;
    while (from <= body.length) {
      const start = body.indexOf(raw, from);
      if (start < 0) break;
      const end = start + raw.length;
      const span = { start, end };
      if (bounded(body, start, end) && !overlaps(span, used)) {
        used.push(span);
        return span;
      }
      from = start + 1;
    }
    return { start: -1, end: -1 };
  });
}
