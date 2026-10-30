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
  (`decide-suggestion` is `uiOnly`; plain HTTP gets 403). Pending: the engine's
  `cita_raw` can absorb trailing words («… dispone», «… permite al»), so
  replacements must keep them (now in the prompt, not re-run live); check that
  follow-ups land in one chat thread in a normal browser session (the scripted
  run reloaded pages, so each message opened a new thread)
- [x] Commitment panel: summary, JSON download, and the offline verification command when signed (unsigned says there is nothing to verify)
- [ ] Signed commitment through the app (local engine + content key), checked with `verificar_tercero.py`
- [ ] English/Spanish UI copy through the template's i18n catalog (brief screen and commitment panel done; list page, status badges, sidebar and engine notes still English)
- [ ] Optional: suggest a corrected article through IndexO / the legal graph (retrieval only; Diké still decides)
- [ ] Polish, then record the public Clips demo (synthetic brief only; no private data)
- [ ] Submit at builder.io/hackathon/submit
