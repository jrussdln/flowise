/* ------------------------------------------------------------------
   The Expense COMPANION row a card-paid deposit, loan installment or
   card-purchase REPAYMENT writes beside its own ledger row: the ledger
   row (Savings "S" / Payment "P") carries the business side of the
   money, while the companion ("E", carrying nCardId, marker
   description) is what the card's balance and its View subtract. Both
   rows copy the ledger row's title and amount — that pair, plus the
   marker, is how the companion is found again on undo, delete or
   rebuild.

   Shared by the entries controller (pay / undo / deposit delete) and
   the loans controller (schedule rebuilds and loan deletion keep the
   companion in step with the Payment row it belongs to).
   ------------------------------------------------------------------ */

import * as transactionModel from "../models/transaction.model.js";
import {
  CARD_DEDUCTION_MARKERS,
  toTransactionId,
} from "./schedule.js";

/** True when `row` IS a card-deduction companion row. */
export function isCardDeduction(row) {
  return (
    row?.cType === "E" &&
    typeof row.strDescription === "string" &&
    CARD_DEDUCTION_MARKERS.includes(row.strDescription)
  );
}

/**
 * The companion belonging to the ledger row `payment` (a Savings or
 * Payment row) — matched by a marker description plus the title and
 * amount the companion copies from it. Null when there is none.
 */
export async function findCardDeduction(payment, userId) {
  if (!payment) return null;

  const rows = await transactionModel.findAllForUser(userId);
  return (
    rows.find(
      (row) =>
        isCardDeduction(row) &&
        row.nCardId != null &&
        row.strTitle === payment.strTitle &&
        Number(row.dAmount) === Number(payment.dAmount)
    ) ?? null
  );
}

/**
 * Writes a fresh companion for the ledger row `payment` just written:
 * an Expense copying its title and amount, carrying the marker
 * description and the card the money left from.
 */
export async function recordCardDeduction({ payment, marker, nCardId, userId }) {
  return transactionModel.createWithCode({
    strTitle: payment.strTitle,
    cType: "E",
    dAmount: Number(payment.dAmount) || 0,
    strDescription: marker,
    nUserId: userId,
    nCardId,
  });
}

/**
 * Removes the companion of the entry's linked ledger row (found
 * through tblentries.nTransactionId) — best effort, like
 * forgetPayment: a failed delete is logged and false returned, and the
 * link stays so a later attempt can finish the cleanup. Must run
 * BEFORE forgetPayment (it reads the linked row). True when nothing
 * remains.
 */
export async function forgetCardDeduction(entry, userId) {
  const linked = toTransactionId(entry?.nTransactionId);
  if (linked === null) return true;

  try {
    const ledgerRow = await transactionModel.findById(linked, userId);
    if (!ledgerRow) return false;

    const companion = await findCardDeduction(ledgerRow, userId);
    if (!companion) return true;

    return await transactionModel.remove(companion.nTransactionId, userId);
  } catch (err) {
    console.warn("[entries] could not remove card-deduction transaction:", err?.message || err);
    return false;
  }
}

/**
 * Keeps an existing companion in step when its ledger row is rewritten
 * in place (a loan edit rebuilds every Payment row's title and
 * amount): the companion is found through the row as it stood BEFORE
 * the rewrite (`before`) and refreshed with the new values (`after`),
 * so the pair still matches when the payment is later undone.
 */
export async function refreshCardDeduction({ before, after, userId }) {
  try {
    const companion = await findCardDeduction(before, userId);
    if (!companion) return null;

    return await transactionModel.update(
      companion.nTransactionId,
      { strTitle: after.strTitle, dAmount: after.dAmount },
      userId
    );
  } catch (err) {
    console.warn("[loans] could not refresh card-deduction transaction:", err?.message || err);
    return null;
  }
}

/** Best effort: drops `payment` together with its companion row. */
export async function removeWithCardDeduction(payment, userId) {
  const companion = await findCardDeduction(payment, userId).catch(() => null);
  if (companion) {
    try {
      await transactionModel.remove(companion.nTransactionId, userId);
    } catch (err) {
      console.warn("[loans] could not remove card-deduction transaction:", err?.message || err);
    }
  }
  return payment;
}
