import {
  actionErrorMessage,
  useActionMutation,
  useActionQuery,
} from "@agent-native/core/client/hooks";
import { useT } from "@agent-native/core/client/i18n";
import {
  IconArrowLeft,
  IconPencil,
  IconCertificate,
  IconShieldCheck,
} from "@tabler/icons-react";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { toast } from "sonner";

import CitationCard from "@/components/briefs/CitationCard";
import CommitmentPanel, {
  type CommitmentData,
} from "@/components/briefs/CommitmentPanel";
import {
  ReviewAuthor,
  SuggestionState,
} from "@/components/briefs/ReviewAuthor";
import { STATUS_STYLES, VerdictBadge } from "@/components/briefs/StatusBadge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  bodySegments,
  getActivityItems,
  getCitationItems,
} from "@/lib/brief-review";
import { cn } from "@/lib/utils";

function toastError(fallback: string) {
  return (error: unknown) => toast.error(actionErrorMessage(error) ?? fallback);
}

function scrollBehavior(): ScrollBehavior {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? "auto"
    : "smooth";
}

function scrollAndFocus(el: HTMLElement, block: ScrollLogicalPosition) {
  el.scrollIntoView({ behavior: scrollBehavior(), block });
  el.focus({ preventScroll: true });
}

export default function BriefRoute() {
  const { briefId = "" } = useParams();
  const t = useT();
  const { data, isPending } = useActionQuery("get-brief", { briefId });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [cardFocus, setCardFocus] = useState<{
    id: string;
    nonce: number;
  } | null>(null);
  const focusNonce = useRef(0);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [editBase, setEditBase] = useState("");

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
    onSuccess: (result) => {
      setScrollToCommitment(true);
      toast.success(
        result.signed
          ? t("brief.committedSigned")
          : t("brief.committedUnsigned"),
      );
    },
    onError: toastError(t("brief.commitFailed")),
  });
  const commitmentRef = useRef<HTMLDivElement>(null);
  const [scrollToCommitment, setScrollToCommitment] = useState(false);
  useEffect(() => {
    if (!scrollToCommitment || !data?.brief.commitment) return;
    const el = commitmentRef.current;
    if (!el) return;
    el.scrollIntoView({ behavior: scrollBehavior(), block: "start" });
    setScrollToCommitment(false);
  }, [scrollToCommitment, data?.brief.commitment]);

  useEffect(() => {
    if (!cardFocus) return;
    const el = document.getElementById(`citation-card-${cardFocus.id}`);
    if (!el) return;
    scrollAndFocus(el, "nearest");
    setCardFocus(null);
  }, [cardFocus]);

  function selectCitationMark(id: string) {
    setSelectedId(id);
    focusNonce.current += 1;
    setCardFocus({ id, nonce: focusNonce.current });
  }

  function focusCitationMark(id: string) {
    const el = document.getElementById(`citation-mark-${id}`);
    if (!el) return;
    scrollAndFocus(el, "center");
  }

  const citations = data?.citations ?? [];
  const review = data?.review ?? [];
  const parts = useMemo(
    () => bodySegments(data?.brief.body ?? "", citations),
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
        {t("brief.notFound")}{" "}
        <Link className="underline" to="/briefs">
          {t("brief.backToBriefs")}
        </Link>
      </main>
    );
  }

  const { brief } = data;
  const commitment = brief.commitment as CommitmentData | null;
  const busy = verify.isPending || update.isPending || commit.isPending;
  const activity = getActivityItems(review, citations, {
    currentVerification: Boolean(brief.meta),
  });

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
                  onClick={() =>
                    update.mutate({
                      briefId,
                      body: draft,
                      expectedUpdatedAt: editBase,
                    })
                  }
                >
                  {t("brief.editSave")}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setEditing(false)}
                >
                  {t("brief.editCancel")}
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setDraft(brief.body);
                  setEditBase(brief.updatedAt);
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
                  key={part.citation.id}
                  id={`citation-mark-${part.citation.id}`}
                  type="button"
                  onClick={() => selectCitationMark(part.citation!.id)}
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
              {verify.isPending
                ? t("brief.verifyProgress")
                : t("brief.verifyButton")}
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
            items={getCitationItems(review, citation.id)}
            selected={selectedId === citation.id}
            onSelect={() => setSelectedId(citation.id)}
            onShowInText={
              !editing &&
              parts.some((part) => part.citation?.id === citation.id)
                ? () => focusCitationMark(citation.id)
                : undefined
            }
          />
        ))}
        {commitment ? (
          <div ref={commitmentRef}>
            <CommitmentPanel data={commitment} />
          </div>
        ) : null}

        {activity.length ? (
          <div className="rounded-xl border border-border bg-card p-4">
            <h2 className="mb-2 text-sm font-medium">
              {t("brief.activityTitle")}
            </h2>
            <ul className="space-y-1.5">
              {activity.map(({ item, historical }) => (
                <li key={item.id} className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">
                    <ReviewAuthor author={item.author} />
                  </span>{" "}
                  {historical ? (
                    <span className="rounded border border-border px-1 text-[10px]">
                      {t("brief.previousVerification")}
                    </span>
                  ) : null}{" "}
                  {item.kind === "suggestion" ? (
                    <>
                      {t(
                        item.author === "user"
                          ? "brief.userProposes"
                          : "brief.agentProposes",
                      )}{" "}
                      {item.replacement ? (
                        <code>{item.replacement}</code>
                      ) : (
                        <em>{t("brief.withdraw")}</em>
                      )}{" "}
                      · <SuggestionState state={item.state} />{" "}
                    </>
                  ) : null}
                  {item.body}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </aside>
    </main>
  );
}
