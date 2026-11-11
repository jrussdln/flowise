/* ------------------------------------------------------------------
   Bills — the flat list behind the BILLS view and the dashboard's
   "My Bills" section: every installment of an ACTIVE/COMPLETED loan
   and every purchase on a CREDIT card, each with the derived due date
   and whether it's settled.

   Pure arithmetic over rows the list endpoints already return — the
   entries (loan schedules, purchase repayments) come from
   loanService.listBillEntries, keyed the same way here:
     loanEntries  Map loanId -> its schedule rows (cStatus X/P/L/A)
     cardEntries  Map cardId -> its repayment rows (nReferenceId =
                  the Purchase transaction id, cStatus P/L/A = paid)

   A loan term falls due at first-payment date + index × period (see
   lib/loanSchedule); a purchase bills on the card's nDueDay in the
   month AFTER the charge (see lib/cards). Bills with no usable due
   date — an undated purchase or a card with no billing day — can't be
   placed in a month and are left out.
   ------------------------------------------------------------------ */

import { nthDue } from "./loanSchedule";
import { cardTitle, isCredit, purchaseDueDate } from "./cards";

export function buildBills({
  loans,
  loanEntries,
  cards,
  transactions,
  cardEntries,
}) {
  const creditById = new Map(
    (cards || []).filter(isCredit).map((c) => [Number(c.nCardId), c])
  );
  /* Purchase transaction id -> its repayment entry (P/L/A = paid). */
  const repayByPurchase = new Map();
  for (const entries of cardEntries?.values() || []) {
    for (const e of entries || []) {
      repayByPurchase.set(Number(e.nReferenceId), e);
    }
  }

  const list = [];
  for (const loan of loans || []) {
    if (loan.cStatus !== "A" && loan.cStatus !== "C") continue; // pending isn't handed out
    const entries = loanEntries?.get(Number(loan.nLoanId));
    if (!entries || entries.length === 0) continue;
    const total = Number(loan.nEntriesTotal) || Number(loan.nTerms) || entries.length;
    entries.forEach((entry, index) => {
      const due = nthDue(loan, index);
      if (!due) return;
      list.push({
        key: `L-${loan.nLoanId}-${index}`,
        kind: "loan",
        title: loan.strTitle || `Loan #${loan.nLoanId}`,
        subtitle: `Term ${index + 1} of ${total}`,
        due,
        amount: Number(entry.dAmount) || 0,
        paid: ["P", "L", "A"].includes(entry.cStatus),
      });
    });
  }
  for (const t of transactions || []) {
    if (t.cType !== "B") continue; // purchases only — and only on CREDIT
    const card = creditById.get(Number(t.nCardId));
    if (!card) continue;
    const due = purchaseDueDate(card, t);
    if (!due) continue; // undated or no billing day on the card
    const entry = repayByPurchase.get(Number(t.nTransactionId));
    list.push({
      key: `C-${t.nTransactionId}`,
      kind: "card",
      title: t.strTitle || "Purchase",
      subtitle: cardTitle(card),
      due,
      amount: Number(t.dAmount) || 0,
      paid: Boolean(entry) && ["P", "L", "A"].includes(entry.cStatus),
    });
  }
  return list;
}

/** True when the bill falls due in the same month as `now`. */
export function isThisMonth(bill, now = new Date()) {
  return (
    `${bill.due.getUTCFullYear()}-${bill.due.getUTCMonth()}` ===
    `${now.getFullYear()}-${now.getMonth()}`
  );
}

/** True when the bill's due day already passed (and it isn't paid). */
export function isOverdue(bill, now = new Date()) {
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return !bill.paid && bill.due.getTime() < today;
}
