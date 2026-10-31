import { describe, expect, it } from "vitest";

import enMessages from "../app/i18n/en-US.js";
import esMessages from "../app/i18n/es-ES.js";
import {
  DEFAULT_LEGAL_PERSONALITY,
  LEGAL_PERSONALITIES,
  legalPersonalityContent,
  parseLegalPersonality,
} from "../app/lib/legal-personality.js";

describe("parseLegalPersonality", () => {
  it.each(LEGAL_PERSONALITIES)("parses %s", (personality) => {
    expect(parseLegalPersonality(`perfil: ${personality}`)).toBe(personality);
  });

  it.each([
    null,
    undefined,
    "",
    "garbage",
    "perfil: otro",
    "perfil: otro\nperfil: ",
  ])("defaults to eclectico for %j", (content) => {
    expect(parseLegalPersonality(content)).toBe(DEFAULT_LEGAL_PERSONALITY);
  });

  it.each(LEGAL_PERSONALITIES)("round-trips %s", (personality) => {
    expect(parseLegalPersonality(legalPersonalityContent(personality))).toBe(
      personality,
    );
  });
});

describe("legalPersonalityContent", () => {
  it("writes the positivist profile file verbatim", () => {
    expect(legalPersonalityContent("positivista")).toBe(
      "# Personalidad jurídica\n\nperfil: positivista\n\nAplica la personalidad «Positivista jurídica» definida en `instructions/filosofia-juridica.md` (compartido). Elegida en Ajustes → Aplicación → General.\n",
    );
  });
});

describe("legalPersonality i18n", () => {
  it("keeps Spanish and English key sets identical", () => {
    expect(Object.keys(esMessages.legalPersonality).sort()).toEqual(
      Object.keys(enMessages.legalPersonality).sort(),
    );
  });
});
