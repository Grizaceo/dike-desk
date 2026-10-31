# Diké Desk

**An agent that checks the law you cite — and shows its work on the page.**

Diké Desk is a citation-review workspace for Chilean legal briefs, built with
[Agent-Native](https://github.com/BuilderIO/agent-native) for the
Agent-Native Hackathon.

Most legal AI hands you a wall of text. Diké Desk shows the evidence inline instead:

1. **Paste a brief.** Every statutory citation the Diké engine finds is
   marked in place: green *exists and in force* on the reference date, amber
   *ambiguous*, red *could not verify*.
2. **See why.** Each citation card shows the engine's reason, the official
   source and the corpus `pack_hash`. Diké **refuses to certify what it cannot
   prove**: «artículo 60» with no statute is ambiguous; «artículo 640 del
   Código del Trabajo» is not in Diké's corpus, so Diké does not verify it —
   that alone does not prove it does not exist. (The Diké engine repository
   is private for now; you need access to run it.)
3. **Tell the agent what to do next.** Leave a comment on a citation ("this is
   the Código del Trabajo"). The comment stays on the page, and the agent
   answers there: when it has a consulted official source it quotes the
   provision's text, warns when the provision does not support the sentence,
   and proposes an exact fix or a withdrawal.
4. **You decide.** Accept or reject each suggestion. Only the lawyer can
   decide: the action is UI-only, so the agent cannot approve its own work.
   Accepting marks the verification *stale* until Diké runs again.
5. **Issue the certificate.** Issue a verification certificate that lists
   every detected citation with its status, the reference date the lawyer
   chose, the corpus `pack_hash` and a SHA-256 fingerprint of the brief
   text. Issuing is blocked while citations are not verified, unless the
   lawyer confirms a partial certificate. The engine's commitment can carry
   an integrity seal (a demo key that identifies no one; not an advanced
   electronic signature under Chilean Law 19.799).

> Diké checks that a provision exists, has citable text and was in force on
> the reference date. It does **not** check that the provision supports your
> argument or that the paraphrase is faithful — that remains the lawyer's
> judgment, and the app says so.

## Architecture

```text
Browser (React, Agent-Native UI)          Agent chat (sidebar)
        │  useActionQuery / useActionMutation      │ tools
        └──────────────┬───────────────────────────┘
                       ▼
            Shared actions (actions/*.ts)
   list/create/get/update-brief · verify-brief · propose-fix
   decide-suggestion (uiOnly) · add-comment · emit-commitment
   · emit-partial-certificate (uiOnly)
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

The agent is **LexO**, an orchestrator with a team of sub-agents (researcher, case designer, drafter, contradictor, judge, deadlines clerk), ten skills and a layered memory policy, adapted from the author's earlier LexO work. They are seeded as agent resources you can read and edit in the agent page; the content lives in [`resources/`](resources/) (Spanish, with an English mirror). Seeding only adds missing resources, so later content changes do not overwrite an existing install or your edits.

## Run it

Requirements: Node ≥ 22.22, pnpm (via `corepack enable`), Docker.

```bash
# 1. Build the Diké engine image (once)
# The dike repository is private for now — you need access to clone it.
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
«artículo 60»): the agent answers on the page, shows what art. 60 of the
Código del Trabajo is about from a consulted source (the payment of wages
owed when a worker dies), warns that it does not support the sentence and
proposes withdrawing the citation; accept it and the agent verifies again.
The full script is in [`DEMO.md`](DEMO.md).

## Verification on Netlify

The Diké engine does not run inside the Netlify deploy. `verify-brief` and
`emit-commitment` call `runConstancia`, which starts the engine only when
`DIKE_DOCKER_IMAGE` or `DIKE_BIN` is set. A serverless function has neither,
and the adapter waits up to 120 seconds, which is longer than a Netlify
function is allowed to run. On that deploy both actions return 503
(`dike_unavailable`).

Two ways to verify a brief:

1. **Run the demo locally.** Build the engine image or install `DIKE_BIN`, then
   start the app with `pnpm dev`, as in [Run it](#run-it).
2. **Run the engine as a separate service** with its own URL and its own
   timeout, and point the app at that service. That is not implemented. The
   app only starts the engine as a local binary or a Docker container on the
   same machine.

## Integrity seal

Sealing needs the local engine (`DIKE_BIN=dike`, not Docker) and an Ed25519
content key, mode 0600, kept outside this repository. The app only passes the
engine `--sign`; it never reads, generates or moves the key.

```bash
# Once: create a demo key with the engine's own helper (refuses to overwrite)
python3 -c "from lexo_cli.content_signing import generar_content_key as g; print(g('~/.config/dike-desk/demo-content-signing-key.pem')[1])"

LEXO_CONTENT_SIGNING_KEY_PATH=~/.config/dike-desk/demo-content-signing-key.pem pnpm dev
```

On a verified brief, **Issue verification certificate** (the lawyer confirms
a partial one on screen when needed), then download `commitment.json`,
`commitment.sig.json` and `content-signing-key.pub` from the panel. The seal
is an integrity seal: it proves `commitment.json` did not change after
sealing; a demo key identifies no one and is not an advanced electronic
signature under Chilean Law 19.799.

The independent seal verifier `verificar_tercero.py` and KEYS.md ship with
the Diké repository, which is not public yet — a third party without access
cannot run that check today. With access, the check is:

```bash
python3 verificar_tercero.py commitment.json commitment.sig.json content-signing-key.pub
# exit 0 = VERIFICADO, 1 = NO VERIFICADO, 2 = could not evaluate
```

A demo key proves integrity only against itself: compare the printed `key_id`
with the one the Diké project declares (`3c7b3fde075efbe3`). The panel warns
when they differ.

## Checking a certificate

`verifier/verificar_certificado.py` in this repository is a stdlib-only
script that works fully offline:

```bash
python3 verifier/verificar_certificado.py certificado.json escrito-del-certificado.txt [commitment.json]
# exit 0 = COINCIDE, 1 = NO COINCIDE, 2 = NO SE PUDO EVALUAR
```

It normalizes the brief text exactly as the app does and compares it against
the certificate's `escrito.sha256`; with `commitment.json` it also compares
the canonical hash against `commitment_hash`. It does **not** check the
integrity seal (that is `verificar_tercero.py` above) nor whether the
provisions support the legal argument.

## Privacy

With Docker the Diké engine runs with `--network none`; a local binary
(`DIKE_BIN`, which sealing needs) gets no network block from the app. The agent's model provider receives the brief text and the
comments: the brief page names the configured provider, and the model is
configurable — it can be a local one (for example Ollama). lexo.md's rule
against sending case data to other external tools is an instruction to the
model, not a technical control.

## Limits

- Only statutory citations the engine detects get a status: the count is of
  detected citations, and the page flags mentions that look like citations
  but were not reported. Case law and scholarship are not checked.
- The engine does not check pertinence or paraphrase, and does not return the
  provision's text.
- Sub-agents are the same model with a different role prompt, not
  independent reviews.
- The brief fingerprint lives in the dike-desk wrapper certificate, not
  inside the engine-sealed commitment (see the engine pending item in
  [`AGENTS.md`](AGENTS.md)).
- UI-only actions prove the request came from the signed-in session
  holder's browser context (cookie + same-origin + UI capability), not
  that a human clicked: a client holding the lawyer's session cookie can
  still call them.
- The seal covers `commitment.json` only. `certificado.json` (title, brief
  fingerprint, citation list and partial flag) is not sealed: anyone can
  edit it. `verificar_certificado.py` checks that the text and the
  commitment match what the certificate says, not that the certificate is
  authentic.

## Scripted end-to-end demo

`scripts/demo-e2e.mjs` drives the whole loop in one headless Chromium page
(Playwright, client-side navigation only — the same session shape a lawyer
gets in a real browser): load the synthetic demo, set the reference date to
2026-09-15, verify, comment on «artículo 60» so the agent checks whether the
provision supports the sentence and proposes a withdrawal, accept it in the
UI, fix the art. 168 paraphrase with «Editar texto» and verify again,
comment on «artículo 640 del Código del Trabajo», then issue the partial
certificate (lawyer-only confirmation) and check the fingerprint with
`verifier/verificar_certificado.py`.

Prerequisites:

- The dev server running with the engine configured (`DIKE_BIN` or
  `DIKE_DOCKER_IMAGE` in `.env`) and a model provider in the environment, as
  above. `AUTH_DISABLED=true` keeps the script login-free.
- Optional signing: `LEXO_CONTENT_SIGNING_KEY_PATH=<key.pem>` on the dev
  server makes `emit-commitment` sign (local `DIKE_BIN` only). Without it the
  run still works but the signature download step fails.
- `pnpm install` (Playwright is a dev dependency; `pnpm exec playwright
  install chromium` once if the browser is not cached yet).

```bash
node scripts/demo-e2e.mjs --out <dir> [--base http://localhost:8080] \
  [--verifier /path/to/verificar_tercero.py]
```

`--out` is required and must be outside the repository — every artifact
lands there: a screenshot per step, `get-brief` JSON snapshots,
`transcript-<id>.txt` for every chat thread the run touched,
`certificado.json`, `escrito-del-certificado.txt`, `commitment.json` /
`commitment.sig.json` / `content-signing-key.pub` when signed,
`verifier.txt` (plus a tampered negative control) and `summary.json` with
all checks. Exit code is nonzero if a hard step fails; soft findings are
reported inside `summary.json`.

## What works today

- Verify a brief with the local Diké engine at a reference date the lawyer
  chooses: every detected citation is marked in place with the engine's
  reason (on this synthetic brief: 4 exist and are in force, 1 ambiguous, 1 could not verify).
- The review loop: comments, agent proposals, lawyer-only decisions and a
  ledger that keeps rejected suggestions.
- The verification certificate: brief fingerprint, the full citation list, a
  partial-emission gate confirmed only by the lawyer, and an optional
  integrity seal with a demo key.

The demo script is in [`DEMO.md`](DEMO.md); the disclosure and plan are in
[`HACKATHON.md`](HACKATHON.md).

## License

MIT. The Diké engine and its statutory corpus are distributed separately under
their own terms (see the dike repository).
