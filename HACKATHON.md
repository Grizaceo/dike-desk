# Agent-Native Hackathon — disclosure and plan

Submission deadline: **2026-11-09, 11:59 PM PT**. Required: working app built
with Agent-Native, public Clips demo, submission form.

## Pre-existing work (disclosed per the official rules)

| Component | Origin | Used how |
|---|---|---|
| Agent-Native `chat` template | `npx @agent-native/core@0.222.2 create dike-desk --standalone --template chat` | App shell, auth, agent chat, action runtime |
| Diké engine (`dike constancia`) | [Grizaceo/dike](https://github.com/Grizaceo/dike), built before the hackathon | Called unchanged as an external process; not vendored here |
| Synthetic demo brief | `dike/docs/hackathon/escrito_demo.md` | Copied into `server/lib/demo-brief.ts` |
| Review-ledger idea | `review-graph` design in the author's LexO ecosystem | Concept only; no code copied |
| Repair loop idea | `dike-shield` (Open Agent Hackathon 2026) | Concept only; no code copied |

## Built during the hackathon

Everything else: the schema and migrations (`server/db`, `server/plugins/db.ts`),
the engine adapter (`server/lib/dike.ts`), all domain actions (`actions/*brief*`,
`propose-fix`, `decide-suggestion`, `add-comment`, `emit-commitment`), the
review screens (`app/routes/briefs*`, `app/components/briefs`), the agent
prompt and the navigation wiring.

## Plan to Nov 9

- [x] Skeleton: data model, actions, engine adapter, review screen
- [x] End-to-end run against the Docker engine on Linux (rootless Docker): create → verify (4/6) → emit commitment
- [ ] Same run on Windows (Docker Desktop); the adapter now mounts with `--mount`, untested there
- [x] Verify the mapping from engine `resolucion` values on the demo brief: `AMBIGUOUS` → `ambiguous`, `UNRESOLVABLE` → `refused`
- [x] Agent loop: comment → `add-comment` reply → `propose-fix` → accept → re-verify
  (2026-10-30, in the browser against `pnpm dev`, model `minimaxai/minimax-m3.1-flash`
  on NVIDIA NIM through the OpenAI-compatible engine). On the synthetic brief:
  4/6 → comment on «artículo 60» → agent proposes «artículo 60 del Código del
  Trabajo» → lawyer accepts → agent re-verifies: 5/6, corpus `af1422d66d1e6eee`,
  as of 2026-10-30; «artículo 9999» stays refused with a withdrawal proposal.
  Comment author now comes from the caller (UI → user, anything else → agent),
  accepting a suggestion expires the other pending ones, and accepting hands
  the re-verify to the agent. The agent cannot decide suggestions
  (`decide-suggestion` is `uiOnly`; plain HTTP gets 403).
- [x] Scripted demo `scripts/demo-e2e.mjs` (2026-10-30): the whole loop in one
  browser page, artifacts outside the repo. All three agent turns (comment,
  accept, comment on «artículo 9999») land in one chat thread; the earlier
  multi-thread result came from the old script reloading pages, which gives
  each load a new browser tab id. Withdrawals: the agent warns that the
  sentence is left broken and proposes a prose rewrite with `[brackets]`
  for what only the lawyer can supply (prompt only; decided option (a)).
  Still not exercised live: replacing a raw that absorbed trailing words
  («… dispone»). On the synthetic brief the only fixable raw («artículo 60»)
  has none
- [x] Commitment panel: summary, JSON download, and the offline verification command when signed (unsigned says there is nothing to verify)
- [x] Signed commitment through the app (2026-10-30): local engine
  (`DIKE_BIN`) + `LEXO_CONTENT_SIGNING_KEY_PATH`, emitted and downloaded from the
  panel, `verificar_tercero.py` → VERIFICADO (exit 0); a tampered copy → NO
  VERIFICADO (exit 1). Signed with a **synthetic demo key** (`key_id`
  `118d413b1af25080`) kept outside the repo, not the key published in
  Diké's KEYS.md (`3c7b3fde075efbe3`), whose signatures must be logged in the
  dike repo's signature register. The panel says so when the key_id differs.
  Pending: a signature with the published key, only if it is logged in that register
- [x] English/Spanish UI copy through the template's i18n catalog (2026-10-30: brief screen, commitment panel, list page, status/verdict badges, sidebar link). The agent's own replies follow the model's language
- [ ] Optional: suggest a corrected article through IndexO / the legal graph (retrieval only; Diké still decides)
- [ ] Polish, then record the public Clips demo (synthetic brief only; no private data)
- [ ] Submit at builder.io/hackathon/submit
