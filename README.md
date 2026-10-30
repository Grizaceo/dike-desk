# Diké Desk

**An agent that checks the law you cite — and shows its work on the page.**

Diké Desk is a citation-review workspace for Chilean legal briefs, built with
[Agent-Native](https://github.com/BuilderIO/agent-native) for the
Agent-Native Hackathon.

Most legal AI hands you a wall of text. Diké Desk shows the evidence inline instead:

1. **Paste a brief.** Every statutory citation the
   [Diké](https://github.com/Grizaceo/dike) engine finds is marked in place:
   green *verified*, amber *ambiguous*, red *refused*.
2. **See why.** Each citation card shows the engine's reason, the official
   source and the corpus `pack_hash`. Diké **refuses to certify what it cannot
   prove**: "artículo 60" with no statute is ambiguous; "artículo 9999 del
   Código del Trabajo" does not exist.
3. **Tell the agent what to do next.** Leave a comment on a citation ("this is
   the Código del Trabajo"). The comment stays on the page, and the agent
   answers there and proposes an exact fix.
4. **You decide.** Accept or reject each suggestion. Only the lawyer can
   decide: the action is UI-only, so the agent cannot approve its own work.
   Accepting marks the verification *stale* until Diké runs again.
5. **Commit.** Emit a commitment that lists only the verified citations.
   Anyone can check it offline, without this app's code.

> Diké checks that a provision exists, has citable text and was in force on
> the reference date. It does **not** check that the provision supports your
> argument — that remains the lawyer's judgment, and the app says so.

## Architecture

```text
Browser (React, Agent-Native UI)          Agent chat (sidebar)
        │  useActionQuery / useActionMutation      │ tools
        └──────────────┬───────────────────────────┘
                       ▼
            Shared actions (actions/*.ts)
   list/create/get/update-brief · verify-brief · propose-fix
   decide-suggestion (uiOnly) · add-comment · emit-commitment
                       │
          ┌────────────┴─────────────┐
          ▼                          ▼
  Postgres / PGlite            server/lib/dike.ts
  briefs · citations ·         `dike constancia --json`
  review_items (ledger)        (Docker, --network none)
```

The review ledger follows the review-graph idea from the wider LexO
ecosystem: proposals, decisions and comments are rows, and rejected
suggestions are kept, not deleted.

## Run it

Requirements: Node ≥ 22.22, pnpm (via `corepack enable`), Docker.

```bash
# 1. Build the Diké engine image (once)
git clone https://github.com/Grizaceo/dike && cd dike && docker build -t dike . && cd ..

# 2. Run the app
cd dike-desk
cp .env.example .env        # set DIKE_DOCKER_IMAGE=dike
corepack enable
pnpm install
pnpm dev
```

Open `/briefs`, click **Load synthetic demo**, then **Verify with Diké**.

The agent needs a model provider; configure one in the app's agent settings,
or through the environment. Any OpenAI-compatible endpoint works, e.g. NVIDIA NIM:
`OPENAI_API_KEY=<key> OPENAI_BASE_URL=https://integrate.api.nvidia.com/v1
AGENT_ENGINE=ai-sdk:openai AGENT_MODEL=minimaxai/minimax-m3.1-flash pnpm dev`.

Then comment on a citation (e.g. «esto es el Código del Trabajo» on
«artículo 60»): the agent answers on the page and proposes a fix; accept it
and the agent verifies again.

## Status

This is the hackathon skeleton: the data model, the actions, the engine
adapter and the review screen. See [`HACKATHON.md`](HACKATHON.md) for the
disclosure of pre-existing work and the remaining plan.

## License

MIT. The Diké engine and its statutory corpus are distributed separately under
their own terms (see the dike repository).
