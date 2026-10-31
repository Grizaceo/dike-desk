import { BRIEF_NORMALIZATION } from "../../shared/brief-text.js";
import { isoNow } from "../db/timestamps.js";
import type { CitationStatus } from "../db/schema.js";
import { briefSha256, commitmentHash } from "./brief-hash.js";

// The engine's public commitment deliberately omits the brief fingerprint
// (dictionary confirmation: anyone holding a draft could confirm it is this
// brief). The certificate is the dike-desk wrapper that carries the fingerprint
// next to the sealed commitment's hash — it never alters the commitment itself.

export type AsOfOrigen = "abogado" | "agente" | "motor (fecha de hoy)";

const ESTADO_LEGIBLE: Partial<Record<CitationStatus, string>> = {
  verified: "Existe y está vigente",
  ambiguous: "Ambigua",
  refused: "No se pudo verificar",
};

export function certificateScope(packHash: string, asOf: string) {
  return `Alcance: cada norma listada como verificada existe en el corpus ${packHash}, tiene texto citable y figura vigente al ${asOf}. El certificado no acredita que las normas respalden el argumento ni que las paráfrasis sean fieles, y solo cubre las citas a normas que Diké detectó.`;
}

export function buildCertificate(input: {
  titulo: string;
  body: string;
  commitment: unknown;
  sellado: boolean;
  packHash: string;
  asOf: string;
  asOfOrigen: AsOfOrigen;
  parcial: boolean;
  emisionParcialConfirmada: boolean;
  citas: {
    position: number;
    raw: string;
    status: CitationStatus;
    resolution: string | null;
    vigencia: string | null;
    label: string | null;
    gid: string | null;
  }[];
}) {
  const detectadas = input.citas.length;
  const verificadas = input.citas.filter(
    (c) => c.status === "verified",
  ).length;
  return {
    schema_version: "dike-desk-certificado-v1",
    escrito: {
      titulo: input.titulo,
      sha256: briefSha256(input.body),
      normalizacion: BRIEF_NORMALIZATION,
    },
    commitment_hash: commitmentHash(input.commitment),
    sellado: input.sellado,
    pack_hash: input.packHash,
    as_of: input.asOf,
    as_of_origen: input.asOfOrigen,
    fecha_emision: isoNow(),
    parcial: input.parcial,
    emision_parcial_confirmada: input.emisionParcialConfirmada,
    totales: {
      detectadas,
      verificadas,
      no_verificadas: detectadas - verificadas,
    },
    citas: input.citas.map((c) => ({
      posicion: c.position + 1,
      cita: c.raw,
      estado: c.status,
      estado_legible: ESTADO_LEGIBLE[c.status] ?? c.status,
      resolucion: c.resolution,
      vigencia: c.vigencia,
      cuerpo: c.label,
      gid: c.gid,
    })),
    alcance: certificateScope(input.packHash, input.asOf),
  };
}

export type VerificationCertificate = ReturnType<typeof buildCertificate>;
