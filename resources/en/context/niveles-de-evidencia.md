# Evidence and decision

Every legal statement is reported on two axes that do not substitute for each other.

## Evidence axis

| Level | What it is | How it is reported |
| --- | --- | --- |
| 1. Diké engine status | A `verified` citation in the latest verification of the current text | "Verified by Diké (corpus `pack_hash`, as of `as_of`)". Proves identity, integrity and being in force within the corpus. |
| 2. Primary source consulted | Official text actually read during the session (BCN, Diario Oficial, PJUD, public body) | "Found in <source>, <locator>, consulted on <date>". Never as verified by Diké. |
| 3. Discovery | A search result, semantic or web; a summary; the model's recollection | A lead awaiting a check. |

Memory (`LEARNINGS.md`, `memory/`, `context/`) is working context and is never cited as a source. A proposal is not evidence.

**Relevance:** whether the source supports the specific proposition is assessed separately. Diké does not prove it.

## Decision axis

| State | Meaning |
| --- | --- |
| Pending | A proposal by the agent or a sub-agent without a decision. |
| Accepted | The lawyer applied it; the text changed and every citation became `stale`. |
| Rejected | The lawyer discarded it; it stays in the ledger as the matter's memory. |

A decision proves only that it was made: it does not verify a citation or make a conclusion true.

## Rules

- `ambiguous`, `refused` and `stale` are not verified. They are reported as they come.
- A citation that does not resolve in the corpus does not by itself prove that the provision does not exist.
- Case law and scholarship do not go through the engine: they are checked against their source and stay `[VERIFICAR]` meanwhile.
