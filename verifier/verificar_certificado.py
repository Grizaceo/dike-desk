#!/usr/bin/env python3
"""Verifica el certificado de verificación que emite dike-desk.

Uso:
    python3 verificar_certificado.py certificado.json escrito.txt [commitment.json]

Comprueba:
  * que la huella del escrito (SHA-256 del texto normalizado con
    "dike-desk-texto-v1") coincide con certificado["escrito"]["sha256"];
  * si se entrega commitment.json, que su hash canónico coincide con
    certificado["commitment_hash"].

NO comprueba el sello de integridad del commitment (eso es
verificar_tercero.py, que viene con el repositorio del motor Diké) ni el
argumento jurídico del escrito.

Salida: 0 = COINCIDE, 1 = NO COINCIDE, 2 = NO SE PUDO EVALUAR.
Solo usa la biblioteca estándar (Python >= 3.9).
"""

import hashlib
import json
import re
import sys
import unicodedata
from pathlib import Path

NORMALIZACION = "dike-desk-texto-v1"

USO = (
    "Uso: python3 verificar_certificado.py "
    "certificado.json escrito.txt [commitment.json]"
)


def normalizar(texto: str) -> str:
    """La misma normalización que shared/brief-text.ts (dike-desk-texto-v1)."""
    texto = unicodedata.normalize("NFC", texto)
    texto = texto.replace("\r\n", "\n").replace("\r", "\n")
    texto = re.sub(r"[ \t]+$", "", texto, flags=re.MULTILINE)
    texto = re.sub(r"\n+$", "", texto)
    return texto


def huella_escrito(texto: str) -> str:
    return hashlib.sha256(normalizar(texto).encode("utf-8")).hexdigest()


def hash_canonico(valor) -> str:
    crudo = json.dumps(
        valor, ensure_ascii=False, sort_keys=True, separators=(",", ":")
    ).encode("utf-8")
    return hashlib.sha256(crudo).hexdigest()


def no_evaluable(motivo: str) -> int:
    print(f"NO SE PUDO EVALUAR: {motivo}")
    return 2


def main(argv: list[str]) -> int:
    if len(argv) not in (3, 4):
        return no_evaluable(USO)
    cert_path, escrito_path = argv[1], argv[2]
    commitment_path = argv[3] if len(argv) == 4 else None

    try:
        try:
            certificado = json.loads(
                Path(cert_path).read_text(encoding="utf-8")
            )
        except UnicodeDecodeError:
            print("NO SE PUDO EVALUAR: el certificado no es UTF-8.", file=sys.stderr)
            return 2
    except OSError as exc:
        return no_evaluable(f"no se pudo leer el certificado ({exc})")
    except json.JSONDecodeError as exc:
        return no_evaluable(f"el certificado no es JSON válido ({exc})")
    if not isinstance(certificado, dict):
        return no_evaluable("el certificado no es un objeto JSON")

    escrito = certificado.get("escrito")
    if not isinstance(escrito, dict):
        return no_evaluable("el certificado no tiene el bloque «escrito»")
    normalizacion = escrito.get("normalizacion")
    if normalizacion != NORMALIZACION:
        return no_evaluable(
            f"normalización desconocida: {normalizacion!r} "
            f"(esperaba {NORMALIZACION!r})"
        )
    sha_esperado = escrito.get("sha256")
    if not isinstance(sha_esperado, str):
        return no_evaluable("el certificado no tiene escrito.sha256")

    try:
        try:
            texto = Path(escrito_path).read_text(encoding="utf-8")
        except UnicodeDecodeError:
            print("NO SE PUDO EVALUAR: el escrito no es UTF-8.", file=sys.stderr)
            return 2
    except OSError as exc:
        return no_evaluable(f"no se pudo leer el escrito ({exc})")

    coincide = True
    if huella_escrito(texto) == sha_esperado:
        print(
            "COINCIDE: la huella del escrito (SHA-256 del texto normalizado) "
            "coincide con la del certificado."
        )
    else:
        print(
            "NO COINCIDE: la huella del texto entregado no es la del "
            "certificado."
        )
        coincide = False

    if commitment_path is not None:
        hash_esperado = certificado.get("commitment_hash")
        if not isinstance(hash_esperado, str):
            return no_evaluable("el certificado no tiene commitment_hash")
        try:
            commitment = json.loads(
                Path(commitment_path).read_text(encoding="utf-8")
            )
        except UnicodeDecodeError:
            return no_evaluable("commitment.json no es UTF-8")
        except OSError as exc:
            return no_evaluable(f"no se pudo leer commitment.json ({exc})")
        except json.JSONDecodeError as exc:
            return no_evaluable(f"commitment.json no es JSON válido ({exc})")
        if not isinstance(commitment, dict):
            return no_evaluable("commitment.json no es un objeto JSON")
        if hash_canonico(commitment) == hash_esperado:
            print(
                "COINCIDE: commitment_hash del certificado coincide con el "
                "hash canónico del commitment.json entregado."
            )
        else:
            print(
                "NO COINCIDE: el commitment.json entregado no produce el "
                "commitment_hash del certificado."
            )
            coincide = False

    print(
        "certificado.json no está sellado: esta comprobación no prueba que el "
        "certificado sea auténtico ni quién lo emitió.\n"
        "No comprobado: el sello de integridad del commitment (eso lo hace "
        "verificar_tercero.py, del repositorio del motor Diké) ni el "
        "argumento jurídico del escrito."
    )
    return 0 if coincide else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
