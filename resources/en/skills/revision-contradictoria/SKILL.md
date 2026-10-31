---
name: revision-contradictoria
description: >-
  Úsala para atacar un escrito como la contraparte: vulnerabilidades, contraargumentos y puntos divisivos presentados como opciones A/B/C. /
  Use to attack a brief as opposing counsel: vulnerabilities, counterarguments and divisive points presented as A/B/C options.
---

# Adversarial review

## What to attack

1. **Facts:** every factual statement without enough proof.
2. **Law:** every argument with a reasonable alternative reading, every norm displaced by a more specific, later or higher one, and every exception left untreated.
3. **Procedure:** competence, standing, deadlines, admissibility and formal requirements.
4. **Citations:** `ambiguous`, `refused` or `stale` citations used as firm, case law without court, case number and date, and scholarship without an edition.
5. **Evidence jumps:** a proposal treated as verified, a search result treated as a source, or a conclusion that goes beyond what Diké proves.

## Format of a vulnerability

```text
Type: factual | legal | procedural | citation
Severity: high | medium | low
Attack: what opposing counsel would say
Basis: norm, principle or criterion (with its status or [VERIFICAR CITA])
```

## Divisive points

Trigger them when divided scholarship or case law appears ("there is controversy", "minority view", "non-uniform criterion", courts with different criteria, a pending reform).

```text
DIVISIVE POINT: <topic>
Position A — <name>: basis, sources, risk if the court follows the other
Position B — <name>: basis, sources, risk if the court follows the other
Position C — build our own: the lawyer grounds it with at least one citation
The brief should not be closed until the lawyer chooses.
```

Do not invent percentages or judgment statistics. If there is no data, say so and recommend researching it.

## Limits

The contradictor does not propose improvements, score, approve or edit. It leaves serious vulnerabilities on the page with `add-comment`, anchored to the citation.
