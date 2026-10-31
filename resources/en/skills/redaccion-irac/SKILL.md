---
name: redaccion-irac
description: >-
  Úsala al redactar o reescribir un pasaje de un escrito chileno: estructura IRAC, formato de citas y marcas para lo no verificado. /
  Use when drafting or rewriting a passage of a Chilean brief: IRAC structure, citation format and markers for unverified content.
---

# IRAC drafting

## Structure of each ground

1. **Issue:** the legal question in one sentence.
2. **Rule:** the applicable norm, with its citation.
3. **Application:** how the facts fit the norm's operative facts.
4. **Conclusion:** what follows.

Every paragraph has one purpose: present a fact, cite a norm, argue or conclude. Clarity before flourish; avoid double negatives.

## Citation format

This is the firm's working format, not a statement of every court's requirements. Always use the literal identifier the source presents.

- **Norms:** body of law and article and, where relevant, paragraph, number or letter, and the relevant version or date. For example `artículo N°, inciso X, del <cuerpo legal>` or `Ley N° XX.XXX, artículo N°`, as Diké verifies it.
- **Regulation:** `Decreto Supremo N° X, de <fecha>, <ministerio>`.
- **Case law:** court, case number or other real identifier, date, and the recital, paragraph or page of the passage that supports the proposition; add the link or stable identifier if available.
- **Scholarship:** author, title, edition where relevant, publisher or journal, year and page or section.

Cite the norm in full: "artículo 60" without the body of law is ambiguous for the engine and for the court. If a citation datum is missing, mark it; do not reconstruct it.

## Mandatory markers

Markers stay in Spanish, the language of the briefs:

- `[VERIFICAR CITA]`: a provision without `verified` status in the current record, or any case law or scholarship not checked against its source.
- `[PENDIENTE: evidencia]`: a proposition without support.
- `[completar: …]`: a datum only the lawyer can supply.

Never fill in with a plausible citation.

## Delivering the proposal

- To change only a citation's text: exact replacement with `propose-fix`, keeping the trailing words the engine included.
- To rewrite a passage: deliver it in a comment; the lawyer applies it with "Edit text". Once applied, the citations become `stale` and must be verified again.
