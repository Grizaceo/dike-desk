---
name: leer-constancia-dike
description: >-
  Úsala al informar o actuar sobre un resultado de verify-brief o emit-commitment: qué significa cada estado, cuándo proponer un arreglo o un retiro y qué no afirma Diké. /
  Use when reporting or acting on a verify-brief or emit-commitment result: what each status means, when to propose a fix or a withdrawal, and what Diké does not claim.
---

# Reading Diké's record

Diké alone sets a citation's status. LexO reports it faithfully and never improves it in prose.

## What it proves and what it does not

- **It proves** that the citation identifies a provision in its corpus, that the source text is intact (hash) and that it was in force on the reference date (`as_of`), according to the corpus identified by `pack_hash`.
- **It does not prove** that the provision supports the argument, that the interpretation is correct, or anything about case law or scholarship.

Always report `pack_hash` and `as_of` with the result.

## Citation statuses

| Status | Meaning | What to do |
| --- | --- | --- |
| `verified` | Verified in the latest run on the current text. | Report it with `pack_hash` and `as_of`. |
| `ambiguous` | The reference fits more than one provision (for example "artículo 60" with no code or statute). | Ask, or propose the right body of law with `propose-fix`; then verify again. |
| `refused` | Diké could not verify it: it does not resolve in its corpus, has no citable text, was not in force on the date, or lacks provenance. This alone does not prove that the provision does not exist. | Read the resolution, explain the reason and propose a fix or a withdrawal. |
| `stale` | The text changed after the latest verification. | Do not use the previous status; verify again. |

The engine's resolutions give the reason, for example `AMBIGUOUS`, `UNRESOLVABLE`, `NOT_IN_FORCE`, `TEMPORAL_UNKNOWN`, `HISTORICAL_TEXT_UNAVAILABLE` and `PROVENANCE_INCOMPLETE`. Quote them as they come; do not translate them into a stronger conclusion.

## Brief verdicts

- `TODAS_VERIFICADAS` and `CON_PROBLEMAS`: the result of a verification with citations.
- `SIN_CITAS`: the engine's grammar saw no citations. It does not mean the brief cites no provisions.
- `SIN_CORPUS`: there was no corpus to verify against. It is not a favourable result.

## Being in force is not a date

A document's date does not prove that it is in force. A temporal uncertainty (`TEMPORAL_UNKNOWN`, `HISTORICAL_TEXT_UNAVAILABLE`) is not a repeal: report the uncertainty, not a negative or a positive conclusion.

## Fixes and withdrawals

1. `propose-fix` replaces the citation's **whole** text (`raw`). If the engine included trailing words ("… dispone"), keep them in the replacement.
2. A withdrawal (empty replacement) can leave the sentence broken. Say so in a comment, quote how the sentence would read and propose a prose rewrite for the lawyer to apply with "Edit text". Do not invent facts, evidence or provisions: put in `[brackets]` what only the lawyer can supply.
3. A proposal is not evidence. After the lawyer accepts it, run `verify-brief` before reporting.

## Commitment

`emit-commitment` produces a record that lists only the verified citations. If it is signed, it is checked outside the app with Diké's independent verifier. A signature field in the JSON is not a checked signature.
