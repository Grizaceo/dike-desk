import { fetchAgentEngineStatus } from "@agent-native/core/client/client-status-requests";
import {
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
import {
  STATUS_LABEL_KEYS,
  STATUS_STYLES,
  VerdictBadge,
} from "@/components/briefs/StatusBadge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  actionErrorText,
  bodySegments,
  findUndetectedCitations,
  getActivityItems,
  getCitationItems,
  isMissingBriefError,
} from "@/lib/brief-review";
import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@agent-native/toolkit/ui/alert-dialog";

function toastError(
  t: (k: string, p?: Record<string, unknown>) => string,
  fallbackKey: string,
) {
  return (error: unknown) =>
    toast.error(actionErrorText(t, error, fallbackKey));
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
  const { data, isPending, isError, error, refetch, isFetching } =
    useActionQuery("get-brief", { briefId });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [cardFocus, setCardFocus] = useState<{
    id: string;
    nonce: number;
  } | null>(null);
  const focusNonce = useRef(0);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [editBase, setEditBase] = useState("");
  const [asOf, setAsOf] = useState("");
  const [asOfTouched, setAsOfTouched] = useState(false);
  const [confirmPartial, setConfirmPartial] = useState(false);
  const [engineStatus, setEngineStatus] = useState<{
    configured?: boolean;
    engine?: string;
    model?: string;
    openAiBaseUrlConfigured?: boolean;
  } | null>(null);
  useEffect(() => {
    let live = true;
    fetchAgentEngineStatus<{
      configured?: boolean;
      engine?: string;
      model?: string;
      openAiBaseUrlConfigured?: boolean;
    }>()
      .then((result) => {
        if (!live) return;
        setEngineStatus(result.state === "available" ? result.value : {});
      })
      .catch(() => {
        if (live) setEngineStatus({});
      });
    return () => {
      live = false;
    };
  }, []);

  const verify = useActionMutation("verify-brief", {
    onSuccess: (result) =>
      toast.success(
        t("brief.metaVerified", {
          verified: result.meta.citas_verificadas,
          total: result.meta.total_citas,
        }),
      ),
    onError: toastError(t, "brief.verifyFailed"),
  });
  const update = useActionMutation("update-brief", {
    onSuccess: () => setEditing(false),
    onError: toastError(t, "brief.saveFailed"),
  });
  // The panel reads the commitment from get-brief, which every successful
  // mutation refetches; the server clears it whenever the text changes.
  const commit = useActionMutation("emit-partial-certificate", {
    onSuccess: (result) => {
      setScrollToCommitment(true);
      toast.success(
        result.signed
          ? t("brief.committedSigned")
          : t("brief.committedUnsigned"),
      );
    },
    onError: toastError(t, "brief.commitFailed"),
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
  const { segments, unlocated } = useMemo(
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
    if (isError && !isMissingBriefError(error)) {
      return (
        <main className="flex flex-col items-start gap-3 p-6 text-sm">
          <p role="alert">{actionErrorText(t, error, "brief.loadFailed")}</p>
          <Button
            type="button"
            variant="outline"
            disabled={isFetching}
            onClick={() => void refetch()}
          >
            {t("brief.retry")}
          </Button>
          <Link className="underline" to="/briefs">
            {t("brief.backToBriefs")}
          </Link>
        </main>
      );
    }
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
  const meta = brief.meta as {
    as_of?: string;
    as_of_source?: string;
    pack_hash?: string;
    citas_verificadas?: number;
    total_citas?: number;
  } | null;
  const chosenAsOf =
    meta?.as_of_source === "abogado" || meta?.as_of_source === "agente"
      ? meta.as_of
      : undefined;
  const asOfValue = asOfTouched ? asOf : (chosenAsOf ?? "");
  const undetected = brief.meta
    ? findUndetectedCitations(brief.body, citations)
    : [];
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

        {unlocated.length > 0 ? (
          <p
            role="status"
            className="rounded-lg border border-border bg-muted px-3 py-2 text-sm"
          >
            {t(
              unlocated.length === 1
                ? "brief.unlocatedOne"
                : "brief.unlocatedMany",
              { count: unlocated.length },
            )}
          </p>
        ) : null}

        {editing ? (
          <>
            <label htmlFor="brief-edit-body" className="sr-only">
              {t("brief.editBodyLabel")}
            </label>
            <textarea
              id="brief-edit-body"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              className="min-h-[60vh] w-full rounded-xl border border-input bg-background p-5 font-serif text-[15px] leading-7 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </>
        ) : (
          <article className="whitespace-pre-wrap rounded-xl border border-border bg-card p-5 font-serif text-[15px] leading-7">
            {segments.map((part, index) =>
              part.citation ? (
                <button
                  key={part.citation.id}
                  id={`citation-mark-${part.citation.id}`}
                  type="button"
                  aria-pressed={selectedId === part.citation.id}
                  aria-label={t("brief.citationMark", {
                    citation: part.text,
                    status: t(STATUS_LABEL_KEYS[part.citation.status]),
                  })}
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
          <div className="flex flex-wrap items-end gap-2">
            <Button
              disabled={busy || editing}
              onClick={() =>
                verify.mutate({
                  briefId,
                  ...(asOfValue
                    ? { asOf: asOfValue }
                    : asOfTouched
                      ? { resetAsOf: true }
                      : {}),
                })
              }
            >
              <IconShieldCheck className="size-4" />
              {verify.isPending
                ? t("brief.verifyProgress")
                : t("brief.verifyButton")}
            </Button>
            <div className="flex flex-col gap-1">
              <label
                htmlFor="brief-as-of"
                className="text-xs text-muted-foreground"
              >
                {t("brief.asOfLabel")}
              </label>
              <input
                id="brief-as-of"
                type="date"
                value={asOfValue}
                max={santiagoToday()}
                disabled={busy || editing}
                onChange={(event) => {
                  setAsOf(event.target.value);
                  setAsOfTouched(true);
                }}
                title={t("brief.asOfHint")}
                className="h-8 rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              />
            </div>
            <Button
              variant="outline"
              disabled={busy || editing || !brief.verdict || !meta?.total_citas}
              onClick={() =>
                brief.verdict === "TODAS_VERIFICADAS"
                  ? commit.mutate({ briefId })
                  : setConfirmPartial(true)
              }
            >
              <IconCertificate className="size-4" /> {t("brief.emitCommitment")}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{t("brief.asOfHint")}</p>
          {meta ? (
            <p className="text-xs text-muted-foreground">
              {t("brief.metaVerified", {
                verified: meta.citas_verificadas,
                total: meta.total_citas,
              })}{" "}
              · {t("brief.metaCorpus")}{" "}
              <code>{String(meta.pack_hash).slice(0, 16)}</code> ·{" "}
              {meta.as_of_source === "abogado"
                ? t("brief.metaAsOfLawyer", { date: meta.as_of })
                : meta.as_of_source === "agente"
                  ? t("brief.metaAsOfAgent", { date: meta.as_of })
                  : t("brief.metaAsOfEngine", { date: meta.as_of })}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              {t("brief.notVerified")}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            {t("brief.metaChecked")}
          </p>
          <PrivacyNote t={t} status={engineStatus} />
        </div>

        {undetected.length > 0 ? (
          <p
            role="status"
            className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm dark:border-amber-900 dark:bg-amber-950/40"
          >
            {t(
              undetected.length === 1
                ? "brief.undetectedOne"
                : "brief.undetectedMany",
              { count: undetected.length },
            )}{" "}
            <span className="font-mono text-xs">
              {undetected.map((u) => u.text).join(" · ")}
            </span>
          </p>
        ) : null}

        {citations.map((citation) => (
          <CitationCard
            key={citation.id}
            briefId={briefId}
            citation={citation}
            items={getCitationItems(review, citation.id)}
            selected={selectedId === citation.id}
            onSelect={() => setSelectedId(citation.id)}
            decisionsLocked={busy || editing}
            onShowInText={
              !editing &&
              segments.some((part) => part.citation?.id === citation.id)
                ? () => focusCitationMark(citation.id)
                : undefined
            }
            metaAsOf={meta?.as_of}
            metaPackHash={meta?.pack_hash}
          />
        ))}
        {commitment ? (
          <div ref={commitmentRef}>
            <CommitmentPanel
              data={commitment}
              certificateCheck={brief.certificateCheck}
              body={brief.body}
            />
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
                  {item.body === "accepted"
                            ? t("brief.statusAccepted")
                            : item.body === "rejected"
                              ? t("brief.statusRejected")
                              : item.body}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </aside>

      <AlertDialog open={confirmPartial} onOpenChange={setConfirmPartial}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("brief.partialTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("brief.partialBody", {
                count: (meta?.total_citas ?? 0) - (meta?.citas_verificadas ?? 0),
                total: meta?.total_citas ?? 0,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={commit.isPending}>
              {t("brief.partialCancel")}
            </AlertDialogCancel>
            <Button
              disabled={commit.isPending}
              onClick={() => {
                setConfirmPartial(false);
                commit.mutate({ briefId });
              }}
            >
              {t("brief.partialConfirm")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}

function santiagoToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
  }).format(new Date());
}

function PrivacyNote({
  t,
  status,
}: {
  t: (k: string, p?: Record<string, unknown>) => string;
  status: {
    configured?: boolean;
    engine?: string;
    model?: string;
    openAiBaseUrlConfigured?: boolean;
  } | null;
}) {
  if (!status)
    return (
      <p className="text-xs text-muted-foreground">{t("brief.privacyUnknown")}</p>
    );
  if (status.configured === false)
    return (
      <p className="text-xs text-muted-foreground">
        {t("brief.privacyNotConfigured")}
      </p>
    );
  if (status.configured !== true || (!status.engine && !status.model))
    return (
      <p className="text-xs text-muted-foreground">{t("brief.privacyUnknown")}</p>
    );
  return (
    <p className="text-xs text-muted-foreground">
      {t("brief.privacyConfigured", {
        engine: status.engine ?? "",
        model: status.model ?? "",
      })}
      {status.openAiBaseUrlConfigured ? (
        <> {t("brief.privacyCustomEndpoint")}</>
      ) : null}
    </p>
  );
}
