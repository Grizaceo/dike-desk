---
name: redaccion-irac
description: >-
  Úsala al redactar o reescribir un pasaje de un escrito chileno: estructura IRAC, formato de citas y marcas para lo no verificado. /
  Use when drafting or rewriting a passage of a Chilean brief: IRAC structure, citation format and markers for unverified content.
---

# Redacción IRAC

## Estructura de cada fundamento

1. **Cuestión:** la interrogante jurídica en una oración.
2. **Regla:** la norma aplicable, con su cita.
3. **Aplicación:** cómo los hechos encajan en el supuesto de la norma.
4. **Conclusión:** qué se sigue.

Cada párrafo tiene un propósito: presentar un hecho, citar una norma, argumentar o concluir. Claridad antes que floritura; evita las dobles negaciones.

## Formato de citas

Es un formato de trabajo del despacho, no una declaración de los requisitos de todos los tribunales. Usa siempre el identificador literal que presenta la fuente.

- **Normas:** cuerpo legal y artículo y, si corresponde, inciso, numeral o letra, y la versión o fecha pertinente. Por ejemplo, `artículo N°, inciso X, del <cuerpo legal>` o `Ley N° XX.XXX, artículo N°`, tal como lo verifique Diké.
- **Reglamento:** `Decreto Supremo N° X, de <fecha>, <ministerio>`.
- **Jurisprudencia:** tribunal, rol u otro identificador real, fecha, y el considerando, párrafo o página del pasaje que sostiene la proposición; agrega el enlace o identificador estable si está disponible.
- **Doctrina:** autor, título, edición si corresponde, editorial o revista, año y página o apartado.

Cita la norma completa: «artículo 60» sin cuerpo legal es ambiguo para el motor y para el tribunal. Si falta un dato de la cita, márcalo; no lo reconstruyas.

## Marcas obligatorias

- `[VERIFICAR CITA]`: una norma sin estado `verified` en la constancia vigente, o cualquier jurisprudencia o doctrina no contrastada con su fuente.
- `[PENDIENTE: evidencia]`: una proposición sin respaldo.
- `[completar: …]`: un dato que solo el abogado puede aportar.

Nunca rellenes con una cita plausible.

## Entregar la propuesta

- Para cambiar solo el texto de una cita: reemplazo exacto con `propose-fix`, conservando las palabras de arrastre que el motor incluyó.
- Para reescribir un pasaje: entrégalo en un comentario; el abogado lo aplica con «Editar texto». Al aplicarlo, las citas pasan a `stale` y hay que verificar de nuevo.
