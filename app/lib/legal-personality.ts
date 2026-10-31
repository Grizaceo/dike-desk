export const LEGAL_PERSONALITY_PATH = "instructions/perfil-juridico.md";

export const LEGAL_PERSONALITIES = [
  "eclectico",
  "positivista",
  "iusnaturalista",
] as const;
export type LegalPersonality = (typeof LEGAL_PERSONALITIES)[number];
export const DEFAULT_LEGAL_PERSONALITY: LegalPersonality = "eclectico";

const PROFILE_PATTERN =
  /^perfil:\s*(eclectico|positivista|iusnaturalista)\s*$/m;

const LABELS: Record<LegalPersonality, string> = {
  eclectico: "Ecléctica",
  positivista: "Positivista jurídica",
  iusnaturalista: "Iusnaturalista",
};

export function parseLegalPersonality(
  content: string | null | undefined,
): LegalPersonality {
  const match = content?.match(PROFILE_PATTERN);
  return (
    (match?.[1] as LegalPersonality | undefined) ?? DEFAULT_LEGAL_PERSONALITY
  );
}

export function legalPersonalityContent(personality: LegalPersonality): string {
  return `# Personalidad jurídica\n\nperfil: ${personality}\n\nAplica la personalidad «${LABELS[personality]}» definida en \`instructions/filosofia-juridica.md\` (compartido). Elegida en Ajustes → Aplicación → General.\n`;
}
