import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { briefSha256, commitmentHash } from "../server/lib/brief-hash.js";

const SCRIPT = path.join(__dirname, "..", "verifier", "verificar_certificado.py");

function python3Available() {
  try {
    execFileSync("python3", ["--version"], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

const HAS_PYTHON = python3Available();
const scratchDirs: string[] = [];

function scratch() {
  const dir = mkdtempSync(path.join(tmpdir(), "verificar-cert-"));
  scratchDirs.push(dir);
  return dir;
}

const BODY = "Escrito con el artículo 161 del Código del Trabajo.\n\nFin.\n";
const COMMITMENT = { citas_verificadas: 1, pack_hash: "abc123", z: [2, 1] };

function certificate(overrides: Record<string, unknown> = {}) {
  return {
    schema_version: "dike-desk-certificado-v1",
    escrito: {
      titulo: "Escrito",
      sha256: briefSha256(BODY),
      normalizacion: "dike-desk-texto-v1",
    },
    commitment_hash: commitmentHash(COMMITMENT),
    ...overrides,
  };
}

function run(scriptArgs: string[]) {
  return spawnSync("python3", [SCRIPT, ...scriptArgs], { encoding: "utf8" });
}

function write(dir: string, name: string, content: string) {
  const file = path.join(dir, name);
  writeFileSync(file, content);
  return file;
}

afterAll(() => {
  for (const dir of scratchDirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

describe("verifier/verificar_certificado.py", () => {
  it.skipIf(!HAS_PYTHON)("exit 0 when the brief text matches", () => {
    const dir = scratch();
    const cert = write(dir, "certificado.json", JSON.stringify(certificate()));
    const escrito = write(dir, "escrito.txt", BODY);
    const run_ = run([cert, escrito]);
    expect(run_.status).toBe(0);
    expect(run_.stdout).toContain("COINCIDE");
    expect(run_.stdout).toContain("verificar_tercero.py");
  });

  it.skipIf(!HAS_PYTHON)("exit 0 for the same text with CRLF endings", () => {
    const dir = scratch();
    const cert = write(dir, "certificado.json", JSON.stringify(certificate()));
    const escrito = write(dir, "escrito.txt", BODY.replace(/\n/g, "\r\n"));
    expect(run([cert, escrito]).status).toBe(0);
  });

  it.skipIf(!HAS_PYTHON)("exit 1 when one character differs", () => {
    const dir = scratch();
    const cert = write(dir, "certificado.json", JSON.stringify(certificate()));
    const escrito = write(dir, "escrito.txt", BODY.replace("161", "162"));
    const run_ = run([cert, escrito]);
    expect(run_.status).toBe(1);
    expect(run_.stdout).toContain("NO COINCIDE");
  });

  it.skipIf(!HAS_PYTHON)(
    "exit 1 when the commitment does not match commitment_hash",
    () => {
      const dir = scratch();
      const cert = write(
        dir,
        "certificado.json",
        JSON.stringify(certificate()),
      );
      const escrito = write(dir, "escrito.txt", BODY);
      const wrong = write(
        dir,
        "commitment.json",
        JSON.stringify({ ...COMMITMENT, pack_hash: "otro" }),
      );
      expect(run([cert, escrito, wrong]).status).toBe(1);
    },
  );

  it.skipIf(!HAS_PYTHON)("exit 0 with a matching commitment.json", () => {
    const dir = scratch();
    const cert = write(dir, "certificado.json", JSON.stringify(certificate()));
    const escrito = write(dir, "escrito.txt", BODY);
    const commitment = write(
      dir,
      "commitment.json",
      JSON.stringify(COMMITMENT),
    );
    expect(run([cert, escrito, commitment]).status).toBe(0);
  });

  it.skipIf(!HAS_PYTHON)("exit 2 on a certificate that is not JSON", () => {
    const dir = scratch();
    const cert = write(dir, "certificado.json", "{nope");
    const escrito = write(dir, "escrito.txt", BODY);
    const run_ = run([cert, escrito]);
    expect(run_.status).toBe(2);
    expect(run_.stdout).toContain("NO SE PUDO EVALUAR");
  });

  it.skipIf(!HAS_PYTHON)("exit 2 on an unknown normalizacion", () => {
    const dir = scratch();
    const cert = write(
      dir,
      "certificado.json",
      JSON.stringify(
        certificate({
          escrito: {
            titulo: "Escrito",
            sha256: briefSha256(BODY),
            normalizacion: "otra-normalizacion",
          },
        }),
      ),
    );
    const escrito = write(dir, "escrito.txt", BODY);
    expect(run([cert, escrito]).status).toBe(2);
  });

  it.skipIf(!HAS_PYTHON)("exit 2 on bad usage", () => {
    expect(run([]).status).toBe(2);
  });
});
