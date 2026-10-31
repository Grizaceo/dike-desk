import { fail } from "@agent-native/core/action";

const AS_OF_FORMAT = /^\d{4}-\d{2}-\d{2}$/;
const INVALID_AS_OF_MESSAGE =
  "La fecha de referencia debe ser una fecha válida (AAAA-MM-DD) que no sea posterior a hoy.";

function invalidAsOf(): never {
  return fail(INVALID_AS_OF_MESSAGE, {
    errorCode: "invalid_as_of",
    statusCode: 400,
  });
}

// "Today" for a Chilean legal brief is the date in Chile, not UTC.
const santiagoToday = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Santiago",
});

/**
 * Validate a lawyer/agent-chosen reference date (vigencia al as_of): a real
 * calendar day in AAAA-MM-DD form, not after today in America/Santiago.
 */
export function parseAsOf(value: string, now = new Date()): string {
  if (!AS_OF_FORMAT.test(value)) invalidAsOf();
  const [year, month, day] = value.split("-").map(Number);
  if (year === undefined || month === undefined || day === undefined)
    invalidAsOf();
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  )
    invalidAsOf();
  if (value > santiagoToday.format(now)) invalidAsOf();
  return value;
}
