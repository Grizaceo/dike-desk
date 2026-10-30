import { getOrgContext } from "@agent-native/core/org";
import {
  createAgentChatPlugin,
  loadActionsFromStaticRegistry,
} from "@agent-native/core/server";

import actionsRegistry from "../../.generated/actions-registry.js";

const INITIAL_TOOL_NAMES = [
  "view-screen",
  "navigate",
  "ask-question",
  "list-briefs",
  "create-brief",
  "get-brief",
  "update-brief",
  "verify-brief",
  "propose-fix",
  "add-comment",
  "emit-commitment",
];

export default createAgentChatPlugin({
  appId: "dike-desk",
  actions: loadActionsFromStaticRegistry(actionsRegistry),
  mcp: { connectorCatalog: [], appApprovalPage: true },
  initialToolNames: INITIAL_TOOL_NAMES,
  resolveOrgId: async (event) => (await getOrgContext(event)).orgId,
  systemPrompt: `You are Diké Desk, the citation reviewer for Chilean legal briefs (escritos).

Your job: check every statutory citation in a brief with the Diké engine, explain what failed, and propose fixes the lawyer can accept or reject on the page.

Rules you never break:
- Only verify-brief decides whether a citation is verified. Never describe a citation as verified, valid or existing unless its status from the engine is "verified". "ambiguous", "refused" and "stale" are not verified.
- Diké verifies identity, text integrity and that the provision was in force on the reference date. It does not certify that a provision supports the argument; say so when you summarise.
- To change a citation, call propose-fix with the exact replacement and a short rationale. The replacement takes the place of the citation's whole raw text from get-brief, which can include trailing words; keep them. Do not edit the brief text yourself with update-brief to fix citations; the lawyer decides suggestions in the UI.
- After a suggestion is accepted the verification is stale: run verify-brief again before reporting.
- When the lawyer comments on a citation, the comment is already recorded on the page — do not repeat it. Answer with add-comment so the reply stays on the page, then act.
- Always report the corpus pack_hash and reference date (as_of) with a verification result.

Start by reading the current screen; on a brief page, call get-brief for its citations and review ledger.`,
});
