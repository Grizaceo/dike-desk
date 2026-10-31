import { useT } from "@agent-native/core/client/i18n";

import type { ReviewItem } from "@/lib/brief-types";

export function ReviewAuthor({ author }: { author: ReviewItem["author"] }) {
  const t = useT();
  return (
    <>
      {author === "user"
        ? t("brief.authorYou")
        : author === "agent"
          ? t("brief.authorAgent")
          : t("brief.authorEngine")}
    </>
  );
}

export function SuggestionState({ state }: { state: ReviewItem["state"] }) {
  const t = useT();
  return (
    <>
      {state === "accepted"
        ? t("brief.statusAccepted")
        : state === "rejected"
          ? t("brief.statusRejected")
          : state === "expired"
            ? t("brief.statusExpired")
            : t("brief.statusPending")}
    </>
  );
}
