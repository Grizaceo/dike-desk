import type { Citation, ReviewItem } from "./brief-types";

export type ActivityItem = {
  item: ReviewItem;
  /** Anchored to a citation from an earlier verification that no longer exists. */
  historical: boolean;
};

/** Review items that belong in Activity: unanchored, or anchored to a past verification. */
export function getActivityItems(
  review: ReviewItem[],
  citations: Pick<Citation, "id">[],
): ActivityItem[] {
  const current = new Set(citations.map((citation) => citation.id));
  const out: ActivityItem[] = [];
  for (const item of review) {
    if (!item.citationId) out.push({ item, historical: false });
    else if (!current.has(item.citationId))
      out.push({ item, historical: true });
  }
  return out;
}

/** Review items shown on a current citation's card. */
export function getCitationItems(review: ReviewItem[], citationId: string) {
  return review.filter((item) => item.citationId === citationId);
}
