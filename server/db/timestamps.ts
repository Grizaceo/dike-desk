import { sql } from "drizzle-orm";

// One UTC format for every timestamp the app stores in TEXT.
// `YYYY-MM-DDTHH:mm:ss.sssZ` sorts chronologically as text, which list-briefs
// relies on. `now()::text` does not: it uses a space and a numeric offset.
export const ISO_TIMESTAMP_DEFAULT_SQL =
  `(to_char((clock_timestamp() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))`;

export const isoTimestampDefault = sql.raw(ISO_TIMESTAMP_DEFAULT_SQL);

export const ISO_UTC_TIMESTAMP =
  /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$/;

/** Wall-clock UTC timestamp in the same shape as the column default. */
export function isoNow() {
  return new Date().toISOString();
}
