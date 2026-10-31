import { useT } from "@agent-native/core/client/i18n";

import { cn } from "@/lib/utils";

export type CitationStatus = "verified" | "ambiguous" | "refused" | "stale";

export const STATUS_STYLES: Record<
  CitationStatus,
  { badge: string; mark: string }
> = {
  verified: {
    badge: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    mark: "bg-emerald-500/15 decoration-emerald-600",
  },
  ambiguous: {
    badge: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    mark: "bg-amber-500/20 decoration-amber-600",
  },
  refused: {
    badge: "bg-red-500/15 text-red-700 dark:text-red-300",
    mark: "bg-red-500/15 decoration-red-600",
  },
  stale: {
    badge: "bg-muted text-muted-foreground",
    mark: "bg-muted decoration-muted-foreground",
  },
};

const STATUS_LABEL_KEYS: Record<CitationStatus, string> = {
  verified: "status.verified",
  ambiguous: "status.ambiguous",
  refused: "status.refused",
  stale: "status.stale",
};

export function StatusBadge({ status }: { status: CitationStatus }) {
  const t = useT();
  const style = STATUS_STYLES[status];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium",
        style.badge,
      )}
    >
      {t(STATUS_LABEL_KEYS[status])}
    </span>
  );
}

export function VerdictBadge({ verdict }: { verdict: string | null }) {
  const t = useT();
  if (!verdict)
    return (
      <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
        {t("verdict.notVerified")}
      </span>
    );
  if (verdict === "TODAS_VERIFICADAS") return <StatusBadge status="verified" />;
  const label =
    verdict === "SIN_CITAS"
      ? t("verdict.noCitations")
      : verdict === "SIN_CORPUS"
        ? t("verdict.noCorpus")
        : t("verdict.hasProblems");
  const style =
    verdict === "SIN_CITAS"
      ? STATUS_STYLES.ambiguous.badge
      : STATUS_STYLES.refused.badge;
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", style)}>
      {label}
    </span>
  );
}
