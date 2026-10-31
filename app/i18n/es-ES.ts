const messages = {
  composer: {
    removeAttachment: "Quitar {{name}}",
    removeReference: "Eliminar la referencia {{name}}",
  },
  settings: {
    title: "Ajustes",
    workspaceTitle: "Espacio de trabajo",
    workspaceDescription:
      "Gestiona miembros del equipo, acceso de la organización y preferencias compartidas.",
    openTeamSettings: "Abrir ajustes del equipo",
    openResourceSettings: "Abrir ajustes de recursos",
    agentTitle: "Gestionar agente",
    agentDescription:
      "Gestiona el modelo del agente, claves API, automatizaciones, voz y otros controles.",
    openAgentSettings: "Gestionar agente",
  },
  chat: {
    archiveChat: "Archivar chat",
    archiveFailed: "No se pudo archivar el chat.",
    chats: "Chats",
    composerPlaceholder: "Pregunta lo que quieras",
    emptyState: "Pregúntame lo que quieras",
    heroDescription:
      "Pide al agente que inspeccione, explique o cambie esta app.",
    heroTitle: "¿Cómo puedo ayudarte?",
    inspectEmptyState: "Pregúntame cualquier cosa sobre esta app",
    inspectSuggestionAction: "Mostrar acciones disponibles",
    inspectSuggestionCapabilities: "¿Qué puede hacer esta app?",
    inspectSuggestionHello: "Ayúdame a empezar",
    newChat: "Nuevo chat",
    optionsFor: "Opciones de chat para {{title}}",
    pinChat: "Fijar chat",
    pinned: "Fijados",
    recents: "Recientes",
    retryPreviousRequest:
      "Reintenta mi solicitud anterior ahora que el proveedor del modelo está conectado.",
    invalidHandoffOptions:
      "El mensaje se guardó como borrador, pero no se pudieron restaurar sus ajustes de chat. Revisa el mensaje, el contexto y el modelo antes de volver a enviarlo.",
    recoveryDraftUnsaved:
      "Estos cambios del borrador no se guardaron. Si recargas este chat, podrías perderlos.",
    retryAttachmentUnavailable:
      "Chat no puede volver a abrir este archivo adjunto para reintentarlo. Añade una URL de archivo accesible y vuelve a intentarlo.",
    renameChat: "Renombrar chat",
    renameFailed: "No se pudo renombrar el chat.",
    renameThread: "Renombrar {{title}}",
    suggestionActions: "Muéstrame las acciones disponibles",
    suggestionCapabilities: "¿Qué puede hacer esta app?",
    suggestionCustomize: "Ayúdame a personalizar esta app",
    unpinChat: "Desfijar chat",
    untitledChat: "Chat sin título",
  },
  home: {
    communityTitle: "Conecta con nosotros",
    docsAddAction: "Añadir una acción",
    docsAddPage: "Añadir una página",
    docsGettingStarted: "Primeros pasos",
    docsKeyConcepts: "Conceptos clave",
    docsTitle: "Documentación",
    title: "Empieza aquí",
  },
  navigation: {
    briefs: "Escritos",
    chat: "Chat",
    collapseSidebar: "Contraer barra lateral",
    database: "Base de datos",
    expandSidebar: "Expandir barra lateral",
    extensions: "Extensiones",
    home: "Inicio",
    navigation: "Navegación",
    navigationDescription: "Navegación principal",
    observability: "Observabilidad",
    openNavigation: "Abrir navegación",
    settings: "Ajustes",
    team: "Equipo",
  },
  pages: {
    databaseTitle: "Base de datos",
    observabilityPageTitle: "Observabilidad del agente",
    teamTitle: "Equipo",
    teamCreateOrgDescription:
      "Crea una organización para invitar compañeros y compartir esta app.",
  },
  brief: {
    backToList: "Escritos",
    notFound: "Escrito no encontrado.",
    loadFailed: "No se pudo cargar este escrito.",
    retry: "Reintentar",
    backToBriefs: "Volver a escritos",
    editSave: "Guardar",
    editCancel: "Cancelar",
    editText: "Editar texto",
    editBodyLabel: "Texto del escrito",
    verifyButton: "Verificar con Diké",
    verifyProgress: "Verificando…",
    emitCommitment: "Emitir certificado de verificación",
    committedSigned: "Certificado de verificación emitido, con sello de integridad",
    committedUnsigned: "Certificado de verificación emitido (sin sello)",
    verifyFailed: "La verificación falló.",
    saveFailed: "No se pudo guardar el escrito.",
    commitFailed: "No se pudo emitir el certificado.",
    decideFailed: "No se pudo registrar la decisión.",
    commentFailed: "No se pudo guardar el comentario.",
    notVerified: "Aún no verificado. Los estados vienen solo del motor Diké.",
    metaVerified: "{{verified}} de {{total}} citas detectadas existen y están vigentes",
    metaCorpus: "corpus",
    metaAsOfLawyer: "vigencia al {{date}} (fecha elegida por ti)",
    metaAsOfAgent: "vigencia al {{date}} (fecha elegida por el agente)",
    metaAsOfEngine:
      "vigencia al {{date}} (fecha de hoy, no necesariamente la de los hechos)",
    asOfLabel: "Fecha de referencia (vigencia)",
    asOfHint:
      "Si la dejas vacía, Diké usa la fecha de hoy. Para un despido, suele importar la fecha de la separación.",
    metaChecked:
      "Diké revisa las citas a normas legales que detecta (no jurisprudencia ni doctrina): comprueba que cada norma exista en su corpus, tenga texto citable y esté vigente a la fecha de referencia. No comprueba que respalde tu argumento ni que la paráfrasis sea fiel.",
    undetectedOne:
      "Hay 1 mención que parece una cita a una norma y que Diké no reportó. Revísala a mano: no tiene estado.",
    undetectedMany:
      "Hay {{count}} menciones que parecen citas a normas y que Diké no reportó. Revísalas a mano: no tienen estado.",
    activityTitle: "Actividad",
    agentProposes: "Propuesta del agente:",
    userProposes: "Tu propuesta:",
    withdraw: "retirar esta cita",
    statusPending: "pendiente",
    statusAccepted: "aceptada",
    statusRejected: "rechazada",
    statusExpired: "sin efecto",
    authorYou: "Tú",
    authorAgent: "Agente",
    authorEngine: "Diké",
    previousVerification: "Verificación anterior",
    engineLabel: "Motor",
    sourceLink: "Fuente",
    textHashLabel: "Hash del texto",
    verifiedWarning:
      "Vigente al {{as_of}} según el corpus {{pack_hash}}. Diké no revisa si la norma respalda la frase ni si la paráfrasis es fiel (plazos, montos, requisitos): compárala con el texto oficial.",
    noTextSource:
      "Diké no entrega el texto de la norma. Léelo en la fuente antes de usar la cita.",
    noText: "Diké no entrega el texto de la norma.",
    askAgentPlaceholder:
      "Cuéntale al agente… p. ej., «esto es el Código del Trabajo»",
    commentLabel: "Comentario para el agente",
    askAgentButton: "Enviar al agente",
    acceptButton: "Aceptar",
    rejectButton: "Rechazar",
    showInText: "Ver en el texto",
    citationMark: "{{citation}}, {{status}}",
    unlocatedOne:
      "1 cita no se pudo ubicar en el texto. Verifica de nuevo para actualizar su posición.",
    unlocatedMany:
      "{{count}} citas no se pudieron ubicar en el texto. Verifica de nuevo para actualizar sus posiciones.",
    acceptedAgentMessage:
      "Acepté la sugerencia para «{{citation}}». Verifica de nuevo el escrito e informa lo que diga Diké.",
    copy: "Copiar",
    copySuccess: "Copiado al portapapeles",
    copyFailed: "No se pudo copiar al portapapeles.",
    partialTitle: "Hay citas sin verificar",
    partialBody:
      "{{count}} de {{total}} citas detectadas no están verificadas. Si continúas, el certificado dirá que es parcial y listará todas las citas con su estado. Lo recomendable es corregirlas o retirarlas y verificar de nuevo.",
    partialConfirm: "Emitir certificado parcial",
    partialCancel: "Volver a revisar",
    privacyConfigured:
      "Privacidad: el motor Diké corre en este equipo y sin red. El agente envía el texto del escrito y tus comentarios a su proveedor de modelo: {{engine}} · {{model}}. Salvo que ese modelo corra en tu equipo, el texto sale de él.",
    privacyCustomEndpoint:
      "Usa un endpoint propio (OPENAI_BASE_URL): revisa en Ajustes del agente a qué servicio apunta.",
    privacyNotConfigured:
      "Privacidad: el motor Diké corre en este equipo y sin red. El agente no tiene un proveedor de modelo configurado.",
    privacyUnknown:
      "Privacidad: el motor Diké corre en este equipo y sin red. El agente envía el texto del escrito y tus comentarios a su proveedor de modelo; revisa cuál en Ajustes del agente.",
  },
  briefs: {
    title: "Escritos",
    description:
      "Pega un escrito. Diké revisa cada cita a normas legales (no jurisprudencia ni doctrina) contra un corpus fechado e identificado por hash, y no verifica lo que no puede probar. Tú decides cada corrección.",
    fieldTitle: "Título",
    fieldBody: "Texto",
    bodyPlaceholder: "EN LO PRINCIPAL: …",
    createButton: "Crear escrito",
    loadDemo: "Cargar demo sintético",
    createFailed: "No se pudo crear el escrito.",
    loadFailed: "No se pudieron cargar los escritos.",
    retry: "Reintentar",
    empty: "Aún no hay escritos.",
  },
  commitment: {
    emitted: "Certificado de verificación emitido",
    title: "Certificado de verificación (commitment)",
    partialHeaderOne: "Certificado parcial: 1 cita no verificada",
    partialHeaderMany: "Certificado parcial: {{count}} citas no verificadas",
    listHeading: "Todas las citas detectadas",
    hashLabel: "Huella del escrito (SHA-256 del texto normalizado)",
    textMatchOk: "El texto actual del escrito coincide con esta huella.",
    textMismatch:
      "El texto actual del escrito NO coincide con esta huella: este certificado no corresponde al texto actual.",
    hashPrivacy:
      "certificado.json incluye la huella del escrito y el texto de cada cita. Compártelo solo con quien ya pueda ver el escrito: con la huella, cualquiera que tenga un borrador puede comprobar si es este.",
    downloadCertificate: "Descargar certificado.json",
    downloadJson: "Descargar commitment.json",
    downloadText: "Descargar el texto verificado (.txt)",
    downloadSig: "Descargar commitment.sig.json",
    downloadPub: "Descargar .pub",
    labelCommitmentHash: "Huella del commitment (commitment_hash, SHA-256)",
    labelKeyId: "Identificador de la llave (key_id)",
    labelPackHash: "Corpus (pack_hash)",
    labelAsOf: "Fecha de referencia (as_of)",
    labelAsOfOrigen: "Fecha elegida por",
    asOfOrigenLawyer: "el abogado",
    asOfOrigenAgent: "el agente",
    asOfOrigenEngine: "fecha de hoy (motor)",
    labelEmittedAt: "Emitido",
    labelScope: "Alcance",
    showJson: "Mostrar JSON completo",
    sealTitle: "Sello de integridad",
    badgeSealed: "Sello de integridad · llave {{key_id}}",
    badgeUnsealed: "Sin sello",
    sealExplanation:
      "El sello prueba que commitment.json no cambió desde que se selló con esta llave. No identifica a la persona que emitió el certificado, no da fecha cierta y no es firma electrónica avanzada en el sentido de la Ley 19.799.",
    demoKey:
      "Llave de demostración ({{key_id}}): no identifica a nadie. No es la llave de contenido que declara el proyecto Diké ({{published}}).",
    declaredKey:
      "Llave de contenido que declara el proyecto Diké: identifica al motor, no a una persona.",
    pubKeyCaveat:
      "Esta llave pública viaja con el propio certificado: sirve para comprobar el sello, no como fuente de confianza. Compárala con una llave publicada por un canal independiente.",
    independentVerifier:
      "El verificador independiente del sello (verificar_tercero.py) viene con el repositorio del motor Diké, que aún no es público. Mientras tanto, un tercero sin acceso a ese repositorio no puede comprobar el sello con él. La huella del escrito se comprueba con verifier/verificar_certificado.py de este repositorio.",
    unsealed:
      "Sin sello: nadie puede comprobar que este archivo no cambió después de emitirse. Quien administra la instalación puede activar el sello.",
    labelAlgorithm: "Algoritmo",
    labelRole: "Rol",
    labelPubkey: "Clave pública (content-signing-key.pub)",
    offlineStep2: "Verificar el commitment sellado",
  },
  reason: {
    ambiguous:
      "La cita no identifica una sola norma (p. ej., falta el cuerpo legal).",
    unresolvable:
      "Diké no la encontró en su corpus. Eso no prueba que la norma no exista.",
    resolvedNotVerified:
      "Diké identificó la norma, pero no pudo acreditar su vigencia a la fecha de referencia.",
    notInForce:
      "Diké no registra la norma como vigente a la fecha de referencia.",
    temporalUnknown:
      "Diké no pudo determinar si la norma regía a la fecha de referencia. Eso no equivale a una derogación.",
    provenanceIncomplete:
      "La procedencia del texto en el corpus está incompleta, así que Diké no la acredita.",
  },
  vigencia: {
    inForce: "Figura vigente a la fecha de referencia.",
    outOfForce: "No figura vigente a la fecha de referencia.",
    unknownBeforeSnapshot:
      "El corpus no tiene evidencia de vigencia para una fecha anterior a su captura.",
    desconocido: "Vigencia desconocida.",
  },
  historical: {
    unavailable: "No hay texto histórico para esa fecha.",
  },
  status: {
    verified: "Existe y está vigente",
    ambiguous: "Ambigua",
    refused: "No se pudo verificar",
    stale: "Desactualizada: verificar de nuevo",
  },
  verdict: {
    notVerified: "No verificado",
    allVerified: "Todas existen y están vigentes",
    hasProblems: "Hay citas sin verificar",
    noCitations: "Diké no detectó citas",
    noCorpus: "No se pudo verificar (sin corpus)",
  },
  errors: {
    not_found: "No se encontró el escrito o el elemento.",
    not_verified: "Verifica el texto actual antes de emitir el certificado.",
    partial_needs_confirmation:
      "Hay citas sin verificar: confirma la emisión parcial en la pantalla.",
    partial_confirmation_ui_only:
      "Solo el abogado puede confirmar una emisión parcial, desde la pantalla.",
    commitment_mismatch:
      "El resultado del motor no coincide con la verificación guardada. Verifica de nuevo antes de emitir.",
    commitment_not_emitted:
      "El motor no emitió el certificado para este escrito.",
    commitment_hash_mismatch:
      "La huella del commitment no coincide con la del sello. No se guardó el certificado.",
    already_decided: "Esta sugerencia ya fue decidida.",
    stale_citation: "El escrito cambió bajo esta sugerencia. Verifica de nuevo.",
    brief_changed:
      "El escrito cambió mientras lo editabas. Recarga y vuelve a intentarlo.",
    dike_unavailable: "El motor Diké no está configurado en esta instalación.",
    dike_docker_unavailable:
      "No se pudo usar Docker para ejecutar el motor Diké.",
    dike_failed: "El motor Diké falló. Inténtalo de nuevo.",
    dike_bad_output: "El motor Diké devolvió una salida no válida.",
    brief_too_large: "El escrito supera los 400 KB que acepta el verificador.",
    invalid_as_of:
      "La fecha de referencia debe ser una fecha válida (AAAA-MM-DD) que no sea posterior a hoy.",
    empty_update: "No hay cambios que guardar.",
  },
  root: {
    commandActions: "Acciones",
    commandAppearance: "Apariencia",
    commandSearch: "Buscar",
    toggleTheme: "Cambiar tema",
  },
};

export default messages;
