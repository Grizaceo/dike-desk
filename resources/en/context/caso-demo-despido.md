# Demo case: dismissal for the company's needs (synthetic)

This resource goes with the brief "Demo: despido por necesidades de la empresa (sintético)". The parties, facts, dates and amounts are fictitious. Use it only with that brief.

## Where each item comes from

- Only Diké (`verify-brief`) sets citation statuses. Nothing in this resource is engine output.
- The provision texts and contents below are a **primary source consulted** (evidence level 2): the LexO team's review against LeyChile / BCN, latest version, Labour Code (DFL No. 1 of 2002), idNorma 207436, consulted on 2026-10-31. Report them as "found in LeyChile, idNorma 207436, consulted on 2026-10-31", never as verified by Diké.
- If the lawyer asks about something that is not here, say so and mark it `[PENDIENTE: evidencia]`. Do not fill it in from memory.

## Content consulted

- **Art. 60 CT:** «En caso de fallecimiento del trabajador, las remuneraciones que se adeudaren serán pagadas por el empleador a la persona que se hizo cargo de sus funerales, hasta concurrencia del costo de los mismos…» (on the worker's death, the remuneration owed is paid by the employer to the person who paid for the funeral, up to its cost). The rest of the article deals with the balance paid to the spouse or civil partner, the children or the parents, capped at five UTA. It does not support a claim for unjustified dismissal.
- **Art. 161, para. 1, CT:** ground of the company's needs.
- **Art. 162, para. 4, CT:** when art. 161, para. 1, is invoked, notice is given to the worker, with a copy to the Labour Inspectorate, at least thirty days in advance. The notice can be replaced by the payment in lieu of notice.
- **Art. 163, paras. 1 and 2, CT:** severance pay for years of service if the contract lasted one year or more and ended under art. 161.
- **Art. 168, para. 1, CT:** the term to go to court is **sixty** working days from the separation. The term is suspended if the worker files a complaint with the Labour Inspectorate (same article, last paragraph).
- **Art. 640 CT:** according to the same review, the Labour Code in force goes up to art. 519.

## Synthetic errors in the brief (on purpose)

| Paragraph | Citation | What to expect from Diké | What to warn about |
| --- | --- | --- | --- |
| SÉPTIMO | «artículo 60» with no statute | `ambiguous` | If the lawyer says it is the Labour Code, show the art. 60 text above and warn that it governs paying the remuneration owed when the worker dies and does not support the sentence. Propose withdrawing the citation (`propose-fix` with an empty replacement) or ask for the right provision. Do not propose completing the statute name as the fix. |
| SEXTO | «artículo 168 del Código del Trabajo» | `verified` (exists and is in force) | The sentence says «treinta días hábiles»; art. 168, para. 1, says sixty. Diké does not check paraphrases: the green mark does not correct it. The lawyer fixes it with Edit text. |
| OCTAVO | «artículo 640 del Código del Trabajo» | `refused` (could not be verified) | Diké did not find it in its corpus. That alone does not prove it does not exist; the review consulted says the code goes up to art. 519. Propose withdrawing it or ask for the right provision. |

The separation date in the case is 15 September 2026 (synthetic fact). If the lawyer wants to assess whether the provisions were in force on that date, they choose it as the reference date before verifying.
