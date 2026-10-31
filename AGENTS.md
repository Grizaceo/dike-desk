# Chat — Agent Guide

Chat is the minimal chat-first agent-native app. `/` redirects to shared sign-in, then `/home`, the editable Get started page. Chat lives at `/chat`; new chats start there. Actions carry capabilities; screens exist only for durable workflows.

## Skills

Search with `rg --hidden --follow`; read the exact linked guide before deeper work. `.agents/skills/build-an-app/SKILL.md` — start here for vague requests to create a domain app. `.agents/skills/adding-a-feature/SKILL.md` — cross-area feature checklist. Data/integrations: `.agents/skills/actions/SKILL.md`, `.agents/skills/storing-data/SKILL.md`, `.agents/skills/security/SKILL.md`, `.agents/skills/secrets/SKILL.md`, `.agents/skills/sharing/SKILL.md`. UI: `.agents/skills/frontend-design/SKILL.md`, `.agents/skills/shadcn-ui/SKILL.md`, `.agents/skills/client-side-routing/SKILL.md`. Agent context/workflows: `.agents/skills/context-awareness/SKILL.md`, `.agents/skills/real-time-sync/SKILL.md`, `.agents/skills/reliable-mutations/SKILL.md`, `.agents/skills/performance/SKILL.md`, `.agents/skills/delegate-to-agent/SKILL.md`. Framework: `.agents/skills/agent-native-docs/SKILL.md`, `.agents/skills/agent-native-toolkit/SKILL.md`, `.agents/skills/customizing-agent-native/SKILL.md`.

Use local docs only (no web research): `pnpm action docs-search --query "<topic>"`, `pnpm action docs-search --slug "<slug>"`, `pnpm action docs-search --list`, `pnpm action source-search --query "<pattern>"`, `pnpm action source-search --path <path>`, or `pnpm action source-search --list`. For external-agent integrations, read `pnpm action docs-search --slug "external-agents"`.

## Core rules

- UI feedback: target 100 ms, never exceed 400 ms; acknowledge before network work.
- Normal app data must flow through actions. Keep actions deterministic and focused; use agent chat/AgentSidebar for AI work and follow-ups in the same thread. Keep structured state in SQL and large files in configured storage; persist references only.
- For external integrations, inspect the workspace/provider connection catalog first; reuse its scoped resolver. Never hardcode credentials, webhook URLs, or private/customer data.
- Never fabricate. Report failures and recover; verify writes by reading the row or screen. Navigation is in `<current-screen>`; use `view-screen` for fresh visible-record details.

For custom branding, keep `server/plugins/agent-native-email-branding.ts` aligned: `app.name` appears in transactional email and optional `app.logoUrl` must be an absolute HTTPS URL.

## Application state

- `navigation` describes the view and selected ids. Chat is `chat` at `/chat` and `/chat/<threadId>`; `home` at `/home` redirects to `/briefs`; `/` opens shared sign-in/signup.
- Use `navigate` when supported and `view-screen` for a fresh read of visible details; basic navigation is already in `<current-screen>`.

## Building a domain app

Choose the primary workflow and route before editing. Add a domain route under `app/routes/` and set `app.homePath` in `server/plugins/agent-native-email-branding.ts` with `defineAppConfig`. The default Get started page lives at `/home`, and Chat stays at `/chat`; edit `app/routes/home.tsx` when replacing that page with a domain-specific home. Add a static link in `app/components/layout/Sidebar.tsx` before `ChatThreadsSection`; `Header.tsx` uses `APP_TITLE` elsewhere. Shared sidebar and AgentInspector remain.

Use `adding-a-feature` for functional parity and `frontend-design` for a user-facing screen. Keep feature guidance here; do not rewrite `README.md` or `DESIGN.md`. After all edits, run one typecheck, one doctor check, and one browser smoke of the primary workflow, including overlap rejection, cancellation freeing the slot, and authenticated landing. Skip production build and extra test suites.

Before building common workspace or agent UI, read `agent-native-toolkit`; for supported customization, read `customizing-agent-native`.

- Guarded verification: run `pnpm agent-native:doctor`; fix findings before done.

## Diké Desk

Citation review for Chilean legal briefs. `/briefs` lists briefs; `/briefs/:briefId` shows the text with every citation the engine reported marked in place, and a review panel. On brief pages `navigation` adds `briefId`.

- Only `verify-brief` (the Diké engine) sets citation status; it takes an optional reference date (`asOf`). `verified` is the only verified state — it means the provision exists and is in force on `as_of`; `ambiguous`, `refused` and `stale` are not. Never upgrade a status in prose.
- Fixes go through `propose-fix` (pending suggestion). Only the lawyer decides, in the UI (`decide-suggestion` is `uiOnly`). Accepting changes the text and makes every citation `stale`: verify again.
- Answer lawyer comments with `add-comment` so the answer stays on the page; the author is recorded from the caller, never from arguments.
- Diké does not certify that a provision supports the argument. Report `pack_hash` and `as_of` with results.
- Engine: `server/lib/dike.ts` runs `dike constancia --json` via `DIKE_DOCKER_IMAGE` or `DIKE_BIN`.
- Legal team: `server/plugins/legal-team-resources.ts` seeds `resources/es/` (instructions, sub-agents, skills, context) as shared agent resources once, insert-if-absent; `resources/en/` is the English mirror and must keep the same files. Edit the content there, not in the plugin. Seeding only inserts missing paths: content changes do not reach installs that were already seeded.

| Action          | Purpose                                             |
| --------------- | --------------------------------------------------- |
| list-briefs     | Briefs the user can see                             |
| create-brief    | New brief from text, or `demo: true`                |
| get-brief       | Text, citations, review ledger                      |
| update-brief    | Lawyer edits title/text (UI only, from the revision it started) |
| verify-brief    | Run Diké (optional `asOf` reference date), replace citation statuses |
| propose-fix     | Suggestion for one citation (author from the caller) |
| decide-suggestion | Lawyer accepts/rejects (UI only)                  |
| add-comment     | Comment on a brief or citation                      |
| emit-commitment | Issue the verification certificate (blocked while citations are unverified; partial only with the lawyer's UI confirmation; carries the brief fingerprint) |


### Pending in the Diké engine

- Sign a binding to the brief (fingerprint or salted commitment) inside the
  sealed commitment — today the fingerprint lives in the dike-desk wrapper.
- Return the provision text or excerpt so the UI can show it.
- Publish `verificar_tercero.py`, KEYS.md and the pack_hash manifest.
