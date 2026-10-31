---
name: leer-constancia-dike
description: >-
  Úsala al informar o actuar sobre un resultado de verify-brief o emit-commitment: qué significa cada estado, cuándo proponer un arreglo o un retiro y qué no afirma Diké. /
  Use when reporting or acting on a verify-brief or emit-commitment result: what each status means, when to propose a fix or a withdrawal, and what Diké does not claim.
---

# Leer la constancia de Diké

Diké es el único que fija el estado de una cita. LexO lo informa con fidelidad y nunca lo mejora en prosa.

## Qué acredita y qué no

- **Acredita** que la cita identifica una norma de su corpus, que el texto fuente está íntegro (hash) y que estaba vigente a la fecha de referencia (`as_of`), según el corpus identificado por `pack_hash`.
- **No acredita** que la norma respalde el argumento, que la interpretación sea correcta, ni que la paráfrasis sea fiel (plazos, montos, requisitos), ni nada sobre jurisprudencia o doctrina.

Informa siempre `pack_hash` y `as_of` junto al resultado.

## Estados de cita

| Estado | Significado | Qué hacer |
| --- | --- | --- |
| `verified` | Existe y está vigente al `as_of` en la última corrida sobre el texto actual. | Informarla con `pack_hash` y `as_of`. |
| `ambiguous` | La referencia admite más de una norma (por ejemplo, «artículo 60» sin cuerpo legal). |  Preguntar por el cuerpo legal. Antes de proponer completarlo, revisar si la norma sostiene la frase; si no la sostiene (p. ej., el art. 60 del Código del Trabajo en el caso de demostración), proponer el retiro o pedir la norma correcta. Después, verificar de nuevo. |
| `refused` | Diké no pudo verificarla: no resuelve en su corpus, no tiene texto citable, no rige a la fecha o falta procedencia; en la interfaz se muestra «No se pudo verificar». No prueba por sí solo que la norma no exista. | Leer la resolución, explicar el motivo y proponer un arreglo o el retiro. |
| `stale` | El texto cambió después de la última verificación. | No usar el estado anterior; verificar de nuevo. |

Las resoluciones del motor detallan el motivo, por ejemplo: `AMBIGUOUS`, `UNRESOLVABLE`, `NOT_IN_FORCE`, `TEMPORAL_UNKNOWN`, `HISTORICAL_TEXT_UNAVAILABLE` y `PROVENANCE_INCOMPLETE`. Cítalas tal como vienen; no las traduzcas a una conclusión más fuerte.

## Veredictos del escrito

- `TODAS_VERIFICADAS` y `CON_PROBLEMAS`: resultado de una verificación con citas.
- `SIN_CITAS`: la gramática del motor no vio citas. No significa que el escrito no cite normas.
- `SIN_CORPUS`: no había corpus con qué verificar. No es un resultado favorable.

## Vigencia no es fecha

La fecha de un documento no prueba su vigencia. Una incertidumbre temporal (`TEMPORAL_UNKNOWN`, `HISTORICAL_TEXT_UNAVAILABLE`) no equivale a derogación: informa la incertidumbre, no una conclusión negativa ni positiva.

## Arreglos y retiros

1. `propose-fix` reemplaza el texto **completo** de la cita (`raw`). Si el motor incluyó palabras de arrastre («… dispone»), consérvalas en el reemplazo.
2. Un retiro (reemplazo vacío) puede dejar la frase rota. Avísalo en un comentario, cita cómo quedaría la frase y propón una reescritura en prosa que el abogado aplique con «Editar texto». No inventes hechos, pruebas ni normas: marca `[completar: dato]` lo que solo el abogado puede aportar.
3. Una propuesta no es evidencia. Después de que el abogado la acepte, ejecuta `verify-brief` antes de informar.

## Certificado de verificación

`emit-commitment` emite un certificado de verificación. Está bloqueado mientras haya citas sin verificar; si el resultado es parcial, solo el abogado lo confirma en la interfaz. El certificado lista todas las citas detectadas con su estado y lleva la huella SHA-256 del texto del escrito. Su sello es un sello de integridad con una llave de demostración: no identifica a nadie y no es firma electrónica avanzada (Ley 19.799). El verificador independiente del sello (`verificar_tercero.py`) viene con el repositorio de Diké, que aún no es público. La huella del escrito se comprueba con `verifier/verificar_certificado.py` de este repositorio.
