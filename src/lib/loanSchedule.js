/* ------------------------------------------------------------------
   Loan-schedule dates, the client-side twin of server/utils/schedule.js.

   `tblentries` carries no date column, so every due date is derived
   from the loan's dttDueDate (the FIRST payment date) + index ×
   interest period: D = daily, W = weekly, M = monthly (default),
   A = annual. Dates without an explicit offset are read as UTC — the
   stored value is a wall-clock day, not an instant, so "Oct 2" stays
   "Oct 2" in every timezone.

   Shared by Loans.jsx (due-range label, overdue KPI, card pill) and
   LoanEntriesModal.jsx (each row's PAY/Repay date), which used to keep
   two hand-rolled copies of this arithmetic.
   ------------------------------------------------------------------ */

/**
 * Due date of the term at 0-based `index`, or null when the loan has no
 * first-payment date (or it is unparseable).
 */
export function nthDue(loan, index) {
  if (!loan?.dttDueDate) return null;
  const iso = /T/.test(loan.dttDueDate) ? loan.dttDueDate : `${loan.dttDueDate}T00:00:00`;
  const hasOffset = /(?:Z|[+-]\d{2}:?\d{2})$/.test(iso);
  const d = hasOffset ? new Date(iso) : new Date(`${iso}Z`);
  if (Number.isNaN(d.getTime())) return null;

  if (loan.cInterestType === "D") d.setUTCDate(d.getUTCDate() + index);
  else if (loan.cInterestType === "W") d.setUTCDate(d.getUTCDate() + index * 7);
  else if (loan.cInterestType === "A") d.setUTCFullYear(d.getUTCFullYear() + index);
  else d.setUTCMonth(d.getUTCMonth() + index); // M (default)
  return d;
}

/** Render the UTC fields so the stored wall-clock day shows exactly as picked. */
export function fmtDay(d) {
  return d.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/**
 * "Oct 2, 2027" for a single term, "Oct 2, 2027 - Nov 2, 2027" for a
 * range (2 monthly terms picked Oct 2 read on the card as the first and
 * last due dates). `last` is the last term's Date — null when the loan
 * has no usable date, so callers can test it directly.
 */
export function dueRange(loan) {
  const first = nthDue(loan, 0);
  if (!first) return { text: "—", last: null };

  const step = Math.max(0, (Number(loan.nTerms) || 1) - 1);
  const last = nthDue(loan, step);
  if (!last) return { text: "—", last: null };

  return { text: step === 0 ? fmtDay(first) : `${fmtDay(first)} - ${fmtDay(last)}`, last };
}

/**
 * How many terms of an ACTIVE loan are past due: the due dates that
 * already elapsed (before today) minus the terms actually settled
 * (nEntriesPaid = P/L/A). Counts only, so an advance payment on a later
 * term can never *hide* an earlier missed one — the number errs towards
 * 0 rather than flagging a loan that is on schedule.
 *
 * Pending loans have no schedule rows yet and Completed ones are fully
 * settled, so both read 0.
 */
export function overdueTerms(loan) {
  if (loan?.cStatus !== "A") return 0;
  const total = Number(loan.nTerms) || 0;
  if (!loan?.dttDueDate || total <= 0) return 0;

  const paid = Number(loan.nEntriesPaid) || 0;
  const now = new Date();
  // Today as a UTC wall-clock midnight, to match how due dates are stored.
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());

  let elapsed = 0;
  for (let i = 0; i < total; i += 1) {
    const due = nthDue(loan, i);
    if (!due || due.getTime() >= today) break; // due today is not late yet
    elapsed += 1;
  }
  return Math.max(0, elapsed - paid);
}
