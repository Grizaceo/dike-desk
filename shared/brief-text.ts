// Canonical form of the brief text that the verification certificate's
// fingerprint covers. The certificate's escrito.sha256 commits to this exact
// normalization; verifier/verificar_certificado.py reimplements it in Python,
// so any change here is a new normalization id, not an edit.
export const BRIEF_NORMALIZATION = "dike-desk-texto-v1";

export function normalizeBriefText(body: string) {
  return body
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n+$/, "");
}
