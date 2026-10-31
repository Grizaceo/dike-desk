import type { Citation, ReviewItem } from "./brief-types";

export type ActivityItem = {
  item: ReviewItem;
  /** Anchored to a citation from an earlier verification that no longer exists. */
  historical: boolean;
};

const WORD_CHAR = /[\p{L}\p{N}]/u;

export type BodySegment = { text: string; citation?: Citation };

function isWordChar(char: string | undefined) {
  return char !== undefined && WORD_CHAR.test(char);
}

/** A match must not sit inside a longer token (`artículo 16` vs `artículo 161`). */
function isWordBounded(body: string, start: number, end: number) {
  return !isWordChar(body[start - 1]) && !isWordChar(body[end]);
}

function boundedOccurrences(body: string, raw: string) {
  const hits: number[] = [];
  if (!raw) return hits;
  let from = 0;
  while (from <= body.length) {
    const index = body.indexOf(raw, from);
    if (index < 0) break;
    const end = index + raw.length;
    if (isWordBounded(body, index, end)) hits.push(index);
    from = index + 1;
  }
  return hits;
}

/**
 * Place each citation on a word-bounded copy of its `raw`, preferring the
 * occurrence nearest the stored offset. Accepting a fix of a different length
 * marks every citation stale without moving `start`/`end`, so a later citation
 * no longer lines up; this keeps it marked until verify runs again. Spans are
 * not reused.
 */
export function locateCitationSpans(body: string, citations: Citation[]) {
  const occurrences = new Map<string, number[]>();
  const hitsFor = (raw: string) => {
    let hits = occurrences.get(raw);
    if (!hits) {
      hits = boundedOccurrences(body, raw);
      occurrences.set(raw, hits);
    }
    return hits;
  };

  const candidates = citations.flatMap((citation) =>
    hitsFor(citation.raw).map((start) => ({
      citation,
      start,
      distance: Math.abs(start - citation.start),
    })),
  );
  candidates.sort(
    (a, b) =>
      a.distance - b.distance ||
      a.start - b.start ||
      a.citation.start - b.citation.start,
  );

  const usedIds = new Set<string>();
  const usedRanges: Array<{ start: number; end: number }> = [];
  const placed: Array<{ citation: Citation; start: number; end: number }> = [];
  for (const candidate of candidates) {
    if (usedIds.has(candidate.citation.id)) continue;
    const end = candidate.start + candidate.citation.raw.length;
    if (
      usedRanges.some(
        (range) => candidate.start < range.end && range.start < end,
      )
    ) {
      continue;
    }
    usedIds.add(candidate.citation.id);
    usedRanges.push({ start: candidate.start, end });
    placed.push({ citation: candidate.citation, start: candidate.start, end });
  }
  placed.sort((a, b) => a.start - b.start);
  const unlocated = citations.filter((citation) => !usedIds.has(citation.id));
  return { placed, unlocated };
}

export function bodySegments(body: string, citations: Citation[]) {
  const { placed, unlocated } = locateCitationSpans(body, citations);
  const segments: BodySegment[] = [];
  let cursor = 0;
  for (const span of placed) {
    if (span.start < cursor) continue;
    if (span.start > cursor)
      segments.push({ text: body.slice(cursor, span.start) });
    segments.push({
      text: body.slice(span.start, span.end),
      citation: span.citation,
    });
    cursor = span.end;
  }
  if (cursor < body.length) segments.push({ text: body.slice(cursor) });
  return { segments, unlocated };
}

/** A missing brief is 404 / `not_found`. Network and permission failures are not. */
export function isMissingBriefError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const record = error as { errorCode?: unknown; status?: unknown };
  return record.errorCode === "not_found" || record.status === 404;
}

// Statute-article mention: «artículo/articulo/artículos/art./arts.» plus a
// number (optionally bis/ter), on Unicode word boundaries — like locate().
const MENTION = /(?:art[íi]culos?|arts?\.)\s*\d+(?:\s*(?:bis|ter))?/giu;

export type UndetectedCitation = { start: number; end: number; text: string };

/**
 * Mentions that look like statute citations but the engine did not report:
 * any match overlapping a located citation span is already shown, and a match
 * contained in an unlocated citation's raw is the same citation.
 */
export function findUndetectedCitations(
  body: string,
  citations: Pick<Citation, "raw" | "start" | "end">[],
): UndetectedCitation[] {
  const out: UndetectedCitation[] = [];
  for (const match of body.matchAll(MENTION)) {
    const start = match.index;
    const end = start + match[0].length;
    if (!isWordBounded(body, start, end)) continue;
    const covered = citations.some((citation) =>
      citation.start >= 0
        ? start < citation.end && citation.start < end
        : citation.raw.includes(match[0]),
    );
    if (!covered) out.push({ start, end, text: match[0] });
  }
  return out;
}

/** Ordered i18n keys for the engine's own codes; unknown codes yield none. */
export function engineReasonKeys(
  citation: Pick<
    Citation,
    "status" | "resolution" | "vigencia" | "historicalTextState"
  >,
) {
  const keys: string[] = [];
  if (citation.status !== "verified") {
    if (citation.resolution === "AMBIGUOUS") keys.push("reason.ambiguous");
    else if (citation.resolution === "UNRESOLVABLE")
      keys.push("reason.unresolvable");
    else if (citation.resolution === "RESOLVED")
      keys.push("reason.resolvedNotVerified");
    else if (citation.resolution === "NOT_IN_FORCE")
      keys.push("reason.notInForce");
    else if (citation.resolution === "TEMPORAL_UNKNOWN")
      keys.push("reason.temporalUnknown");
    else if (citation.resolution === "PROVENANCE_INCOMPLETE")
      keys.push("reason.provenanceIncomplete");
    else if (citation.resolution === "HISTORICAL_TEXT_UNAVAILABLE")
      keys.push("historical.unavailable");
  }
  const vigencia = citation.vigencia;
  if (vigencia === "IN_FORCE") keys.push("vigencia.inForce");
  else if (vigencia === "OUT_OF_FORCE") keys.push("vigencia.outOfForce");
  else if (vigencia === "UNKNOWN_BEFORE_SNAPSHOT")
    keys.push("vigencia.unknownBeforeSnapshot");
  else if (vigencia === "DESCONOCIDO") keys.push("vigencia.desconocido");
  if (
    citation.historicalTextState === "HISTORICAL_TEXT_UNAVAILABLE" &&
    !keys.includes("historical.unavailable")
  )
    keys.push("historical.unavailable");
  return keys;
}

/** Error codes that have a catalog message under `errors.*` (copy.md). */
export const KNOWN_ERROR_CODES = [
  "not_found",
  "not_verified",
  "partial_needs_confirmation",
  "partial_confirmation_ui_only",
  "commitment_mismatch",
  "commitment_not_emitted",
  "commitment_hash_mismatch",
  "already_decided",
  "stale_citation",
  "brief_changed",
  "dike_unavailable",
  "dike_docker_unavailable",
  "dike_failed",
  "dike_bad_output",
  "brief_too_large",
  "invalid_as_of",
  "empty_update",
] as const;

/**
 * Maps an action error to catalog text: known errorCode -> `errors.<code>`,
 * anything else -> the caller's per-action fallback key. The raw server
 * message is never shown.
 */
export function actionErrorText(
  t: (key: string, params?: Record<string, unknown>) => string,
  error: unknown,
  fallbackKey: string,
) {
  const code = (error as { errorCode?: unknown } | null)?.errorCode;
  if (
    typeof code === "string" &&
    (KNOWN_ERROR_CODES as readonly string[]).includes(code)
  )
    return t(`errors.${code}`);
  return t(fallbackKey);
}

export function safeExternalUrl(url: string | null) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? url
      : null;
  } catch {
    return null;
  }
}

/** Review items that belong in Activity: unanchored, or anchored to a past verification. */
export function getActivityItems(
  review: ReviewItem[],
  citations: Pick<Citation, "id">[],
  { currentVerification }: { currentVerification: boolean },
): ActivityItem[] {
  const current = new Set(citations.map((citation) => citation.id));
  const engineNotes = review.filter(
    (item) => item.kind === "agent_note" && item.author === "engine",
  );
  const lastEngineNote = engineNotes[engineNotes.length - 1];
  const out: ActivityItem[] = [];
  for (const item of review) {
    if (!item.citationId)
      out.push({
        item,
        historical:
          item.kind === "agent_note" &&
          item.author === "engine" &&
          (!currentVerification || item !== lastEngineNote),
      });
    else if (!current.has(item.citationId))
      out.push({ item, historical: true });
  }
  return out;
}

/** Review items shown on a current citation's card. */
export function getCitationItems(review: ReviewItem[], citationId: string) {
  return review.filter((item) => item.citationId === citationId);
}
