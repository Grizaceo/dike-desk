import { sendToAgentChat } from "@agent-native/core/client/agent-chat";
import {
  actionErrorMessage,
  useActionMutation,
} from "@agent-native/core/client/hooks";
import { useT } from "@agent-native/core/client/i18n";
import {
  IconCheck,
  IconExternalLink,
  IconMessage,
  IconX,
} from "@tabler/icons-react";
import { useState } from "react";
import { toast } from "sonner";

import {
  ReviewAuthor,
  SuggestionState,
} from "@/components/briefs/ReviewAuthor";
import { StatusBadge } from "@/components/briefs/StatusBadge";
import { Button } from "@/components/ui/button";
import { safeExternalUrl } from "@/lib/brief-review";
import type { Citation, ReviewItem } from "@/lib/brief-types";
import { cn } from "@/lib/utils";

function toastError(fallback: string) {
  return (error: unknown) => toast.error(actionErrorMessage(error) ?? fallback);
}

export default function CitationCard({
  briefId,
  citation,
  items,
  selected,
  onSelect,
  onShowInText,
  decisionsLocked = false,
}: {
  briefId: string;
  citation: Citation;
  items: ReviewItem[];
  selected: boolean;
  onSelect: () => void;
  /** Scroll the inline mark back into view. Omitted when the mark is not rendered. */
  onShowInText?: () => void;
  /** Page is editing, verifying, saving, or emitting a commitment. */
  decisionsLocked?: boolean;
}) {
  const t = useT();
  const [comment, setComment] = useState("");
  const sourceUrl = safeExternalUrl(citation.sourceUrl);
  const decide = useActionMutation("decide-suggestion", {
    onError: toastError(t("brief.decideFailed")),
  });
  const addComment = useActionMutation("add-comment", {
    onError: toastError(t("brief.commentFailed")),
  });

  function askAgent(event: React.FormEvent) {
    event.preventDefault();
    const text = comment.trim();
    if (!text || addComment.isPending) return;
    // The comment stays on the page; the agent picks it up in a visible turn.
    addComment.mutate(
      { briefId, citationId: citation.id, body: text },
      {
        onSuccess: (result) => {
          setComment("");
          sendToAgentChat({
            message: text,
            context: JSON.stringify({
              briefId,
              citationId: citation.id,
              citation: citation.raw,
              status: citation.status,
              commentId: result.id,
              note: "The lawyer's comment is already saved on the page; reply with add-comment.",
            }),
            submit: true,
            openSidebar: true,
          });
        },
      },
    );
  }

  return (
    <article
      id={`citation-card-${citation.id}`}
      tabIndex={-1}
      onClick={onSelect}
      className={cn(
        "flex flex-col gap-2 rounded-xl border bg-card p-3 focus:outline-none focus:ring-2 focus:ring-ring",
        selected ? "border-ring" : "border-border",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <strong className="min-w-0 text-sm font-medium">{citation.raw}</strong>
        <StatusBadge status={citation.status} />
      </div>
      {selected && onShowInText ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="self-start"
          onClick={(event) => {
            event.stopPropagation();
            onShowInText();
          }}
        >
          {t("brief.showInText")}
        </Button>
      ) : null}
      {citation.label ? (
        <p className="text-xs text-muted-foreground">{citation.label}</p>
      ) : null}
      {citation.status !== "verified" && citation.resolution ? (
        <p className="text-xs">
          {t("brief.engineLabel")}: <code>{citation.resolution}</code>
        </p>
      ) : null}
      {sourceUrl ? (
        <a
          href={sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground underline"
        >
          {t("brief.sourceLink")} <IconExternalLink className="size-3" />
        </a>
      ) : null}

      {items.map((item) =>
        item.kind === "suggestion" ? (
          <div
            key={item.id}
            className="rounded-lg border border-dashed border-border p-2 text-xs"
          >
            <p>
              <span className="font-medium">
                {t(
                  item.author === "user"
                    ? "brief.userProposes"
                    : "brief.agentProposes",
                )}
              </span>{" "}
              {item.replacement ? (
                <code>{item.replacement}</code>
              ) : (
                <em>{t("brief.withdraw")}</em>
              )}
            </p>
            <p className="mt-1 text-muted-foreground">{item.body}</p>
            {item.state === "pending" ? (
              <div className="mt-2 flex gap-2">
                <Button
                  size="sm"
                  disabled={decide.isPending || decisionsLocked}
                  onClick={() =>
                    decide.mutate(
                      { suggestionId: item.id, decision: "accepted" },
                      {
                        onSuccess: () =>
                          sendToAgentChat({
                            message: t("brief.acceptedAgentMessage", {
                              citation: citation.raw,
                            }),
                            context: JSON.stringify({
                              briefId,
                              suggestionId: item.id,
                              citationId: citation.id,
                              replacement: item.replacement,
                            }),
                            submit: true,
                            openSidebar: true,
                          }),
                      },
                    )
                  }
                >
                  <IconCheck className="size-3.5" /> {t("brief.acceptButton")}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={decide.isPending || decisionsLocked}
                  onClick={() =>
                    decide.mutate({
                      suggestionId: item.id,
                      decision: "rejected",
                    })
                  }
                >
                  <IconX className="size-3.5" /> {t("brief.rejectButton")}
                </Button>
              </div>
            ) : (
              <p className="mt-1 font-medium capitalize">
                <SuggestionState state={item.state} />
              </p>
            )}
          </div>
        ) : (
          <p key={item.id} className="text-xs">
            <span className="font-medium">
              <ReviewAuthor author={item.author} />:
            </span>{" "}
            {item.body}
          </p>
        ),
      )}

      {decide.isError ? (
        <p
          role="alert"
          className="text-xs font-medium text-red-700 dark:text-red-300"
        >
          {actionErrorMessage(decide.error) ?? t("brief.decideFailed")}
        </p>
      ) : null}

      <form onSubmit={askAgent} className="flex gap-2">
        <label htmlFor={`citation-comment-${citation.id}`} className="sr-only">
          {t("brief.commentLabel")}
        </label>
        <input
          id={`citation-comment-${citation.id}`}
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          placeholder={t("brief.askAgentPlaceholder")}
          disabled={addComment.isPending}
          className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        />
        <Button
          type="submit"
          size="sm"
          variant="outline"
          disabled={!comment.trim() || addComment.isPending}
          aria-label={t("brief.askAgentButton")}
          title={t("brief.askAgentButton")}
        >
          <IconMessage className="size-3.5" />
        </Button>
      </form>
    </article>
  );
}
