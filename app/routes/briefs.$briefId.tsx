import { sendToAgentChat } from "@agent-native/core/client/agent-chat";
import { useT } from "@agent-native/core/client/i18n";
import {
  actionErrorMessage,
  useActionMutation,
  useActionQuery,
} from "@agent-native/core/client/hooks";
import {
  IconArrowLeft,
  IconCheck,
  IconExternalLink,
  IconMessage,
  IconPencil,
  IconCertificate,
  IconShieldCheck,
  IconX,
} from "@tabler/icons-react";
import { Fragment, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { toast } from "sonner";

import {
  STATUS_STYLES,
  StatusBadge,
  VerdictBadge,
  type CitationStatus,
} from "@/components/briefs/StatusBadge";
import CommitmentPanel, {
  type CommitmentData,
} from "@/components/briefs/CommitmentPanel";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type Citation = {
  id: string;
  position: number;
  raw: string;
  start: number;
  end: number;
  status: CitationStatus;
  resolution: string | null;
  label: string | null;
  textSha256: string | null;
  sourceUrl: string | null;
  retrievedAt: string | null;
};

type ReviewItem = {
  id: string;
  citationId: string | null;
  kind: "comment" | "suggestion" | "decision" | "agent_note";
  author: "user" | "agent" | "engine";
  body: string;
  replacement: string | null;
  state: "pending" | "accepted" | "rejected" | "expired" | null;
  createdAt: string;
};

function toastError(fallback: string) {
  return (error: unknown) => toast.error(actionErrorMessage(error) ?? fallback);
}

/** Split the body into plain text and highlighted citation spans. */
function segments(body: string, citations: Citation[]) {
  const spans = citations
    .filter((c) => c.start >= 0 && c.end <= body.length)
    .sort((a, b) => a.start - b.start);
  const out: Array<{ text: string; citation?: Citation }> = [];
  let cursor = 0;
  for (const c of spans) {
    if (c.start < cursor) continue;
    if (c.start > cursor) out.push({ text: body.slice(cursor, c.start) });
    out.push({ text: body.slice(c.start, c.end), citation: c });
    cursor = c.end;
  }
  if (cursor < body.length) out.push({ text: body.slice(cursor) });
  return out;
}

export default function BriefRoute() {
  const { briefId = "" } = useParams();
  const t = useT();
  const { data, isPending } = useActionQuery("get-brief", { briefId });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const verify = useActionMutation("verify-brief", {
    onSuccess: (result) =>
      toast.success(
        t("brief.metaVerified", {
          verified: result.meta.citas_verificadas,
          total: result.meta.total_citas,
        }),
      ),
    onError: toastError(t("brief.verifyFailed")),
  });
  const update = useActionMutation("update-brief", {
    onSuccess: () => setEditing(false),
    onError: toastError(t("brief.saveFailed")),
  });
  // The panel reads the commitment from get-brief, which every successful
  // mutation refetches; the server clears it whenever the text changes.
  const commit = useActionMutation("emit-commitment", {
    onSuccess: (result) =>
      toast.success(
        result.signed
          ? t("brief.committedSigned")
          : t("brief.committedUnsigned"),
      ),
    onError: toastError(t("brief.commitFailed")),
  });

  const citations = (data?.citations ?? []) as Citation[];
  const review = (data?.review ?? []) as ReviewItem[];
  const parts = useMemo(
    () => segments(data?.brief.body ?? "", citations),
    [data?.brief.body, citations],
  );

  if (isPending) {
    return (
      <main className="grid gap-4 p-4 lg:grid-cols-[1fr_24rem]">
        <Skeleton className="h-[70vh] rounded-xl" />
        <Skeleton className="h-[70vh] rounded-xl" />
      </main>
    );
  }
  if (!data) {
    return (
      <main className="p-6 text-sm text-muted-foreground">
        {t("brief.notFound")} <Link className="underline" to="/briefs">
          {t("brief.backToBriefs")}
        </Link>
      </main>
    );
  }

  const { brief } = data;
  const commitment = brief.commitment as CommitmentData | null;
  const busy = verify.isPending || update.isPending || commit.isPending;
  const generalNotes = review.filter((r) => !r.citationId);

  return (
    <main className="grid min-h-full gap-4 p-4 sm:p-6 lg:grid-cols-[minmax(0,1fr)_26rem]">
      {/* Left: the brief, with every citation the engine reported marked in place. */}
      <section className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <Link
              to="/briefs"
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              <IconArrowLeft className="size-3.5" /> {t("brief.backToList")}
            </Link>
            <h1 className="mt-1 truncate text-xl font-semibold tracking-tight">
              {brief.title}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <VerdictBadge verdict={brief.verdict} />
            {editing ? (
              <>
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() => update.mutate({ briefId, body: draft })}
                >
                  {t("brief.editSave")}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                  {t("brief.editCancel")}
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setDraft(brief.body);
                  setEditing(true);
                }}
              >
                <IconPencil className="size-4" /> {t("brief.editText")}
              </Button>
            )}
          </div>
        </div>

        {editing ? (
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            className="min-h-[60vh] w-full rounded-xl border border-input bg-background p-5 font-serif text-[15px] leading-7 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        ) : (
          <article className="whitespace-pre-wrap rounded-xl border border-border bg-card p-5 font-serif text-[15px] leading-7">
            {parts.map((part, index) =>
              part.citation ? (
                <button
                  key={index}
                  type="button"
                  onClick={() => setSelectedId(part.citation!.id)}
                  className={cn(
                    "rounded px-0.5 underline decoration-2 underline-offset-4",
                    STATUS_STYLES[part.citation.status].mark,
                    selectedId === part.citation.id && "ring-2 ring-ring",
                  )}
                >
                  {part.text}
                </button>
              ) : (
                <Fragment key={index}>{part.text}</Fragment>
              ),
            )}
          </article>
        )}
      </section>

      {/* Right: what the engine said, what the agent proposes, what the lawyer decided. */}
      <aside className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={busy || editing}
              onClick={() => verify.mutate({ briefId })}
            >
              <IconShieldCheck className="size-4" />
              {verify.isPending ? t("brief.verifyProgress") : t("brief.verifyButton")}
            </Button>
            <Button
              variant="outline"
              disabled={busy || editing || !brief.verdict}
              onClick={() => commit.mutate({ briefId })}
            >
              <IconCertificate className="size-4" /> {t("brief.emitCommitment")}
            </Button>
          </div>
          {brief.meta ? (
            <p className="text-xs text-muted-foreground">
              {t("brief.metaVerified", {
                verified: brief.meta.citas_verificadas,
                total: brief.meta.total_citas,
              })}{" "}
              · {t("brief.metaCorpus")}{" "}
              <code>{String(brief.meta.pack_hash).slice(0, 16)}</code> ·{" "}
              {t("brief.metaAsOf", { date: brief.meta.as_of })}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              {t("brief.notVerified")}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            {t("brief.metaChecked")}
          </p>
        </div>

        {citations.map((citation) => (
          <CitationCard
            key={citation.id}
            briefId={briefId}
            citation={citation}
            items={review.filter((r) => r.citationId === citation.id)}
            selected={selectedId === citation.id}
            onSelect={() => setSelectedId(citation.id)}
          />
        ))}
        {commitment ? <CommitmentPanel data={commitment} /> : null}

        {generalNotes.length ? (
          <div className="rounded-xl border border-border bg-card p-4">
            <h2 className="mb-2 text-sm font-medium">{t("brief.activityTitle")}</h2>
            <ul className="space-y-1.5">
              {generalNotes.map((note) => (
                <li key={note.id} className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {note.author === "user"
                      ? t("brief.authorYou")
                      : note.author === "agent"
                        ? t("brief.authorAgent")
                        : t("brief.authorEngine")}
                  </span>{" "}
                  {note.body}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </aside>
    </main>
  );
}

function CitationCard({
  briefId,
  citation,
  items,
  selected,
  onSelect,
}: {
  briefId: string;
  citation: Citation;
  items: ReviewItem[];
  selected: boolean;
  onSelect: () => void;
}) {
  const t = useT();
  const [comment, setComment] = useState("");
  const decide = useActionMutation("decide-suggestion", {
    onError: toastError(t("brief.decideFailed")),
  });
  const addComment = useActionMutation("add-comment", {
    onError: toastError(t("brief.commentFailed")),
  });

  function askAgent(event: React.FormEvent) {
    event.preventDefault();
    const text = comment.trim();
    if (!text) return;
    setComment("");
    // The comment stays on the page; the agent picks it up in a visible turn.
    addComment.mutate(
      { briefId, citationId: citation.id, body: text },
      {
        onSuccess: () =>
          sendToAgentChat({
            message: text,
            context: JSON.stringify({
              briefId,
              citationId: citation.id,
              citation: citation.raw,
              status: citation.status,
            }),
            submit: true,
            openSidebar: true,
          }),
      },
    );
  }

  return (
    <article
      onClick={onSelect}
      className={cn(
        "flex flex-col gap-2 rounded-xl border bg-card p-3",
        selected ? "border-ring" : "border-border",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <strong className="min-w-0 text-sm font-medium">{citation.raw}</strong>
        <StatusBadge status={citation.status} />
      </div>
      {citation.label ? (
        <p className="text-xs text-muted-foreground">{citation.label}</p>
      ) : null}
      {citation.status !== "verified" && citation.resolution ? (
        <p className="text-xs">
          {t("brief.engineLabel")}: <code>{citation.resolution}</code>
        </p>
      ) : null}
      {citation.sourceUrl ? (
        <a
          href={citation.sourceUrl}
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
              <span className="font-medium">{t("brief.agentProposes")}</span>{" "}
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
                  disabled={decide.isPending}
                  onClick={() =>
                    decide.mutate({ suggestionId: item.id, decision: "accepted" })
                  }
                >
                  <IconCheck className="size-3.5" /> {t("brief.acceptButton")}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={decide.isPending}
                  onClick={() =>
                    decide.mutate({ suggestionId: item.id, decision: "rejected" })
                  }
                >
                  <IconX className="size-3.5" /> {t("brief.rejectButton")}
                </Button>
              </div>
            ) : (
              <p className="mt-1 font-medium capitalize">
                {item.state === "accepted"
                  ? t("brief.statusAccepted")
                  : item.state === "rejected"
                    ? t("brief.statusRejected")
                    : item.state === "expired"
                      ? t("brief.statusExpired")
                      : t("brief.statusPending")}
              </p>
            )}
          </div>
        ) : (
          <p key={item.id} className="text-xs">
            <span className="font-medium">
              {item.author === "user"
                ? t("brief.authorYou")
                : item.author === "agent"
                  ? t("brief.authorAgent")
                  : t("brief.authorEngine")}
              :
            </span>{" "}
            {item.body}
          </p>
        ),
      )}

      <form onSubmit={askAgent} className="flex gap-2">
        <input
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          placeholder={t("brief.askAgentPlaceholder")}
          className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <Button
          type="submit"
          size="sm"
          variant="outline"
          disabled={!comment.trim()}
          aria-label={t("brief.askAgentButton")}
          title={t("brief.askAgentButton")}
        >
          <IconMessage className="size-3.5" />
        </Button>
      </form>
    </article>
  );
}
