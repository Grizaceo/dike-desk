---
name: metodologia-agentica
description: >-
  Úsala al investigar una cuestión jurídica que pueda cambiar una conclusión, un escrito, un plazo o una estrategia: 7 pasos con criterios de parada y escalación. /
  Use when researching a legal question that can change a conclusion, a brief, a deadline or a strategy: 7 steps with stopping and escalation criteria.
---

# Agentic legal research methodology

LexO is not a semantic search engine. It researches like a lawyer: it frames the problem, compares hypotheses, gathers typed evidence, verifies it and decides when it is enough.

## The 7 steps

1. **Problem framing.** Exact legal question, jurisdiction, area of law, problem type (statutory, case-law, procedural, administrative or mixed), priority source, entities (parties, acts, dates) and ambiguities.
2. **Hypotheses.** Open between 1 and 4 plausible answers when the ambiguity is material. For each one, note what would confirm it and what would defeat it.
3. **Typed search.** Plan the search by source type: statute, case law, administrative act and scholarship. If a path returns little, rephrase with synonyms of the area, then move up to the broader area (for example, from a ground for dismissal to the fundamental rights involved). If there is still nothing, record it as a high-impact gap. If you have no authorized tool to consult, say so and ask for the text: do not simulate the lookup.
4. **NIF.** Organize facts, parties, norms, acts, principles, deontic positions, conflicts, exceptions, gaps, hypotheses and evidence for and against (skill `nif-y-logica-de-normas`).
5. **Evidence and verification.** For each material statement keep: source identifier, precise locator of the passage, hash when a tool provides one, relevant text, date or version, scope and verification status. For citations in the brief use the `citationId` and the `sourceUrl` and `textSha256` fields from `get-brief`. Do not invent hashes or confuse `pack_hash` with the hash of a specific source. If an external source lacks a hash or a sufficient locator, state that limitation. The brief's statutory citations are verified with `verify-brief`; case law and scholarship stay `[VERIFICAR]` until checked against their source.
6. **Sufficiency.** Decide whether it is sufficient, whether to continue or whether to escalate (criteria below).
7. **Memo.** Sufficient, provisional or insufficient conclusion, explicit gaps and the next human decision. Whoever continues the work inherits the references, not only the conclusion.

## Deciding when to stop

Apply these criteria in order:

1. **Escalate to the lawyer** takes precedence over everything else when:
   - there is a relevant, unresolved conflict of norms;
   - an indispensable primary source or fact is missing;
   - the evidence splits with no reasonable tie-breaker;
   - the central citation cannot be verified;
   - the case depends on a legal judgment that cannot be formalized.
2. **Declare sufficient** only if the indispensable sources and facts are covered, the citations were checked and no material defeater remains untreated.
3. **Stop without sufficiency:** two consecutive rounds without novelty, two rounds without improvement in confidence, or exhausting the limits stop the search but do not prove sufficiency. Deliver a provisional or insufficient memo with the missing evidence, and escalate if it is material.
4. **Continue** only if you can name a live hypothesis, the missing evidence, a concrete route to obtain it and a reasonable expectation of improvement.

Limits: at most 4 active hypotheses, 3 refinement rounds and 12 candidate pieces of evidence per round.

## Checklist before answering

- [ ] The question is classified and the main source identified.
- [ ] There are between 1 and 4 hypotheses.
- [ ] There is at least one relevant primary source.
- [ ] The citations used were checked against the text and have a locator, or are marked.
- [ ] Being in force was checked where it matters (in force ≠ date of the document).
- [ ] No serious contradiction was ignored.
- [ ] Persistent gaps are written down.

Sufficiency by type of question:

- **Statute:** text, article with its paragraph, number or letter where relevant, and whether it is in force.
- **Case law:** court, case number or other real identifier, date, and the recital or passage that supports the ratio.
- **Administrative act:** identification, issuer and link to the case.
- **Deadline:** procedural norm, milestones and case-law criterion if any.

## Honest limits

This methodology runs no formal argumentation or logical-verification engine. What is formal reduces to structuring the NIF and to Diké's record; the rest is the lawyer's judgment. See `context/fundamentos-metodologia.md`.
