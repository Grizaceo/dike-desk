const messages = {
  composer: {
    removeAttachment: "Remove {{name}}",
    removeReference: "Remove {{name}} reference",
  },
  settings: {
    title: "Settings",
    workspaceTitle: "Workspace",
    workspaceDescription:
      "Manage team members, organization access, and shared workspace preferences.",
    openTeamSettings: "Open team settings",
    openResourceSettings: "Open resource settings",
    agentTitle: "Manage agent",
    agentDescription:
      "Manage the agent's model, API keys, automations, voice, and other controls.",
    openAgentSettings: "Manage agent",
  },
  chat: {
    archiveChat: "Archive chat",
    archiveFailed: "Could not archive chat.",
    chats: "Chats",
    composerPlaceholder: "Ask anything",
    emptyState: "Ask me anything",
    heroDescription: "Ask the agent to inspect, explain, or change this app.",
    heroTitle: "How can I help?",
    inspectEmptyState: "Ask me anything about this app",
    inspectSuggestionAction: "Show available actions",
    inspectSuggestionCapabilities: "What can this app do?",
    inspectSuggestionHello: "Help me get started",
    newChat: "New chat",
    optionsFor: "Chat options for {{title}}",
    pinChat: "Pin chat",
    pinned: "Pinned",
    recents: "Recents",
    retryPreviousRequest:
      "Retry my previous request now that the model provider is connected.",
    invalidHandoffOptions:
      "The prompt was saved as a draft, but its chat settings could not be restored. Review the prompt, context, and model before sending it again.",
    recoveryDraftUnsaved:
      "These draft changes aren't saved. Reloading this chat may lose them.",
    retryAttachmentUnavailable:
      "Chat can't reopen this attachment for retry. Add an accessible file URL, then retry.",
    renameChat: "Rename chat",
    renameFailed: "Could not rename chat.",
    renameThread: "Rename {{title}}",
    suggestionActions: "Show me the available actions",
    suggestionCapabilities: "What can this app do?",
    suggestionCustomize: "Help me customize this app",
    unpinChat: "Unpin chat",
    untitledChat: "Untitled chat",
  },
  home: {
    communityTitle: "Connect with us",
    docsAddAction: "Add an action",
    docsAddPage: "Add a page",
    docsGettingStarted: "Getting started",
    docsKeyConcepts: "Key concepts",
    docsTitle: "Documentation",
    title: "Get started",
  },
  navigation: {
    briefs: "Briefs",
    chat: "Chat",
    collapseSidebar: "Collapse sidebar",
    database: "Database",
    expandSidebar: "Expand sidebar",
    extensions: "Extensions",
    home: "Home",
    navigation: "Navigation",
    navigationDescription: "Main navigation",
    observability: "Observability",
    openNavigation: "Open navigation",
    settings: "Settings",
    team: "Team",
  },
  pages: {
    databaseTitle: "Database",
    observabilityPageTitle: "Agent observability",
    teamTitle: "Team",
    teamCreateOrgDescription:
      "Create an organization to invite teammates and share this app.",
  },
  brief: {
    backToList: "Briefs",
    notFound: "Brief not found.",
    loadFailed: "Could not load this brief.",
    retry: "Retry",
    backToBriefs: "Back to briefs",
    editSave: "Save",
    editCancel: "Cancel",
    editText: "Edit text",
    editBodyLabel: "Brief text",
    verifyButton: "Verify with Diké",
    verifyProgress: "Verifying…",
    emitCommitment: "Issue verification certificate",
    committedSigned:
      "Verification certificate issued, with integrity seal",
    committedUnsigned: "Verification certificate issued (no seal)",
    verifyFailed: "Verification failed.",
    saveFailed: "Could not save the brief.",
    commitFailed: "Could not issue the certificate.",
    decideFailed: "Could not record the decision.",
    commentFailed: "Could not save the comment.",
    notVerified: "Not verified yet. Statuses come only from the Diké engine.",
    metaVerified: "{{verified}} of {{total}} detected citations exist and are in force",
    metaCorpus: "corpus",
    metaAsOfLawyer: "in force on {{date}} (date you chose)",
    metaAsOfAgent: "in force on {{date}} (date the agent chose)",
    metaAsOfEngine:
      "in force on {{date}} (today's date, not necessarily the date of the facts)",
    asOfLabel: "Reference date (in force on)",
    asOfHint:
      "Leave it empty and Diké uses today's date. You can choose another one, for example the date of the facts.",
    metaChecked:
      "Diké checks the citations to statutes that it detects (not case law or scholarship): it confirms that each provision exists in its corpus, has citable text and was in force on the reference date. It does not confirm that the provision supports your argument or that the paraphrase is faithful.",
    undetectedOne:
      "1 mention looks like a citation to a statute and Diké did not report it. Check it by hand: it has no status.",
    undetectedMany:
      "{{count}} mentions look like citations to statutes and Diké did not report them. Check them by hand: they have no status.",
    activityTitle: "Activity",
    agentProposes: "Agent's proposal:",
    userProposes: "Your proposal:",
    withdraw: "withdraw this citation",
    statusPending: "pending",
    statusAccepted: "accepted",
    statusRejected: "rejected",
    statusExpired: "no longer in effect",
    authorYou: "You",
    authorAgent: "Agent",
    authorEngine: "Diké",
    previousVerification: "Previous verification",
    engineLabel: "Engine",
    sourceLink: "Source",
    textHashLabel: "Text hash",
    verifiedWarning:
      "In force on {{as_of}} according to corpus {{pack_hash}}. Diké does not check whether the provision supports the sentence or whether the paraphrase is faithful (terms, amounts, requirements): compare it with the official text.",
    noTextSource:
      "Diké does not return the provision's text. Read it at the source before using the citation.",
    noText: "Diké does not return the provision's text.",
    askAgentPlaceholder:
      "Tell the agent… e.g., «this is the Labor Code»",
    commentLabel: "Comment for the agent",
    askAgentButton: "Send to agent",
    acceptButton: "Accept",
    rejectButton: "Reject",
    showInText: "Show in text",
    citationMark: "{{citation}}, {{status}}",
    unlocatedOne:
      "1 citation could not be located in the text. Verify again to refresh its position.",
    unlocatedMany:
      "{{count}} citations could not be located in the text. Verify again to refresh their positions.",
    acceptedAgentMessage:
      'I accepted the suggestion for "{{citation}}". Verify the brief again and report what Diké says.',
    copy: "Copy",
    copySuccess: "Copied to clipboard",
    copyFailed: "Could not copy to the clipboard.",
    partialTitle: "Some citations are not verified",
    partialBody:
      "{{count}} of {{total}} detected citations are not verified. If you continue, the certificate will say it is partial and will list every citation with its status. It is better to fix or withdraw them and verify again.",
    partialConfirm: "Issue partial certificate",
    partialCancel: "Go back and review",
    privacyConfigured:
      "Privacy: the Diké engine runs on this machine (with Docker, also with no network). The agent sends the brief's text and your comments to its model provider: {{engine}} · {{model}}. Unless that model runs on your machine, the text leaves it.",
    privacyCustomEndpoint:
      "A custom endpoint is in use (OPENAI_BASE_URL): check the agent's Settings to see which service it points to.",
    privacyNotConfigured:
      "Privacy: the Diké engine runs on this machine (with Docker, also with no network). The agent has no model provider configured.",
    privacyUnknown:
      "Privacy: the Diké engine runs on this machine (with Docker, also with no network). The agent sends the brief's text and your comments to its model provider; check which one in the agent's Settings.",
  },
  briefs: {
    title: "Briefs",
    description:
      "Paste a brief. Diké checks every citation to statutes (not case law or scholarship) against a dated, hash-identified corpus, and does not verify what it cannot prove. You decide every fix.",
    fieldTitle: "Title",
    fieldBody: "Text",
    bodyPlaceholder: "EN LO PRINCIPAL: …",
    createButton: "Create brief",
    loadDemo: "Load synthetic demo",
    createFailed: "Could not create the brief.",
    loadFailed: "Could not load briefs.",
    retry: "Retry",
    empty: "No briefs yet.",
  },
  commitment: {
    emitted: "Verification certificate issued",
    title: "Verification certificate (commitment)",
    partialHeaderOne: "Partial certificate: 1 citation not verified",
    partialHeaderMany: "Partial certificate: {{count}} citations not verified",
    listHeading: "All detected citations",
    hashLabel: "Brief fingerprint (SHA-256 of the normalized text)",
    textMatchOk: "The brief's current text matches this fingerprint.",
    textMismatch:
      "The brief's current text does NOT match this fingerprint: this certificate does not correspond to the current text.",
    downloadCertificate: "Download certificado.json",
    downloadJson: "Download commitment.json",
    downloadText: "Download the certificate’s text (.txt)",
    downloadSig: "Download commitment.sig.json",
    downloadPub: "Download .pub",
    labelCommitmentHash: "Commitment fingerprint (commitment_hash, SHA-256)",
    labelKeyId: "Key identifier (key_id)",
    labelPackHash: "Corpus (pack_hash)",
    labelAsOf: "Reference date (as_of)",
    labelAsOfOrigen: "Date chosen by",
    asOfOrigenLawyer: "the lawyer",
    asOfOrigenAgent: "the agent",
    asOfOrigenEngine: "today's date (engine)",
    labelEmittedAt: "Issued",
    labelScope: "Scope",
    showJson: "Show full JSON",
    sealTitle: "Integrity seal",
    badgeSealed: "commitment.json sealed · key {{key_id}}",
    badgeUnsealed: "No seal",
    sealScope:
      "The seal covers commitment.json only. certificado.json (title, brief fingerprint, citation list and partial flag) is not sealed: anyone can edit it. verificar_certificado.py checks that the text and the commitment match what the certificate says, not that the certificate is authentic.",
    certPrivacy:
      "certificado.json includes the brief's title, its fingerprint and the text of every citation. Share it only with whoever can already see the brief: with the fingerprint, anyone holding a draft can check whether it is this one.",
    sealExplanation:
      "The seal proves that commitment.json has not changed since it was sealed with this key. It does not identify the person who issued the certificate, does not give a certain date, and is not an advanced electronic signature under Chilean Law 19.799.",
    demoKey:
      "Demo key ({{key_id}}): it identifies no one. It is not the content key declared by the Diké project ({{published}}).",
    declaredKey:
      "Content key declared by the Diké project: it identifies the engine, not a person.",
    pubKeyCaveat:
      "This public key travels with the certificate itself: it can check the seal, but it is not a source of trust. Compare it with a key published through an independent channel.",
    independentVerifier:
      "The independent seal verifier (verificar_tercero.py) ships with the Diké engine repository, which is not public yet. Until then, a third party without access to that repository cannot check the seal with it. The brief fingerprint is checked with verifier/verificar_certificado.py in this repository.",
    unsealed:
      "No seal: nobody can check that this file did not change after it was issued. Whoever administers the installation can enable the seal.",
    labelAlgorithm: "Algorithm",
    labelRole: "Role",
    labelPubkey: "Public key (content-signing-key.pub)",
    offlineStep2: "Check commitment.json\u2019s integrity seal",
  },
  reason: {
    ambiguous:
      "The citation does not identify a single provision (e.g., the statute is missing).",
    unresolvable:
      "Diké did not find it in its corpus. That does not prove the provision does not exist.",
    resolvedNotVerified:
      "Diké identified the provision but could not establish that it was in force on the reference date.",
    notInForce:
      "Diké does not record the provision as in force on the reference date.",
    temporalUnknown:
      "Diké could not determine whether the provision applied on the reference date. That is not the same as repeal.",
    provenanceIncomplete:
      "The provenance of the text in the corpus is incomplete, so Diké does not vouch for it.",
  },
  vigencia: {
    inForce: "Recorded as in force on the reference date.",
    outOfForce: "Not recorded as in force on the reference date.",
    unknownBeforeSnapshot:
      "The corpus has no evidence of being in force before the date it was captured.",
    desconocido: "Unknown whether in force.",
  },
  historical: {
    unavailable: "No historical text for that date.",
  },
  status: {
    verified: "Exists and in force",
    ambiguous: "Ambiguous",
    refused: "Could not verify",
    stale: "Out of date: verify again",
  },
  verdict: {
    notVerified: "Not verified",
    allVerified: "All exist and are in force",
    hasProblems: "Some citations are not verified",
    noCitations: "Diké detected no citations",
    noCorpus: "Could not verify (no corpus)",
  },
  errors: {
    not_found: "The brief or item was not found.",
    no_citations: "Diké detected no citations: there is nothing to certify.",
    nothing_verified: "No citation was verified: there is nothing to certify.",
    not_verified: "Verify the current text before issuing the certificate.",
    partial_needs_confirmation:
      "There are unverified citations now. Check the current version; if you still want to issue, confirm the partial certificate.",
    commitment_mismatch:
      "The engine result does not match the stored verification. Verify again before issuing.",
    commitment_not_emitted:
      "The engine did not emit the certificate for this brief.",
    commitment_hash_mismatch:
      "The commitment fingerprint does not match the seal's. The certificate was not saved.",
    already_decided: "This suggestion was already decided.",
    stale_citation: "The brief changed under this suggestion. Verify again.",
    brief_changed:
      "The brief changed since you opened it. Check the current version and try again.",
    dike_unavailable: "The Diké engine is not configured on this installation.",
    dike_docker_unavailable:
      "Docker could not be used to run the Diké engine.",
    dike_failed: "The Diké engine failed. Try again.",
    dike_bad_output: "The Diké engine returned invalid output.",
    brief_too_large: "The brief exceeds the 400 KB the verifier accepts.",
    invalid_as_of:
      "The reference date must be a valid date (YYYY-MM-DD) not after today.",
    empty_update: "There are no changes to save.",
  },
  root: {
    commandActions: "Actions",
    commandAppearance: "Appearance",
    commandSearch: "Search",
    toggleTheme: "Toggle theme",
  },
};

export default messages;
