/* ------------------------------------------------------------------
   HTTP layer for /api/entries — the four kinds of row tblentries
   holds: a loan's payment schedule (cType "L", nReferenceId =
   tblloans.nLoanId, dAmount = flat-interest installment, cStatus "X"
   until paid), a savings deposit (cType "S", nReferenceId =
   tblsavings.nSavingId, dAmount = the deposit, cStatus "A"), a
   credit-card purchase repayment (cType "C", nReferenceId =
   tbltransactions.nTransactionId of the Purchase row, dAmount = that
   purchase's amount, cStatus "X" until paid), and a budget-plan line
   item (cType "B", nReferenceId = tblbudgetplan.nBudgetPlanId,
   strTitle + dAmount, cStatus "P", nTransactionId NULL — a plan is a
   plan, so it never writes a tbltransactions row).

   Routes:
     GET /api/entries?cType=L&nReferenceId=<loanId>  a loan's schedule
     GET /api/entries?cType=S&nReferenceId=<id>      one saving's deposits
     GET /api/entries?cType=B&nReferenceId=<id>      one plan's entries
     GET /api/entries?cType=C&nCardId=<cardId>       every purchase
                                                     repayment on a card
     POST /api/entries { cType:"S", ... }            add one deposit
     POST /api/entries { cType:"B", ... }            add one plan entry
     POST /api/entries { cType:"C", ... }            first payment of a
                                                     credit-card purchase
     PUT /api/entries/:id { cStatus, nCardId? }                set X/P/L/A status
       X = pending, P = paid (on the due date), L = late payment,
       A = advance payment (paid before the due date). The client picks
       the status by comparing the row's due date with today (it already
       renders those dates); the server only validates the vocabulary.
       Savings (S) and budget-plan (B) entries are not payment rows, so
       they have no status to settle.
     DELETE /api/entries/:id                         remove a deposit
                                                     + its transaction, or a
                                                     budget-plan entry

   TRANSFERS: a deposit may be flagged with `transfer: true` in the
   POST body — the tblentries row is identical (the fund's balance grows
   the same way), but the tbltransactions row it writes is an INCOME row
   (cType "I", description "Transfer to fund") instead of a Savings row,
   so the money shows up under Income in Income / Expense.

   PAYMENTS: settling an entry also writes its tbltransactions row —
   type "P" (Payment), title "<loan title> - <due date of the term>",
   amount = that term's installment, description "Loan Payment" — and
   links it through tblentries.nTransactionId. Undoing (X) deletes that
   row. Both are driven from server/utils/schedule.js so the title's
   date matches the schedule the UI renders. A payment made FROM a
   debit card (body `nCardId`) writes a SECOND row beside the Payment
   one — an Expense ("E", marker CARD_LOAN_PAYMENT_DESCRIPTION)
   carrying the card link, so the card's balance takes the deduction
   and its View shows money out (see utils/cardDeduction.js); undo
   drops both rows.

   CARD REPAYMENTS (cType "C"): the same machinery, pointed at a
   credit-card PURCHASE instead of a loan term. The entry is created
   lazily on the FIRST payment (POST) and born settled (P/L/A — the
   client's Repay/PAY/Advance buttons pick by comparing the billing
   due date, the card's nDueDay in the month AFTER the purchase);
   its Payment row links the CREDIT card (the card's View shows it as
   money in, cancelling the charge again) and, when a debit card
   funds the payment, a companion Expense
   (CARD_REPAYMENT_DESCRIPTION) is written beside it — the same
   companion pattern as deposits and loan installments. Undo (PUT X)
   drops both rows and leaves the entry pending; re-paying goes
   through PUT. Only purchases on a CREDIT card can be repaid.

   Response shapes:
     success -> { ok: true,  data }
     failure -> { ok: false, message, errors? , debug? }

   AUTH: every request requires a signed-in session. Because tblentries
   has no nUserId column, ownership is enforced through the referenced
   row: the loan behind cType/nReferenceId must belong to the caller or
   the request reads as 404 (never leaking that it exists).
   ------------------------------------------------------------------ */

import * as entryModel from "../models/entry.model.js";
import * as loanModel from "../models/loan.model.js";
import * as savingModel from "../models/saving.model.js";
import * as budgetPlanModel from "../models/budgetPlan.model.js";
import * as cardModel from "../models/card.model.js";
import * as transactionModel from "../models/transaction.model.js";
import { getSessionUserId } from "../utils/session.js";
import {
  CARD_DEPOSIT_DESCRIPTION,
  CARD_LOAN_PAYMENT_DESCRIPTION,
  CARD_REPAYMENT_DESCRIPTION,
  cardPaymentTransaction,
  dueDateFor,
  paymentTransaction,
  savingsTransaction,
  toTransactionId,
  transferTransaction,
} from "../utils/schedule.js";
import {
  forgetCardDeduction,
  recordCardDeduction,
} from "../utils/cardDeduction.js";

/* Entry types the app knows how to resolve an owner for: L = loan
   schedule (owner = tblloans row), S = savings deposit (owner =
   tblsavings row), C = card purchase repayment (owner = the Purchase
   row in tbltransactions), B = budget-plan line item (owner =
   tblbudgetplan row). Extend this (and findOwner) when another
   entity gains entries. */
const VALID_TYPES = ["L", "S", "C", "B"];
/* Entry statuses: X = pending, P = paid (on the due date),
   L = late payment (paid after the due date), A = advance (paid early)
   — the loan vocabulary. Savings entries are born settled as "A". */
const VALID_STATUSES = ["X", "P", "L", "A"];
/* Settled = no longer awaiting payment (drives loan auto-completion). */
const SETTLED_ENTRY_STATUSES = ["P", "L", "A"];
/* cStatus written when a savings entry is added — the deposit already
   happened, and the X/P/L/A timing vocabulary does not apply to it. */
const SAVINGS_ENTRY_STATUS = "A";
/* cStatus written when a budget-plan entry is added — a planned line
   item, not a payment, so it never carries the X/P/L/A timing
   vocabulary and is never settled by PUT. */
const BUDGET_PLAN_ENTRY_STATUS = "P";
/* Longest strTitle a budget-plan entry may carry. */
const ENTRY_TITLE_MAX = 200;

/** The entry's linked tbltransactions row as a number, or null. */
function linkOf(entry) {
  return toTransactionId(entry?.nTransactionId);
}

/**
 * Writes the tbltransactions row behind a payment and returns it.
 * `values` is the row body from schedule.js — paymentTransaction for a
 * loan term, cardPaymentTransaction for a credit-card purchase.
 *
 * An entry that already carries a link is refreshed in place — same
 * payment, new numbers after the loan/purchase was edited; a first
 * payment inserts a new row (TXN-<id> stamped by createWithCode).
 */
async function recordPayment({ entry, values, userId }) {
  const linked = linkOf(entry);
  if (linked !== null) {
    const updated = await transactionModel.update(linked, values, userId);
    if (updated) return updated;
    // The linked row was deleted elsewhere — fall through and recreate it.
  }

  return transactionModel.createWithCode({ ...values, nUserId: userId });
}

/** Removes the row an undone payment generated; true when it is gone. */
async function forgetPayment(entry, userId) {
  const linked = linkOf(entry);
  if (linked === null) return true;

  try {
    return await transactionModel.remove(linked, userId);
  } catch (err) {
    console.warn("[entries] could not remove payment transaction:", err?.message || err);
    return false;
  }
}

/**
 * The row that owns an entry — tblloans for "L", tblsavings for "S",
 * the Purchase transaction for "C", tblbudgetplan for "B" — already
 * scoped to the caller.
 * Null means unknown type or a foreign / missing row; both read as 404
 * so nothing leaks. A "C" entry only resolves when the referenced row
 * really is a Purchase (B): nothing else may be repaid.
 */
async function findOwner(cType, nReferenceId, userId) {
  if (cType === "L") return loanModel.findById(nReferenceId, userId);
  if (cType === "S") return savingModel.findById(nReferenceId, userId);
  if (cType === "B") return budgetPlanModel.findById(nReferenceId, userId);
  if (cType === "C") {
    const purchase = await transactionModel.findById(nReferenceId, userId);
    return purchase && purchase.cType === "B" ? purchase : null;
  }
  return null;
}

/** 404 message matching the owner type. */
function ownerNotFound(cType) {
  if (cType === "S") return "Saving not found.";
  if (cType === "C") return "Purchase not found.";
  if (cType === "B") return "Budget plan not found.";
  return "Loan not found.";
}

/**
 * The CREDIT card a purchase sits on (ownership re-checked; entries
 * carry no owner of their own), or null when the purchase is unlinked
 * or its card is gone / not a credit card — only credit-card purchases
 * can be repaid, and the card supplies the billing due day used in the
 * generated Payment row's title.
 */
async function findCreditCard(purchase, userId) {
  const cardId = toTransactionId(purchase?.nCardId);
  if (cardId === null) return null;

  const card = await cardModel.findById(cardId, userId);
  return card && card.cType === "C" ? card : null;
}

/**
 * Reads body `nCardId` — the DEBIT card funding a payment/deposit.
 * Returns null when none was sent; sends 400 (and returns undefined)
 * on a malformed id or a card that is not debit — only debit cards may
 * fund one, they are the ones holding money.
 */
async function fundingCardOf(req, res, userId, actionLabel) {
  const raw = req.body?.nCardId;
  if (raw === null || raw === undefined || raw === "") return null;

  const nCardId = Number(raw);
  if (!Number.isInteger(nCardId) || nCardId <= 0) {
    res.status(400).json({ ok: false, message: "Invalid card id." });
    return undefined;
  }

  const card = await cardModel.findById(nCardId, userId);
  if (!card) {
    return res
      .status(400)
      .json({ ok: false, message: "That card was not found among your cards." });
  }
  if (card.cType !== "D") {
    res.status(400).json({
      ok: false,
      message: `${actionLabel} can only be paid from a debit card.`,
    });
    return undefined;
  }
  return card;
}

/** Reads + validates a positive integer out of a request body field. */
function bodyId(raw) {
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : null;
}

/**
 * Returns the session user id, or null (after sending 401) when the
 * caller is not signed in. Checked before anything else in every handler.
 */
function requireUser(req, res) {
  const userId = getSessionUserId(req);
  if (userId === null) {
    res.status(401).json({ ok: false, message: "Not signed in." });
    return null;
  }
  return userId;
}

function sendError(res, err, action) {
  const status = err?.status || err?.statusCode || 500;
  console.error(`[entries] failed to ${action}:`, err?.message || err);

  res.status(status).json({
    ok: false,
    message: status === 500 ? "Unexpected server error." : err?.message || "Request failed.",
    ...(status === 500 && process.env.NODE_ENV !== "production"
      ? { debug: err?.message }
      : {}),
  });
}

/** Reads :id. Sends a 400 and returns null when invalid. */
function parseId(req, res) {
  // Express puts :id in req.params; Vercel serverless puts it in req.query.
  const raw = req.params?.id ?? req.query?.id;
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ ok: false, message: "Invalid entry id." });
    return null;
  }
  return id;
}

/** GET /api/entries?cType=L|S&nReferenceId=<id> — one loan's schedule
 *  (cType L) or one saving's deposits (cType S). Credit-card
 *  repayments (cType C) are listed either per purchase
 *  (nReferenceId = the Purchase row) or per CARD in one call —
 *  nCardId=<cardId> returns the entries of every purchase charged to
 *  that card, which is what the card's View renders. */
export async function listEntries(req, res) {
  const userId = requireUser(req, res);
  if (userId === null) return;

  const cType = typeof req.query?.cType === "string" ? req.query.cType.trim() : "";
  if (!VALID_TYPES.includes(cType)) {
    return res.status(400).json({
      ok: false,
      message: `cType must be one of: ${VALID_TYPES.join(", ")}.`,
    });
  }

  try {
    /* Card-scoped listing (repayments): every purchase on the card,
       then the entries referencing those purchases. Ownership through
       the card — entries have no owner of their own. */
    const nCardId = bodyId(req.query?.nCardId);
    if (nCardId !== null && cType === "C") {
      const card = await cardModel.findById(nCardId, userId);
      if (!card) {
        return res.status(404).json({ ok: false, message: "Card not found." });
      }
      const rows = await transactionModel.findByCard(nCardId, userId);
      const purchaseIds = rows
        .filter((row) => row.cType === "B")
        .map((row) => row.nTransactionId);
      const entries = await entryModel.findByReferences("C", purchaseIds);
      return res.status(200).json({ ok: true, data: entries });
    }

    const nReferenceId = bodyId(req.query?.nReferenceId);
    if (nReferenceId === null) {
      return res.status(400).json({ ok: false, message: "Invalid reference id." });
    }

    /* Ownership through the referenced row (entries have no owner). */
    const owner = await findOwner(cType, nReferenceId, userId);
    if (!owner) {
      return res.status(404).json({ ok: false, message: ownerNotFound(cType) });
    }

    const entries = await entryModel.findByReference(cType, nReferenceId);
    res.status(200).json({ ok: true, data: entries });
  } catch (err) {
    sendError(res, err, "load entries");
  }
}

/**
 * POST /api/entries — add ONE savings deposit (cType "S"):
 *   body { cType: "S", nReferenceId, dAmount, nCardId? }
 * inserts the entry (cStatus "A" — recorded immediately) and its
 * tbltransactions row (cType "S", title "<saving title> - <date added>",
 * description "Savings deposit"), linking the two through nTransactionId.
 *
 * Add `transfer: true` to the body to write that same ledger row as
 * INCOME instead (cType "I", description "Transfer to fund") — a
 * "Transfer to Fund" from the savings entries modal. The deposit itself
 * is identical either way.
 *
 * Add `nCardId` (one of the caller's DEBIT cards) when the deposit is
 * paid FROM that card: TWO ledger rows are written — the usual Savings
 * row (the deposit itself, linked through nTransactionId) AND an
 * EXPENSE row ("E", description CARD_DEPOSIT_DESCRIPTION) carrying the
 * card link, so the card's balance is deducted and the card's View
 * shows that row as money out (a negative amount). Deleting the entry
 * removes both rows.
 *
 * Loan entries are rejected here: their schedule is built by the loans
 * controller when a loan activates. A card purchase repayment
 * (cType "C") is delegated to createRepaymentEntry below.
 */
export async function createEntry(req, res) {
  const userId = requireUser(req, res);
  if (userId === null) return;

  const cType = typeof req.body?.cType === "string" ? req.body.cType.trim() : "";
  if (cType === "L") {
    return res.status(400).json({
      ok: false,
      message: "Loan entries are created when the loan is activated.",
    });
  }
  if (!VALID_TYPES.includes(cType)) {
    return res.status(400).json({
      ok: false,
      message: `cType must be one of: ${VALID_TYPES.join(", ")}.`,
    });
  }

  const nReferenceId = bodyId(req.body?.nReferenceId);
  if (nReferenceId === null) {
    return res.status(400).json({ ok: false, message: "Invalid reference id." });
  }

  /* A credit-card purchase repayment is created by its FIRST payment —
     settled on birth, amount owned by the server (see below). */
  if (cType === "C") {
    return createRepaymentEntry(req, res, userId, nReferenceId);
  }

  /* A budget-plan line item — a title + an amount, no ledger row. */
  if (cType === "B") {
    return createBudgetPlanEntry(req, res, userId, nReferenceId);
  }

  const rawAmount = req.body?.dAmount;
  const amount =
    typeof rawAmount === "number"
      ? rawAmount
      : typeof rawAmount === "string" && rawAmount.trim() !== ""
        ? Number(rawAmount)
        : NaN;
  if (!Number.isFinite(amount)) {
    return res.status(400).json({ ok: false, message: "Amount must be a valid number." });
  }
  if (amount <= 0) {
    return res.status(400).json({ ok: false, message: "Amount must be greater than zero." });
  }

  /* transfer: true (from the modal's Transfer to Fund button) logs the
     deposit as INCOME; anything else keeps the usual Savings row. */
  const isTransfer = req.body?.transfer === true || req.body?.transfer === "true";

  /* nCardId — optional card the deposit is paid from. */
  let nCardId = null;
  if (
    req.body?.nCardId !== null &&
    req.body?.nCardId !== undefined &&
    req.body?.nCardId !== ""
  ) {
    nCardId = Number(req.body.nCardId);
    if (!Number.isInteger(nCardId) || nCardId <= 0) {
      return res.status(400).json({ ok: false, message: "Invalid card id." });
    }
  }

  try {
    /* Ownership through the referenced row (entries have no owner). */
    const owner = await findOwner(cType, nReferenceId, userId);
    if (!owner) {
      return res.status(404).json({ ok: false, message: ownerNotFound(cType) });
    }

    /* …and through the card, when one was named (never trust an id
       from the client). Only DEBIT cards may pay for a deposit —
       they are the ones holding money. */
    if (nCardId !== null) {
      const card = await cardModel.findById(nCardId, userId);
      if (!card) {
        return res
          .status(400)
          .json({ ok: false, message: "That card was not found among your cards." });
      }
      if (card.cType !== "D") {
        return res.status(400).json({
          ok: false,
          message: "Deposits can only be paid from a debit card.",
        });
      }
    }

    const entry = await entryModel.create({
      cType,
      nReferenceId,
      dAmount: amount,
      cStatus: SAVINGS_ENTRY_STATUS,
    });

    /* The deposit's own ledger row — Income ("Transfer to fund") or
       Savings ("Savings deposit"); the entry links to this one. */
    const fromCard = nCardId !== null && !isTransfer;
    let data = entry;
    try {
      const txn = await transactionModel.createWithCode({
        ...(isTransfer
          ? transferTransaction({ saving: owner, amount })
          : savingsTransaction({ saving: owner, amount })),
        nUserId: userId,
      });

      /* A deposit paid FROM a card writes a SECOND row: an Expense
         carrying the card link — the card's View shows that deduction
         (negative), while the Savings row records the deposit itself.
         Deleting the entry drops both rows (forgetCardDeduction). */
      if (fromCard) {
        await recordCardDeduction({
          payment: txn,
          marker: CARD_DEPOSIT_DESCRIPTION,
          nCardId,
          userId,
        });
      }

      data =
        (await entryModel.setStatus(entry.nEntriesId, SAVINGS_ENTRY_STATUS, txn.nTransactionId)) ??
        entry;
    } catch (txnErr) {
      console.warn("[entries] could not write deposit transaction:", txnErr?.message || txnErr);
    }

    res.status(201).json({ ok: true, data });
  } catch (err) {
    sendError(res, err, "create entry");
  }
}

/**
 * POST /api/entries { cType:"B", nReferenceId, strTitle, dAmount } —
 * adds ONE line item to a budget plan: a title and an amount, written
 * straight into tblentries.
 *
 * The row is born with cStatus "P" and its nTransactionId stays NULL:
 * a budget plan is a plan, not a movement of money, so it never writes
 * a tbltransactions row and never touches the ledger.
 */
async function createBudgetPlanEntry(req, res, userId, nReferenceId) {
  const title =
    typeof req.body?.strTitle === "string" ? req.body.strTitle.trim() : "";
  if (!title) {
    return res.status(400).json({ ok: false, message: "Title is required." });
  }
  if (title.length > ENTRY_TITLE_MAX) {
    return res.status(400).json({
      ok: false,
      message: `Title must be ${ENTRY_TITLE_MAX} characters or fewer.`,
    });
  }

  const rawAmount = req.body?.dAmount;
  const amount =
    typeof rawAmount === "number"
      ? rawAmount
      : typeof rawAmount === "string" && rawAmount.trim() !== ""
        ? Number(rawAmount)
        : NaN;
  if (!Number.isFinite(amount)) {
    return res.status(400).json({ ok: false, message: "Amount must be a valid number." });
  }
  if (amount <= 0) {
    return res.status(400).json({ ok: false, message: "Amount must be greater than zero." });
  }

  try {
    /* Ownership through the referenced plan (entries have no owner). */
    const owner = await findOwner("B", nReferenceId, userId);
    if (!owner) {
      return res.status(404).json({ ok: false, message: ownerNotFound("B") });
    }

    /* A used plan is closed: its entries are expenses in the ledger
       now, so they can no longer be added to. */
    if (owner.cStatus === "C") {
      return res.status(400).json({
        ok: false,
        message: "This plan has been used — activate it to unlock its entries.",
      });
    }

    const data = await entryModel.create({
      cType: "B",
      nReferenceId,
      dAmount: amount,
      cStatus: BUDGET_PLAN_ENTRY_STATUS,
      strTitle: title,
      /* No ledger row behind a plan entry — the link stays empty. */
      nTransactionId: null,
    });

    res.status(201).json({ ok: true, data });
  } catch (err) {
    sendError(res, err, "create budget plan entry");
  }
}

/**
 * PUT /api/entries/:id { strTitle?, dAmount? } — edits ONE budget-plan
 * line item: its title and/or its amount. Partial update — a key that is
 * not in the body keeps its stored value.
 *
 * The entry's cType, nReferenceId, cStatus ("P") and nTransactionId
 * (null) are never touched: a plan entry is not a payment, so there is
 * no status to settle and no ledger row behind it.
 */
async function updateBudgetPlanEntry(req, res, userId, entry) {
  const body = req.body ?? {};
  const has = (k) => Object.prototype.hasOwnProperty.call(body, k);
  const values = {};
  const errors = {};

  if (has("strTitle")) {
    const title = typeof body.strTitle === "string" ? body.strTitle.trim() : "";
    if (!title) {
      errors.strTitle = "Title is required.";
    } else if (title.length > ENTRY_TITLE_MAX) {
      errors.strTitle = `Title must be ${ENTRY_TITLE_MAX} characters or fewer.`;
    } else {
      values.strTitle = title;
    }
  }

  if (has("dAmount")) {
    const raw = body.dAmount;
    const amount =
      typeof raw === "number"
        ? raw
        : typeof raw === "string" && raw.trim() !== ""
          ? Number(raw)
          : NaN;
    if (!Number.isFinite(amount)) {
      errors.dAmount = "Amount must be a valid number.";
    } else if (amount <= 0) {
      errors.dAmount = "Amount must be greater than zero.";
    } else {
      values.dAmount = amount;
    }
  }

  if (Object.keys(errors).length > 0) {
    return res.status(400).json({
      ok: false,
      message: "Please fix the highlighted fields.",
      errors,
    });
  }

  if (Object.keys(values).length === 0) {
    return res.status(400).json({ ok: false, message: "No fields to update." });
  }

  try {
    /* Ownership through the referenced plan (entries have no owner). */
    const owner = await findOwner("B", entry.nReferenceId, userId);
    if (!owner) {
      return res.status(404).json({ ok: false, message: "Budget plan not found." });
    }

    /* A used plan's entries are posted as expenses — they are locked
       until the plan is activated again. */
    if (owner.cStatus === "C") {
      return res.status(400).json({
        ok: false,
        message: "This plan has been used — its entries can no longer be changed.",
      });
    }

    const data = await entryModel.updateFields(entry.nEntriesId, values);
    if (!data) {
      return res.status(404).json({ ok: false, message: "Entry not found." });
    }

    res.status(200).json({ ok: true, data });
  } catch (err) {
    sendError(res, err, "update budget plan entry");
  }
}

/**
 * POST /api/entries { cType:"C", nReferenceId, cStatus, nCardId? } —
 * the FIRST payment of a credit-card purchase: inserts the repayment
 * entry (born settled — P on time, L late, A advance, picked by the
 * client from the billing due date) together with its Payment row
 * (cType "P", description "Card Payment", linked to the CREDIT card so
 * its View shows the money coming back in and the charge cancelling
 * out). `nCardId` names the optional DEBIT card funding the payment —
 * it writes the companion Expense row beside the Payment one, exactly
 * like a card-paid deposit or loan installment.
 *
 * The amount is always the PURCHASE's — the server never takes it from
 * the body (full repayments only, like a loan installment).
 */
async function createRepaymentEntry(req, res, userId, nReferenceId) {
  const status = typeof req.body?.cStatus === "string" ? req.body.cStatus.trim() : "";
  if (!SETTLED_ENTRY_STATUSES.includes(status)) {
    return res.status(400).json({
      ok: false,
      message: "Repayments are recorded as P (paid), L (late) or A (advance).",
    });
  }

  try {
    /* Ownership through the referenced purchase — which must really be
       a Purchase row (findOwner), or it reads as 404. */
    const purchase = await findOwner("C", nReferenceId, userId);
    if (!purchase) {
      return res.status(404).json({ ok: false, message: ownerNotFound("C") });
    }

    /* Repayments only apply to purchases charged to a CREDIT card — a
       debit-card purchase already spent the money when it was made.
       The card also supplies the billing due day for the row title. */
    const card = await findCreditCard(purchase, userId);
    if (!card) {
      return res.status(400).json({
        ok: false,
        message: "Only purchases on a credit card can be repaid.",
      });
    }

    /* One repayment entry per purchase — a second payment (or an undo
       followed by re-paying) goes through PUT on the existing row. */
    const existing = await entryModel.findByReference("C", nReferenceId);
    if (existing.length > 0) {
      return res.status(409).json({
        ok: false,
        message: "That purchase already has a repayment — undo it first.",
      });
    }

    /* Optional debit card funding the payment (same rule as deposits). */
    const funding = await fundingCardOf(req, res, userId, "Card payments");
    if (funding === undefined) return;

    const amount = Number(purchase.dAmount) || 0;
    const entry = await entryModel.create({
      cType: "C",
      nReferenceId,
      dAmount: amount,
      cStatus: status,
    });

    /* The Payment row plus its optional card companion; the entry
       links to the Payment row. Best effort, like the other flows: a
       failed ledger write still leaves the repayment status recorded. */
    let data = entry;
    try {
      const txn = await recordPayment({
        entry,
        values: cardPaymentTransaction({ purchase, card, amount }),
        userId,
      });

      /* The funding card's half: an Expense carrying the card link —
         the card's View shows that deduction (negative), while the
         Payment row records the repayment itself. Undo drops both. */
      if (txn && funding) {
        await recordCardDeduction({
          payment: txn,
          marker: CARD_REPAYMENT_DESCRIPTION,
          nCardId: funding.nCardId,
          userId,
        });
      }

      data =
        (await entryModel.setStatus(
          entry.nEntriesId,
          status,
          txn?.nTransactionId ?? null
        )) ?? entry;
    } catch (txnErr) {
      console.warn("[entries] could not write repayment transaction:", txnErr?.message || txnErr);
    }

    res.status(201).json({ ok: true, data });
  } catch (err) {
    sendError(res, err, "create repayment entry");
  }
}

/**
 * DELETE /api/entries/:id — remove ONE savings deposit together with
 * the tbltransactions row it created (linked through nTransactionId),
 * or ONE budget-plan line item (which has no ledger row to clean up).
 * Loan entries are rejected: their schedule is owned by the loan.
 */
export async function deleteEntry(req, res) {
  const userId = requireUser(req, res);
  if (userId === null) return;

  const id = parseId(req, res);
  if (id === null) return;

  try {
    const entry = await entryModel.findById(id);
    if (!entry) {
      return res.status(404).json({ ok: false, message: "Entry not found." });
    }
    if (entry.cType !== "S" && entry.cType !== "B") {
      return res.status(400).json({
        ok: false,
        message: "Loan and card entries are managed where they were created and cannot be deleted here.",
      });
    }

    /* Ownership through the referenced saving (entries have no owner). */
    const owner = await findOwner(entry.cType, entry.nReferenceId, userId);
    if (!owner) {
      return res.status(404).json({ ok: false, message: "Entry not found." });
    }

    /* A used plan's entries are expenses in the ledger — they are
       locked until the plan is activated again. */
    if (entry.cType === "B" && owner.cStatus === "C") {
      return res.status(400).json({
        ok: false,
        message: "This plan has been used — its entries can no longer be deleted.",
      });
    }

    const removed = await entryModel.remove(id);
    if (!removed) {
      return res.status(404).json({ ok: false, message: "Entry not found." });
    }

    /* Same choice as an undone payment: drop the ledger rows it made —
       best effort (both helpers log a failed delete; the link stays so
       a later attempt can finish the cleanup). A card-paid deposit has
       TWO rows: its Expense companion (the card's deduction) first,
       then the linked Savings row. */
    await forgetCardDeduction(entry, userId);
    await forgetPayment(entry, userId);

    res.status(200).json({ ok: true, message: "Entry deleted." });
  } catch (err) {
    sendError(res, err, "delete entry");
  }
}

/**
 * PUT /api/entries/:id { cStatus, nCardId? } — record (or un-record) a payment.
 * The loans controller owns creation/rebuilds of entries; this endpoint
 * only sets the status on a single row (X pending, P paid, L late,
 * A advance) and keeps the parent loan in step: all entries settled ->
 * Completed, one un-paid -> back to Active.
 *
 * SETTLED (P/L/A) also writes the matching tbltransactions row — type
 * "P" Payment, title "<loan title> - <due date>", amount = that term's
 * installment, description "Loan Payment" — and stores its id in the
 * entry's nTransactionId. UNDO (X) deletes that row and clears the
 * link. The ledger is best effort: if it cannot be written the payment
 * status is still recorded (and vice versa never leaves a link pointing
 * at a row that no longer exists).
 *
 * Add `nCardId` (one of the caller's DEBIT cards) when that card pays
 * the installment: a SECOND row is written beside the Payment one — an
 * EXPENSE row ("E", description CARD_LOAN_PAYMENT_DESCRIPTION)
 * carrying the card link, so the card's balance is deducted and the
 * card's View shows that row as money out (a negative amount). UNDO
 * removes both rows; re-recording a payment drops any companion an
 * earlier settle wrote before writing the current one.
 *
 * CARD REPAYMENTS (cType "C") ride the same road, pointed at a
 * credit-card Purchase instead of a loan term: the Payment row's title
 * comes from the purchase + its card's billing due day, it links the
 * CREDIT card (money back in), the companion marker is
 * CARD_REPAYMENT_DESCRIPTION, and there is no parent status to keep in
 * step. POST creates the entry; PUT is how it is re-paid after an undo.
 */
export async function updateEntry(req, res) {
  const userId = requireUser(req, res);
  if (userId === null) return;

  const id = parseId(req, res);
  if (id === null) return;

  /* A budget-plan line item is edited, not settled: it carries a title
     and an amount instead of a payment status, so it takes its own
     branch before the payment vocabulary is checked. */
  const entry = await entryModel.findById(id);
  if (!entry) {
    return res.status(404).json({ ok: false, message: "Entry not found." });
  }
  if (entry.cType === "B") {
    return updateBudgetPlanEntry(req, res, userId, entry);
  }

  const status = typeof req.body?.cStatus === "string" ? req.body.cStatus.trim() : "";
  if (!VALID_STATUSES.includes(status)) {
    return res.status(400).json({
      ok: false,
      message: "cStatus must be X (pending), P (paid), L (late) or A (advance).",
    });
  }

  /* nCardId — optional DEBIT card paying FOR this entry: it writes a
     second ledger row beside the Payment row (the card's deduction).
     Never sent with undo (X) — the companion goes then. Parsed + owned
     below, once the entry's type is known (its error names the kind
     of payment). */

  try {
    /* Savings entries are written once (POST) and removed (DELETE) with
       a fixed status — there is nothing for PUT to change. Loan (L)
       and card-repayment (C) entries are what this endpoint moves. */
    const isLoan = entry.cType === "L";
    if (!isLoan && entry.cType !== "C") {
      return res.status(400).json({
        ok: false,
        message: "Only loan and card entries support status updates.",
      });
    }

    /* Ownership through the referenced row (entries have no owner) —
       the loan behind an "L" entry, the Purchase behind a "C" one;
       foreign entries read as 404, same as the rows themselves. */
    const owner = await findOwner(entry.cType, entry.nReferenceId, userId);
    if (!owner) {
      return res.status(404).json({ ok: false, message: "Entry not found." });
    }

    /* A card repayment pays off a purchase charged to a CREDIT card —
       the card also supplies the billing due day for the row title. */
    const creditCard = isLoan ? null : await findCreditCard(owner, userId);
    if (!isLoan && !creditCard) {
      return res.status(400).json({
        ok: false,
        message: "Only purchases on a credit card can be repaid.",
      });
    }

    /* …and through the funding card, when one was named (never trust
       an id from the client). Only DEBIT cards may pay — they are the
       ones holding money (same rule as deposits). */
    const funding = await fundingCardOf(
      req,
      res,
      userId,
      isLoan ? "Loan payments" : "Card payments"
    );
    if (funding === undefined) return;
    const nCardId = funding ? funding.nCardId : null;

    /* Loan only: the schedule in term order — the row's position gives
       the due date used in the generated transaction's title, and the
       list drives the completion check at the end. */
    const siblings = isLoan
      ? await entryModel.findByReference(entry.cType, entry.nReferenceId)
      : [];
    const foundAt = siblings.findIndex((row) => row.nEntriesId === id);
    const index = foundAt < 0 ? 0 : foundAt;

    const settled = SETTLED_ENTRY_STATUSES.includes(status);
    /* undefined = leave the link untouched (never sent to the model). */
    let link;

    if (settled) {
      /* Re-recording a payment may change its source: drop any card
         companion an earlier settle wrote (matched through the linked
         row AS IT STANDS NOW — before recordPayment refreshes it),
         then, when a card pays this time, write a fresh one beside
         the Payment row. */
      await forgetCardDeduction(entry, userId);

      try {
        const paymentRow = await recordPayment({
          entry,
          values: isLoan
            ? paymentTransaction({
                loan: owner,
                dueDate: dueDateFor(owner, index),
                amount: entry.dAmount,
              })
            : cardPaymentTransaction({
                purchase: owner,
                card: creditCard,
                amount: entry.dAmount,
              }),
          userId,
        });
        link = paymentRow?.nTransactionId ?? null;

        /* The card's half of the payment: an Expense carrying the card
           link — the card's View shows that deduction (negative), while
           the Payment row records the installment / repayment itself.
           Undo drops both rows. */
        if (paymentRow && nCardId !== null) {
          await recordCardDeduction({
            payment: paymentRow,
            marker: isLoan
              ? CARD_LOAN_PAYMENT_DESCRIPTION
              : CARD_REPAYMENT_DESCRIPTION,
            nCardId,
            userId,
          });
        }
      } catch (payErr) {
        console.warn("[entries] could not write payment transaction:", payErr?.message || payErr);
        link = linkOf(entry); // keep any existing link so a retry can still fix it
      }
    } else {
      /* Undo: the card companion first (it is found through the linked
         Payment row), then the Payment row itself. When the delete
         fails, keep the link so a later undo can finish the cleanup. */
      await forgetCardDeduction(entry, userId);
      link = (await forgetPayment(entry, userId)) ? null : linkOf(entry);
    }

    const updated = await entryModel.setStatus(id, status, link);
    if (!updated) {
      return res.status(404).json({ ok: false, message: "Entry not found." });
    }

    /* Keep the parent LOAN in step (a card repayment has no parent
       status to drive): every entry settled -> Completed ("C"),
       anything still pending -> Active ("A"). Best effort — the payment
       itself already succeeded. The row just written is judged by its
       NEW status (siblings still hold the old one). */
    if (isLoan) {
      try {
        const allSettled =
          siblings.length > 0 &&
          siblings.every((row) =>
            row.nEntriesId === id
              ? SETTLED_ENTRY_STATUSES.includes(status)
              : SETTLED_ENTRY_STATUSES.includes(row.cStatus)
          );
        const target = allSettled ? "C" : "A";
        if (owner.cStatus !== target && (owner.cStatus === "A" || owner.cStatus === "C")) {
          await loanModel.update(entry.nReferenceId, { cStatus: target }, userId);
        }
      } catch (syncErr) {
        console.warn("[entries] could not sync loan status:", syncErr?.message || syncErr);
      }
    }

    res.status(200).json({ ok: true, data: updated });
  } catch (err) {
    sendError(res, err, "update entry");
  }
}
