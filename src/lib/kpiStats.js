/* ------------------------------------------------------------------
   Arithmetic behind the KPI cards on the Income/Expense, Loans,
   Savings and Cards tabs — kept out of the pages so it can be tested without
   rendering anything (every function here is a plain sum over rows the
   list endpoint already returns).

   Each function returns the numbers; the pages turn them into
   label / value / hint and colour them.

   NOTE: unlike the tables below them, the cards are NOT narrowed by the
   status/type filter — a KPI that changed while you filtered would be
   unreadable. The filters only narrow the list underneath.
   ------------------------------------------------------------------ */

import { overdueTerms } from "./loanSchedule.js";

/* Mirrors of the card-deduction markers in server/utils/schedule.js:
   the descriptions stamped on the Expense row that accompanies a
   deposit, loan installment or card-purchase REPAYMENT paid FROM a
   card (the entry's own Savings/Payment row carries the business side
   of that money) — same convention as TRANSFER_DESCRIPTION in
   Transactions.jsx. */
export const CARD_DEPOSIT_DESCRIPTION = "Savings deposit — paid from card";
export const CARD_LOAN_PAYMENT_DESCRIPTION = "Loan payment — paid from card";
export const CARD_REPAYMENT_DESCRIPTION = "Card repayment — paid from card";
export const CARD_DEDUCTION_MARKERS = [
  CARD_DEPOSIT_DESCRIPTION,
  CARD_LOAN_PAYMENT_DESCRIPTION,
  CARD_REPAYMENT_DESCRIPTION,
];

const round2 = (v) => Math.round(v * 100) / 100;

/**
 * Income / Expense cards.
 *
 * Payment (P) is money leaving the business (a loan installment), so it
 * counts as expense. Savings (S) is a deposit — money LEAVING the
 * balance (or the chosen card) to go into a fund — so it counts as
 * expense here too, while still counting as "set aside" (the
 * savings-rate numerator). A "Transfer to Fund" row is ordinary Income
 * (I).
 *
 * Purchase (B) is deliberately counted NOWHERE here: it is money spent
 * on a card, tracked entirely by the Cards tab (it still moves that
 * card's balance/outstanding there) — it must not move the business'
 * income/expense figures. A card-linked Expense (money out of that
 * card) DOES count like any expense — the only skip is the companion
 * row of a card-paid savings deposit, loan installment or card-purchase
 * repayment (matched by its marker description), whose own
 * Savings/Payment row already carries it.
 *
 * The "this month" figures look at dttCreated (nullable: undated rows
 * still count in the totals). `now` is injectable so the month boundary
 * can be tested.
 */
export function computeTransactionStats(transactions, now = new Date()) {
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

  let income = 0;
  let expense = 0;
  let saved = 0;
  let monthIncome = 0;
  let monthExpense = 0;

  for (const t of transactions) {
    // Purchase (B) rows are skipped entirely — see the note above.
    if (t.cType === "B") continue;
    // A card-linked Expense is money out of that card — it moves the
    // business figures like any expense. The ONE skip is the companion
    // row of a card-paid deposit, LOAN INSTALLMENT or CARD REPAYMENT
    // (matched by its marker description): that entry's own
    // Savings/Payment row already carries the money, and counting both
    // would subtract it twice.
    if (
      t.cType === "E" &&
      t.nCardId &&
      CARD_DEDUCTION_MARKERS.includes(t.strDescription)
    )
      continue;

    const amount = Number(t.dAmount) || 0;
    const isIn = t.cType === "I";
    const isOut = t.cType === "E" || t.cType === "P" || t.cType === "S";
    if (isIn) income += amount;
    else if (isOut) expense += amount;
    else continue;

    if (t.cType === "S") saved += amount;

    const created = t.dttCreated ? Date.parse(t.dttCreated) : NaN;
    if (!Number.isNaN(created) && created >= monthStart) {
      if (isIn) monthIncome += amount;
      else monthExpense += amount;
    }
  }

  const balance = round2(income - expense);
  return {
    income: round2(income),
    expense: round2(expense),
    balance,
    saved: round2(saved),
    monthIncome: round2(monthIncome),
    monthExpense: round2(monthExpense),
    /* Net as a share of income, and how much of income was set aside. */
    margin: income > 0 ? (balance / income) * 100 : 0,
    savingsRate: income > 0 ? (saved / income) * 100 : 0,
  };
}

/**
 * The "Current Balance" the payment/deposit choosers show: the
 * business balance minus the money held on the user's DEBIT cards.
 * Income linked to a debit card raises both figures at once (it is
 * income for the ledger AND lands on the card), so the card money is
 * taken back out here — what remains is the part of the balance not
 * already sitting on a card. Credit cards are excluded: they hold no
 * money (their spendable figure is available credit, offered
 * separately in the card picker).
 */
export function currentBalanceOf(balance, cards) {
  const onDebitCards = (cards || [])
    .filter((c) => c?.cType === "D")
    .reduce((sum, c) => sum + (Number(c.dBalance) || 0), 0);
  return round2((Number(balance) || 0) - onDebitCards);
}

/**
 * Loans cards, from what GET /api/loans already hands over per loan:
 * dAmount (principal), dPaidAmount (settled installments) and
 * dRemaining (schedule minus settled).
 *
 * - toCollect      ₱ still outstanding on ACTIVE loans only — a Pending
 *                  loan hasn't been handed out, so it isn't money owed.
 * - collected      every peso settled so far (any status).
 * - disbursed      what loans that are actually out (Active + Completed)
 *                  are worth; the collection rate is collected/disbursed.
 * - overdue        past-due installments = due dates elapsed minus terms
 *                  settled (see overdueTerms), with the loans carrying
 *                  them counted alongside.
 */
export function computeLoanStats(loans) {
  let collected = 0;
  let toCollect = 0;
  let activePrincipal = 0;
  let disbursed = 0;
  let active = 0;
  let pending = 0;
  let overdue = 0;
  let overdueLoans = 0;

  for (const l of loans) {
    const amount = Number(l.dAmount) || 0;
    const paid = Number(l.dPaidAmount) || 0;
    const remaining = Number(l.dRemaining) || 0;
    collected += paid;

    if (l.cStatus === "A") {
      active += 1;
      activePrincipal += amount;
      toCollect += remaining;
      disbursed += paid + remaining;
      const late = overdueTerms(l);
      if (late > 0) {
        overdue += late;
        overdueLoans += 1;
      }
    } else if (l.cStatus === "C") {
      // Fully settled: nothing left to collect, but its receipts count.
      disbursed += paid + remaining;
    } else if (l.cStatus === "P") {
      pending += 1; // not handed out yet — kept out of the rate
    }
  }

  return {
    collected: round2(collected),
    toCollect: round2(toCollect),
    activePrincipal: round2(activePrincipal),
    disbursed: round2(disbursed),
    active,
    pending,
    overdue,
    overdueLoans,
    collectedRate: disbursed > 0 ? (collected / disbursed) * 100 : 0,
  };
}

/**
 * Savings cards, from GET /api/savings: dBalance (sum of a saving's
 * deposits) and nDeposits (how many of them there are).
 */
export function computeSavingsStats(savings) {
  let funds = 0;
  let active = 0;
  let pending = 0;
  let balance = 0;
  let activeBalance = 0;
  let deposits = 0;

  for (const s of savings) {
    const dBalance = Number(s.dBalance) || 0;
    funds += 1;
    balance += dBalance;
    deposits += Number(s.nDeposits) || 0;

    if (s.cStatus === "A") {
      active += 1;
      activeBalance += dBalance;
    } else if (s.cStatus === "P") pending += 1;
  }

  return {
    funds,
    active,
    pending,
    balance: round2(balance),
    activeBalance: round2(activeBalance),
    deposits,
    avgDeposit: deposits > 0 ? round2(balance / deposits) : 0,
  };
}

/**
 * Cards tab, from GET /api/cards (each card arrives pre-summed):
 *   debit  (cType "D") -> dBalance     = income − expense on the card
 *   credit (cType "C") -> dOutstanding = charges − payments so far,
 *                         dAvailable   = credit limit − outstanding
 *
 * The KPI split keeps the two kinds apart because they mean different
 * things: debit balance is money the card holds, credit outstanding is
 * money owed.
 */
export function computeCardsStats(cards) {
  let total = 0;
  let debit = 0;
  let credit = 0;
  let debitBalance = 0;
  let creditOutstanding = 0;
  let availableCredit = 0;
  let charges = 0;

  for (const c of cards) {
    total += 1;
    charges += Number(c.dExpense) || 0;

    if (c.cType === "C") {
      credit += 1;
      creditOutstanding += Number(c.dOutstanding) || 0;
      availableCredit += Number(c.dAvailable) || 0;
    } else {
      debit += 1;
      debitBalance += Number(c.dBalance) || 0;
    }
  }

  return {
    total,
    debit,
    credit,
    debitBalance: round2(debitBalance),
    creditOutstanding: round2(creditOutstanding),
    availableCredit: round2(availableCredit),
    charges: round2(charges),
  };
}
