import type { Citation, ReviewItem } from "./brief-types";

export type ActivityItem = {
  item: ReviewItem;
  /** Anchored to a citation from an earlier verification that no longer exists. */
  historical: boolean;
};

export function bodySegments(body: string, citations: Citation[]) {
  const spans = citations
    .filter(
      (c) =>
        c.start >= 0 &&
        c.end <= body.length &&
        body.slice(c.start, c.end) === c.raw,
    )
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
