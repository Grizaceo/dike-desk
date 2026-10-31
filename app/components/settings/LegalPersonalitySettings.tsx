import { useT } from "@agent-native/core/client/i18n";
import {
  useCreateResource,
  useResource,
  useResources,
  useUpdateResource,
} from "@agent-native/core/client/resources/use-resources";
import { SettingsGroup } from "@agent-native/toolkit/app/settings";
import { Skeleton } from "@agent-native/toolkit/design-system";
import { useState } from "react";

import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  LEGAL_PERSONALITIES,
  LEGAL_PERSONALITY_PATH,
  legalPersonalityContent,
  parseLegalPersonality,
  type LegalPersonality,
} from "@/lib/legal-personality";

type SaveState = "idle" | "saving" | "saved" | "failed";

export function LegalPersonalitySettings() {
  const t = useT();
  const resourceList = useResources("personal");
  const meta = resourceList.data?.find(
    (resource) => resource.path === LEGAL_PERSONALITY_PATH,
  );
  const resource = useResource(meta?.id ?? null);
  const createResource = useCreateResource();
  const updateResource = useUpdateResource();
  const [state, setState] = useState<SaveState>("idle");

  const optionText: Record<
    LegalPersonality,
    { label: string; description: string }
  > = {
    eclectico: {
      label: t("legalPersonality.eclectico"),
      description: t("legalPersonality.eclecticoDescription"),
    },
    positivista: {
      label: t("legalPersonality.positivista"),
      description: t("legalPersonality.positivistaDescription"),
    },
    iusnaturalista: {
      label: t("legalPersonality.iusnaturalista"),
      description: t("legalPersonality.iusnaturalistaDescription"),
    },
  };

  const loading =
    resourceList.isPending || (Boolean(meta) && resource.isPending);
  const hasLoadError = resourceList.isError || resource.isError;
  const selected = parseLegalPersonality(resource.data?.content);

  const choose = async (personality: LegalPersonality) => {
    if (personality === selected || state === "saving") return;
    setState("saving");
    try {
      const content = legalPersonalityContent(personality);
      if (meta) await updateResource.mutateAsync({ id: meta.id, content });
      else
        await createResource.mutateAsync({
          path: LEGAL_PERSONALITY_PATH,
          content,
          mimeType: "text/markdown",
        });
      setState("saved");
    } catch {
      setState("failed");
    }
  };

  if (loading) {
    return (
      <SettingsGroup
        title={t("legalPersonality.title")}
        description={t("legalPersonality.description")}
      >
        <div className="space-y-3 px-5 py-4 sm:px-6" aria-busy="true">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-40" />
        </div>
      </SettingsGroup>
    );
  }

  if (hasLoadError) {
    return (
      <SettingsGroup
        title={t("legalPersonality.title")}
        description={t("legalPersonality.description")}
      >
        <p role="alert" className="px-5 py-4 text-sm text-destructive sm:px-6">
          {t("legalPersonality.loadFailed")}
        </p>
      </SettingsGroup>
    );
  }

  return (
    <SettingsGroup
      title={t("legalPersonality.title")}
      description={t("legalPersonality.description")}
    >
      <div className="space-y-4 px-5 py-4 sm:px-6">
        <RadioGroup
          value={selected}
          onValueChange={(value) => void choose(value as LegalPersonality)}
          disabled={state === "saving"}
          aria-label={t("legalPersonality.title")}
        >
          {LEGAL_PERSONALITIES.map((personality) => (
            <div key={personality} className="flex items-start gap-3">
              <RadioGroupItem
                id={`legal-personality-${personality}`}
                value={personality}
                className="mt-1"
              />
              <Label
                htmlFor={`legal-personality-${personality}`}
                className="flex-1 cursor-pointer space-y-1 font-normal"
              >
                <span className="block text-sm font-medium text-foreground">
                  {optionText[personality].label}
                </span>
                <span className="block text-sm leading-6 text-muted-foreground">
                  {optionText[personality].description}
                </span>
              </Label>
            </div>
          ))}
        </RadioGroup>
        <div className="flex min-h-5 items-center gap-3">
          {state === "saving" && (
            <span className="text-sm text-muted-foreground" role="status">
              {t("legalPersonality.saving")}
            </span>
          )}
          {state === "saved" && (
            <span className="text-sm text-muted-foreground" role="status">
              {t("legalPersonality.saved")}
            </span>
          )}
          {state === "failed" && (
            <span className="text-sm text-destructive" role="alert">
              {t("legalPersonality.saveFailed")}
            </span>
          )}
        </div>
        <p className="text-xs leading-5 text-muted-foreground">
          {t("legalPersonality.source")}
        </p>
      </div>
    </SettingsGroup>
  );
}
