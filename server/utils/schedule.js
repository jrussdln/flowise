/* ------------------------------------------------------------------
   Loan-schedule helpers shared by the entries and loans controllers:
   when term #n falls due, and what the tbltransactions row generated
   by that payment looks like.

   tblentries carries no date column — every due date is derived from
   the loan's dttDueDate (the first payment date) + index × interest
   period, computed exactly like LoanEntriesModal.jsx does client-side
   (UTC setters, so the stored wall-clock day is the day the user
   picked and the ledger title matches the schedule it came from).

   Interest periods: D = daily, W = weekly, M = monthly (default),
   A = annual.
   ------------------------------------------------------------------ */

/** tbltransactions.cType for a loan payment. */
export const PAYMENT_TYPE = "P";
/** strDescription stamped on every generated payment row. */
export const PAYMENT_DESCRIPTION = "Loan Payment";
/* Description stamped on the Expense row that accompanies a deposit,
   loan installment or CARD PURCHASE REPAYMENT made FROM a card — the
   marker the cleanup flows use to find that row again (its own ledger
   row carries the business side). Mirrored client-side in
   src/lib/kpiStats.js. */
export const CARD_DEPOSIT_DESCRIPTION = "Savings deposit — paid from card";
export const CARD_LOAN_PAYMENT_DESCRIPTION = "Loan payment — paid from card";
export const CARD_REPAYMENT_DESCRIPTION = "Card repayment — paid from card";
export const CARD_DEDUCTION_MARKERS = [
  CARD_DEPOSIT_DESCRIPTION,
  CARD_LOAN_PAYMENT_DESCRIPTION,
  CARD_REPAYMENT_DESCRIPTION,
];
/** tbltransactions.cType for a credit-card purchase repayment. */
export const REPAYMENT_TYPE = "P";
/** strDescription stamped on every generated repayment row. */
export const REPAYMENT_DESCRIPTION = "Card Payment";
/** tbltransactions.cType for a savings deposit entry. */
export const SAVINGS_TYPE = "S";
/** strDescription stamped on every generated savings row. */
export const SAVINGS_DESCRIPTION = "Savings deposit";
/** tbltransactions.cType for a transfer into a fund (Income). */
export const TRANSFER_TYPE = "I";
/** strDescription stamped on every generated transfer row. */
export const TRANSFER_DESCRIPTION = "Transfer to fund";
/** tbltransactions.cType for a budget plan's line item once the plan is
    USED — the plan's entries are posted to the ledger as plain
    expenses (no card link). */
export const BUDGET_PLAN_TYPE = "E";
/** strDescription stamped on every budget-plan expense row — the marker
    the Transactions tab uses to lock the row (see
    src/pages/shared/transaction/Transactions.jsx). */
export const BUDGET_PLAN_DESCRIPTION = "Budget plan expense";
/** tbltransactions.strTitle limit — kept in sync with the controller. */
export const TXN_TITLE_MAX = 200;

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/**
 * Due date of the term at 0-based `index`, or null when the loan has no
 * first-payment date (or it is unparseable). Dates without an explicit
 * offset are read as UTC — the stored value is a wall-clock day, not an
 * instant, so "Oct 2" stays "Oct 2" in every timezone.
 */
export function dueDateFor(loan, index) {
  const raw = loan?.dttDueDate;
  if (!raw) return null;

  const iso = /T/.test(raw) ? raw : `${raw}T00:00:00`;
  const hasOffset = /(?:Z|[+-]\d{2}:?\d{2})$/.test(iso);
  const date = hasOffset ? new Date(iso) : new Date(`${iso}Z`);
  if (Number.isNaN(date.getTime())) return null;

  const step = Number.isFinite(Number(index)) ? Number(index) : 0;
  if (loan.cInterestType === "D") date.setUTCDate(date.getUTCDate() + step);
  else if (loan.cInterestType === "W") date.setUTCDate(date.getUTCDate() + step * 7);
  else if (loan.cInterestType === "A") date.setUTCFullYear(date.getUTCFullYear() + step);
  else date.setUTCMonth(date.getUTCMonth() + step); // M (default)

  return date;
}

/** "Oct 2, 2026" — built from UTC fields so no locale/ICU rules apply. */
export function formatDueDate(date) {
  if (!date || Number.isNaN(date.getTime())) return "";
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}, ${date.getUTCFullYear()}`;
}

/**
 * A tblentries.nTransactionId value as a positive integer, or null when
 * the entry has no payment linked (the column is nullable and Supabase
 * may hand bigint ids back as strings).
 */
export function toTransactionId(value) {
  if (value === null || value === undefined || value === "") return null;
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** "Oct 2, 2026" from the LOCAL calendar day — used for rows that have no
 *  due date of their own, i.e. the day they were added. */
export function formatLocalDate(date = new Date()) {
  return `${MONTHS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

/**
 * Shared shape of the tbltransactions row a savings entry generates:
 *   title   "<saving title> - <date added>"  (the saving's title is
 *           trimmed so the date always survives the 200-char limit)
 *   amount  the entry's amount
 * Loan entries skip this — their row comes from paying a due term.
 */
function fundTransaction({ saving, amount, cType, strDescription }) {
  const suffix = ` - ${formatLocalDate()}`;
  const title = String(saving?.strTitle ?? "Saving").slice(
    0,
    Math.max(0, TXN_TITLE_MAX - suffix.length)
  );

  return {
    strTitle: `${title}${suffix}`,
    cType,
    dAmount: Number(amount) || 0,
    strDescription,
  };
}

/**
 * Body of the tbltransactions row a plain savings deposit generates:
 *   cType   "S" (Savings)
 *   descr   "Savings deposit"
 */
export function savingsTransaction({ saving, amount }) {
  return fundTransaction({
    saving,
    amount,
    cType: SAVINGS_TYPE,
    strDescription: SAVINGS_DESCRIPTION,
  });
}

/**
 * Body of the tbltransactions row a transfer into the fund generates —
 * same title and amount as a deposit, but logged as income so it shows
 * up in Income / Expense as **Income**:
 *   cType   "I" (Income)
 *   descr   "Transfer to fund"
 */
export function transferTransaction({ saving, amount }) {
  return fundTransaction({
    saving,
    amount,
    cType: TRANSFER_TYPE,
    strDescription: TRANSFER_DESCRIPTION,
  });
}

/**
 * Body of the tbltransactions row a payment generates:
 *   title   "<loan title> - <due date>"  (the loan title is trimmed so
 *           the due date always survives the 200-char limit)
 *   cType   "P" (Payment)
 *   amount  that term's installment ("the amount of the loan in that
 *           month")
 *   descr   "Loan Payment"
 */
export function paymentTransaction({ loan, dueDate, amount }) {
  const suffix = dueDate ? ` - ${formatDueDate(dueDate)}` : "";
  const title = String(loan?.strTitle ?? "Loan").slice(
    0,
    Math.max(0, TXN_TITLE_MAX - suffix.length)
  );

  return {
    strTitle: `${title}${suffix}`,
    cType: PAYMENT_TYPE,
    dAmount: Number(amount) || 0,
    strDescription: PAYMENT_DESCRIPTION,
  };
}

/**
 * Body of the tbltransactions row a budget plan's line item generates
 * when the plan is USED:
 *   title   "<plan title> - <entry title>"  (the plan title is trimmed
 *           so the entry's title always survives the 200-char limit)
 *   cType   "E" (Expense) — a plain expense, NOT linked to a card
 *   amount  the entry's amount
 *   descr   "Budget plan expense"
 */
export function budgetPlanTransaction({ plan, entry }) {
  const entryTitle = String(entry?.strTitle ?? "").trim() || "Entry";
  const planTitle = String(plan?.strTitle ?? "").trim() || "Budget plan";
  const suffix = ` - ${entryTitle}`;
  const title = planTitle.slice(0, Math.max(0, TXN_TITLE_MAX - suffix.length));

  return {
    strTitle: `${title}${suffix}`,
    cType: BUDGET_PLAN_TYPE,
    dAmount: Number(entry?.dAmount) || 0,
    strDescription: BUDGET_PLAN_DESCRIPTION,
  };
}

/**
 * Billing due date of a credit-card PURCHASE: a charge made in month M
 * falls due on the card's nDueDay in month M+1 (an October purchase is
 * billed in November on the 20th, say). A due day past the shorter
 * month's end clamps to that end (31 in a 30-day month -> the 30th).
 * The purchase's calendar day is read off the raw dttCreated string —
 * a wall-clock value, so no timezone can shift it into another month.
 * Mirrored client-side in src/lib/cards.js (purchaseDueDate).
 * Returns a Date (UTC fields = the stored wall-clock day) or null when
 * the purchase is undated or the card has no billing due day.
 */
export function cardDueDate(purchase, dueDay) {
  const day = Number(dueDay);
  if (!Number.isInteger(day) || day < 1 || day > 31) return null;

  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(purchase?.dttCreated ?? ""));
  if (!match) return null;

  let year = Number(match[1]);
  let month = Number(match[2]); // 1-12
  month += 1; // the bill lands the month AFTER the purchase
  if (month > 12) {
    month = 1;
    year += 1;
  }

  /* Last day of the due month — day 0 of the month after it. */
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return new Date(Date.UTC(year, month - 1, Math.min(day, lastDay)));
}

/**
 * Body of the tbltransactions row a credit-card purchase repayment
 * generates:
 *   title   "<purchase title> - <billing due date>" (the purchase title
 *           is trimmed so the date always survives the 200-char limit;
 *           falls back to " - Card payment" when no due date exists)
 *   cType   "P" (Payment)
 *   amount  the purchase amount
 *   descr   "Card Payment"
 *   nCardId the CREDIT card the charge sits on — the card's View shows
 *           the row as money IN, cancelling the Purchase charge again.
 * The debit card that FUNDS the payment is a separate companion row
 * (see utils/cardDeduction.js), never this one.
 */
export function cardPaymentTransaction({ purchase, card, amount }) {
  const dueDate = cardDueDate(purchase, card?.nDueDay);
  const suffix = dueDate ? ` - ${formatDueDate(dueDate)}` : " - Card payment";
  const title = String(purchase?.strTitle ?? "Purchase").slice(
    0,
    Math.max(0, TXN_TITLE_MAX - suffix.length)
  );

  return {
    strTitle: `${title}${suffix}`,
    cType: REPAYMENT_TYPE,
    dAmount: Number(amount) || 0,
    strDescription: REPAYMENT_DESCRIPTION,
    nCardId: purchase?.nCardId ?? null,
  };
}
