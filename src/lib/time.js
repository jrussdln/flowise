/* ------------------------------------------------------------------
   Time — the app stores TRUE INSTANTS (UTC, ISO), so rows mean the
   same moment no matter where the server or browser sits. What the
   user SEES, though, is Philippine time: the app's home timezone.
   Every clock the UI draws goes through these helpers so a row added
   at 11 PM in Manila reads 11 PM on every machine.

   parseInstant — Supabase may hand a timestamp back with the offset
   dropped ("2026-10-18 02:22:00"). JavaScript would read that string
   as the BROWSER's local time, shifting the day wherever the browser
   isn't in the PH. The server only ever writes UTC, so a value with
   no offset is treated as the UTC instant it is.
   ------------------------------------------------------------------ */

export const PH_TIME_ZONE = "Asia/Manila";

/* "2026-10-18T02:22:00" / "2026-10-18 02:22:00" — no Z, no offset. */
const NAIVE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/;

/** The instant behind a stored timestamp — null when there's none. */
export function parseInstant(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  const text = String(value).trim();
  const date = new Date(NAIVE.test(text) ? `${text.replace(" ", "T")}Z` : text);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "Oct 18, 2026" — the PHILIPPINE calendar day of the instant. */
export function formatDatePH(value) {
  const date = parseInstant(value);
  return date
    ? date.toLocaleDateString("en-PH", {
        year: "numeric",
        month: "short",
        day: "numeric",
        timeZone: PH_TIME_ZONE,
      })
    : "—";
}

/** "Oct 18, 2026, 10:24 PM" — same day, with the PH wall-clock time. */
export function formatDateTimePH(value) {
  const date = parseInstant(value);
  return date
    ? date.toLocaleString("en-PH", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZone: PH_TIME_ZONE,
      })
    : "—";
}
