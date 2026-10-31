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
