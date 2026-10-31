import type getBrief from "../../actions/get-brief";

type BriefView = Awaited<ReturnType<typeof getBrief.run>>;

export type Citation = BriefView["citations"][number];
export type ReviewItem = BriefView["review"][number];
