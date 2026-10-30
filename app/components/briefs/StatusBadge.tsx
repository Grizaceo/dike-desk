import { cn } from "@/lib/utils";

export type CitationStatus = "verified" | "ambiguous" | "refused" | "stale";

export const STATUS_STYLES: Record<
  CitationStatus,
  { label: string; badge: string; mark: string }
> = {
  verified: {
    label: "Verified",
    badge: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    mark: "bg-emerald-500/15 decoration-emerald-600",
  },
  ambiguous: {
    label: "Ambiguous",
    badge: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    mark: "bg-amber-500/20 decoration-amber-600",
  },
  refused: {
    label: "Refused",
    badge: "bg-red-500/15 text-red-700 dark:text-red-300",
    mark: "bg-red-500/15 decoration-red-600",
  },
  stale: {
    label: "Stale — verify again",
    badge: "bg-muted text-muted-foreground",
    mark: "bg-muted decoration-muted-foreground",
  },
};

export function StatusBadge({ status }: { status: CitationStatus }) {
  const style = STATUS_STYLES[status];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium",
        style.badge,
      )}
    >
      {style.label}
    </span>
  );
}

export function VerdictBadge({ verdict }: { verdict: string | null }) {
  if (!verdict)
    return (
      <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
        Not verified
      </span>
    );
  return verdict === "TODAS_VERIFICADAS" ? (
    <StatusBadge status="verified" />
  ) : (
    <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-xs font-medium text-red-700 dark:text-red-300">
      Has problems
    </span>
  );
}
