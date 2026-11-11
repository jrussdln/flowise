/* ------------------------------------------------------------------
   HTTP layer for /api/loans — the Loans tab (tblloans).

   Validates input, calls server/models/loan.model.js, and shapes the
   JSON responses. Mounted by server/routes/loans.route.js inside
   server/app.js — the same Express app that api/index.js runs on
   Vercel, so behaviour is identical in development and production.

   Response shapes:
     success -> { ok: true,  data }  or  { ok: true, message }
     failure -> { ok: false, message, errors? , debug? }

   AUTH: every endpoint requires a signed-in session (401 otherwise) and
   only ever reads/writes rows whose `nUserId` matches the session user,
   so each user sees exactly their own loans.

   LIFECYCLE: a new loan is always created Pending (cStatus "P"); the
   UI's Activate button sends PUT { cStatus: "A" } to activate it.
   Activating builds a flat-interest payment schedule in `tblentries`
   (one row per term: cType "L", nReferenceId = nLoanId, cStatus "X" =
   pending, "P" = paid, "L" = late payment, "A" = advance payment).
   While a loan stays Active, any edit rebuilds its entries from the
   loan's current numbers; deactivating (A -> P) or deleting the loan
   clears them. A loan flips to Completed ("C") automatically on
   PUT /api/entries/:id once every entry is settled (P/L/A), and back
   to Active when one is un-paid — edits to a Completed loan resync its
   entries like an Active one (never delete them).

   PAYMENTS: every settled entry also owns a tbltransactions row —
   cType "P" (Payment), title "<loan title> - <due date>", amount =
   that term's installment, description "Loan Payment" — linked
   through tblentries.nTransactionId. A rebuild carries status AND
   link over by term position (and refreshes the row's title/amount
   from the loan's current numbers); deactivating or deleting the
   loan removes those Payment rows along with the schedule. An
   installment paid FROM a debit card also wrote a companion Expense
   row (the card's deduction — see utils/cardDeduction.js): rebuilds
   refresh its title/amount alongside the Payment row's, and loan
   removal takes it with its Payment row.

   dttDueDate is USER-OWNED: picked in the loan form as the FIRST payment
   date. The card renders the schedule range first – last, where
   last = first + (nTerms - 1) × interest period (D days, W weeks,
   M months, A years).

   SERVER-OWNED FIELDS (never read from a request body):
     nLoanId     identity primary key
     nUserId     stamped from the session cookie on create
     dttCreated  set on insert
     strCode     auto-generated as LON-<id> after insert (derived from
                 the identity so codes never collide, even after deletions)
     cStatus     forced to "P" on create; only P/A/C accepted on update
                 (C = Completed, also set automatically once every
                 entry is settled)

    USER-OWNED, COSMETIC (validated in utils/cardMeta.js):
      strColor     accent colour painted on the card (nullable hex)
      bIsFavorite  pins the card to the top of the grid (nullable bool)
   ------------------------------------------------------------------ */

import * as loanModel from "../models/loan.model.js";
import * as entryModel from "../models/entry.model.js";
import * as transactionModel from "../models/transaction.model.js";
import { getSessionUserId } from "../utils/session.js";
import { dueDateFor, paymentTransaction, toTransactionId } from "../utils/schedule.js";
import {
  refreshCardDeduction,
  removeWithCardDeduction,
} from "../utils/cardDeduction.js";
import { applyCardMeta, isPresentationOnly } from "../utils/cardMeta.js";

const TITLE_MAX = 200;
const DESCRIPTION_MAX = 1000;
const VALID_PERIODS = ["D", "W", "M", "A"]; // D = Daily, W = Weekly, M = Monthly, A = Annual
const VALID_STATUSES = ["P", "A", "C"]; // P = Pending, A = Active, C = Completed
const PENDING_STATUS = "P"; // every new loan starts Pending
const ENTRY_TYPE_LOAN = "L"; // tblentries.cType for loan schedules
const ENTRY_STATUS_PENDING = "X"; // tblentries.cStatus: X = pending (awaiting payment)
const PAID_ENTRY_STATUSES = ["P", "L", "A"]; // P = paid, L = late, A = advance

/** LON-0001, LON-0002, ... — padded to 4 digits, wider ids kept whole. */
function makeLoanCode(id) {
  return `LON-${String(id).padStart(4, "0")}`;
}

/**
 * Flat-interest payment schedule (user chose "Flat"): the whole loan
 * costs principal × (1 + rate × terms) where rate = dInterest/100 per
 * cInterestType period (one term = one period). Returns one entry per
 * term; the final installment absorbs rounding so the schedule sums
 * exactly to the total.
 */
function computeInstallments(loan) {
  const principal = Number(loan.dAmount) || 0;
  const rate = (Number(loan.dInterest) || 0) / 100;
  const terms = Number(loan.nTerms) || 0;
  if (principal <= 0 || terms < 1) return [];

  const round2 = (v) => Math.round(v * 100) / 100;
  const total = round2(principal * (1 + rate * terms));
  const base = round2(total / terms);
  const amounts = new Array(terms).fill(base);
  amounts[terms - 1] = round2(total - base * (terms - 1));

  return amounts.map((dAmount) => ({
    cType: ENTRY_TYPE_LOAN,
    nReferenceId: loan.nLoanId,
    dAmount,
    cStatus: ENTRY_STATUS_PENDING,
  }));
}

/* Rebuilds a loan's schedule in tblentries (delete + insert — entries are
   derived data that always mirror the loan's current numbers). Idempotent,
   so it is safe to call on every activation and every edit. Settled payments
   (paid / late / advance) are real world state — carried across the rebuild
   by term position, together with the tbltransactions row each one
   generated (tblentries.nTransactionId), so the Income/Expense ledger keeps
   pointing at the term it was created for. */
async function syncEntries(loan) {
  const previous = await entryModel.findByReference(ENTRY_TYPE_LOAN, loan.nLoanId);
  await entryModel.removeByReference(ENTRY_TYPE_LOAN, loan.nLoanId);

  const rows = computeInstallments(loan);
  if (rows.length === 0) {
    // Nothing left to schedule — the payments it used to describe go too.
    await removePaymentTransactions(previous, loan.nUserId);
    return;
  }

  const created = await entryModel.createMany(rows);
  const byTerm = created.sort((a, b) => a.nEntriesId - b.nEntriesId); // insertion order = term order
  const settled = []; // [{ nEntriesId, cStatus, nTransactionId, index, dAmount }]
  byTerm.forEach((row, i) => {
    const prev = previous[i];
    if (!PAID_ENTRY_STATUSES.includes(prev?.cStatus)) return;
    settled.push({
      nEntriesId: row.nEntriesId,
      cStatus: prev.cStatus,
      nTransactionId: toTransactionId(prev.nTransactionId),
      index: i,
      dAmount: row.dAmount,
    });
  });

  if (settled.length > 0) {
    await entryModel.setSettledMany(
      settled.map(({ nEntriesId, cStatus, nTransactionId }) => ({
        nEntriesId,
        cStatus,
        nTransactionId,
      }))
    );

    /* The loan itself may have been edited (title / first due date /
       amount), so refresh every generated Payment row: its title is
       "<loan title> - <due date>" and its amount is this term's
       installment. Best effort — the schedule is already correct. */
    for (const row of settled) {
      if (row.nTransactionId === null) continue;
      try {
        /* The row as it stands BEFORE the rewrite — its card
           companion (the installment was paid from a debit card) is
           found through this old title and amount, then refreshed to
           the new numbers so the pair still matches on undo. */
        const before = await transactionModel.findById(
          row.nTransactionId,
          loan.nUserId
        );
        const values = paymentTransaction({
          loan,
          dueDate: dueDateFor(loan, row.index),
          amount: row.dAmount,
        });
        await transactionModel.update(row.nTransactionId, values, loan.nUserId);
        if (before) {
          await refreshCardDeduction({
            before,
            after: values,
            userId: loan.nUserId,
          });
        }
      } catch (txnErr) {
        console.warn("[loans] could not refresh payment transaction:", txnErr?.message || txnErr);
      }
    }
  }

  /* Terms that no longer exist (the loan now has fewer of them) leave
     their Payment row behind with nothing pointing at it — drop them. */
  await removePaymentTransactions(previous.slice(byTerm.length), loan.nUserId);
}

/** Removes a loan's schedule AND the Payment transactions its settled
 *  entries generated — those rows describe this loan only, so they go
 *  with it (used when a loan is deactivated or deleted). */
async function clearEntries(loan, userId) {
  const removed = await entryModel.removeByReference(ENTRY_TYPE_LOAN, loan.nLoanId);
  await removePaymentTransactions(removed, userId);
}

/** Best effort: drops the tbltransactions rows linked to `rows` —
 *  each Payment row together with the card-deduction companion it may
 *  have (an installment paid FROM a debit card wrote one). */
async function removePaymentTransactions(rows, userId) {
  const ids = (rows ?? [])
    .map((row) => toTransactionId(row.nTransactionId))
    .filter((id) => id !== null);
  if (ids.length === 0) return;

  try {
    for (const id of ids) {
      const payment = await transactionModel.findById(id, userId);
      if (payment) await removeWithCardDeduction(payment, userId);
    }
    await transactionModel.removeMany(ids, userId);
  } catch (err) {
    console.warn("[loans] could not remove payment transactions:", err?.message || err);
  }
}

/** Reads and validates :id. Sends a 400 and returns null when invalid. */
function parseId(req, res) {
  // Express puts :id in req.params; Vercel serverless puts it in req.query.
  const raw = req.params?.id ?? req.query?.id;
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ ok: false, message: "Invalid loan id." });
    return null;
  }
  return id;
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

/** Parses a numeric body field the number input may send as a string. */
function toNumber(raw) {
  if (typeof raw === "number") return raw;
  if (typeof raw === "string" && raw.trim() !== "") return Number(raw);
  return NaN;
}

/**
 * Validates + normalises a request body.
 *   create (isNew): every field is processed, required fields enforced,
 *                   and server-owned fields (cStatus/nUserId/...) ignored.
 *   update: only keys present in the body are returned in `values`, so a
 *           missing key never overwrites the stored value (partial update).
 * Returns { values, errors } — respond 400 when `errors` is non-empty.
 */
function validate(body = {}, { isNew = false } = {}) {
  const errors = {};
  const str = (v) => (typeof v === "string" ? v.trim() : "");
  const has = (k) => Object.prototype.hasOwnProperty.call(body, k);
  const values = {};

  if (isNew || has("strTitle")) {
    const title = str(body.strTitle);
    if (!title) {
      errors.strTitle = "Title is required.";
    } else if (title.length > TITLE_MAX) {
      errors.strTitle = `Title must be ${TITLE_MAX} characters or fewer.`;
    } else {
      values.strTitle = title;
    }
  }

  if (isNew || has("strDescription")) {
    const description = str(body.strDescription);
    if (description.length > DESCRIPTION_MAX) {
      errors.strDescription = `Description must be ${DESCRIPTION_MAX} characters or fewer.`;
    } else {
      values.strDescription = description || null;
    }
  }

  if (isNew || has("dAmount")) {
    const amount = toNumber(body.dAmount);
    if (!Number.isFinite(amount)) {
      errors.dAmount = "Amount must be a valid number.";
    } else if (amount <= 0) {
      errors.dAmount = "Loan amount must be greater than zero.";
    } else {
      values.dAmount = amount;
    }
  }

  if (isNew || has("cInterestType")) {
    const period = str(body.cInterestType);
    if (!period) {
      errors.cInterestType = "Interest period is required.";
    } else if (!VALID_PERIODS.includes(period)) {
      errors.cInterestType = "Period must be Daily, Weekly, Monthly, or Annual.";
    } else {
      values.cInterestType = period;
    }
  }

  if (isNew || has("dInterest")) {
    const interest = toNumber(body.dInterest);
    if (!Number.isFinite(interest)) {
      errors.dInterest = "Interest rate must be a valid number.";
    } else if (interest < 0) {
      errors.dInterest = "Interest rate cannot be negative.";
    } else {
      values.dInterest = interest;
    }
  }

  if (isNew || has("nTerms")) {
    const terms = toNumber(body.nTerms);
    if (!Number.isFinite(terms)) {
      errors.nTerms = "Terms must be a valid number.";
    } else if (!Number.isInteger(terms)) {
      errors.nTerms = "Terms must be a whole number.";
    } else if (terms < 1) {
      errors.nTerms = "Terms must be at least 1.";
    } else {
      values.nTerms = terms;
    }
  }

  /* First payment date — the card shows first – last across the terms. */
  if (isNew || has("dttDueDate")) {
    const raw = str(body.dttDueDate);
    if (!raw) {
      errors.dttDueDate = "Due date is required.";
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      // HTML date input (YYYY-MM-DD): keep the picked calendar day as-is.
      // V8 silently rolls 2027-02-30 over to Mar 2 — rebuild the date from
      // the parts and compare, so impossible dates are rejected.
      const [y, m, d] = raw.split("-").map(Number);
      const rebuilt = new Date(Date.UTC(y, m - 1, d));
      const isReal =
        rebuilt.getUTCFullYear() === y &&
        rebuilt.getUTCMonth() === m - 1 &&
        rebuilt.getUTCDate() === d;
      if (!isReal) {
        errors.dttDueDate = "Due date must be a real calendar date.";
      } else {
        values.dttDueDate = `${raw}T00:00:00`;
      }
    } else if (!Number.isNaN(new Date(raw).getTime())) {
      values.dttDueDate = new Date(raw).toISOString().slice(0, 19);
    } else {
      errors.dttDueDate = "Due date must be a valid date.";
    }
  }

  /* cStatus is server-owned on create (forced to Pending) — only an
     update may change it, and only between the two known states. */
  if (!isNew && has("cStatus")) {
    const status = str(body.cStatus);
    if (!VALID_STATUSES.includes(status)) {
      errors.cStatus = "Status must be Pending, Active, or Completed.";
    } else {
      values.cStatus = status;
    }
  }

  /* strColor / bIsFavorite — the cosmetic columns this controller
     shares with saving.controller.js (see utils/cardMeta.js). */
  applyCardMeta(body, { isNew }, values, errors);

  return { values, errors };
}

function sendValidation(res, errors) {
  res.status(400).json({
    ok: false,
    message: "Please fix the highlighted fields.",
    errors,
  });
}

/** Maps model/Supabase errors to an HTTP response (mirrors user.controller.js). */
function sendError(res, err, action) {
  if (err?.code === "23505") {
    return res.status(409).json({
      ok: false,
      message: "That record conflicts with an existing loan.",
    });
  }
  if (err?.code === "22001") {
    return res.status(400).json({ ok: false, message: "One of the values sent is too long." });
  }
  if (err?.code === "22P02") {
    return res.status(400).json({
      ok: false,
      message: "One of the values sent is not in the expected format.",
    });
  }

  const status = err?.status || err?.statusCode || 500;
  console.error(`[loans] failed to ${action}:`, err?.message || err);

  res.status(status).json({
    ok: false,
    message: status === 500 ? "Unexpected server error." : err?.message || "Request failed.",
    ...(status === 500 && process.env.NODE_ENV !== "production"
      ? { debug: err?.message }
      : {}),
  });
}

/** GET /api/loans — the signed-in user's rows only. Each loan carries the
 *  card summary fields nEntriesTotal / nEntriesPaid / dPaidAmount /
 *  dRemaining so the UI can render "1/12 paid · ₱…" and the remaining
 *  balance without N+1 entry fetches. */
export async function listLoans(req, res) {
  const userId = requireUser(req, res);
  if (userId === null) return;

  try {
    const loans = await loanModel.findAllForUser(userId);

    // One entries query for every loan, aggregated by reference id.
    const entries = await entryModel.findByReferences(
      ENTRY_TYPE_LOAN,
      loans.map((l) => l.nLoanId)
    );
    const agg = new Map(); // nLoanId -> { total, paid, amount, scheduled }
    for (const e of entries) {
      const a = agg.get(e.nReferenceId) || { total: 0, paid: 0, amount: 0, scheduled: 0 };
      a.total += 1;
      a.scheduled += Number(e.dAmount) || 0; // every installment, settled or not
      if (PAID_ENTRY_STATUSES.includes(e.cStatus)) {
        a.paid += 1;
        a.amount += Number(e.dAmount) || 0;
      }
      agg.set(e.nReferenceId, a);
    }
    const round2 = (v) => Math.round(v * 100) / 100;
    const data = loans.map((l) => {
      const a = agg.get(l.nLoanId) || { total: 0, paid: 0, amount: 0, scheduled: 0 };
      const paidAmount = round2(a.amount);
      /* A Pending loan has no schedule rows yet — fall back to the
         installments its current numbers would produce. */
      const scheduled =
        a.scheduled > 0
          ? a.scheduled
          : computeInstallments(l).reduce((sum, row) => sum + (Number(row.dAmount) || 0), 0);
      return {
        ...l,
        nEntriesTotal: a.total,
        nEntriesPaid: a.paid,
        dPaidAmount: paidAmount,
        /* What is still owed: the whole schedule minus what was settled. */
        dRemaining: Math.max(0, round2(scheduled - paidAmount)),
      };
    });

    res.status(200).json({ ok: true, data });
  } catch (err) {
    sendError(res, err, "load loans");
  }
}

/** GET /api/loans/:id */
export async function getLoan(req, res) {
  const userId = requireUser(req, res);
  if (userId === null) return;

  const id = parseId(req, res);
  if (id === null) return;

  try {
    /* Scoped to the caller: someone else's id reads as missing (404),
       not forbidden — never leak that the row exists. */
    const loan = await loanModel.findById(id, userId);
    if (!loan) {
      return res.status(404).json({ ok: false, message: "Loan not found." });
    }
    res.status(200).json({ ok: true, data: loan });
  } catch (err) {
    sendError(res, err, "load loan");
  }
}

/** POST /api/loans — always created Pending (cStatus "P"). */
export async function createLoan(req, res) {
  const userId = requireUser(req, res);
  if (userId === null) return;

  const { values, errors } = validate(req.body, { isNew: true });
  if (Object.keys(errors).length > 0) return sendValidation(res, errors);

  try {
    // Owner + status come from the server — a body-sent nUserId or
    // cStatus ("A"?) is ignored; every new loan starts Pending.
    const row = await loanModel.create({
      ...values,
      nUserId: userId,
      cStatus: PENDING_STATUS,
    });

    // strCode (LON-<id>) is derived from the identity — assign it in one
    // best-effort write. If it fails the row is still valid (the column is
    // nullable). dttDueDate already arrived from the form.
    let data = row;
    if (!row.strCode) {
      try {
        data =
          (await loanModel.update(row.nLoanId, { strCode: makeLoanCode(row.nLoanId) }, userId)) ??
          row;
      } catch (codeErr) {
        console.warn("[loans] could not assign strCode:", codeErr?.message || codeErr);
      }
    }

    res.status(201).json({ ok: true, data });
  } catch (err) {
    sendError(res, err, "create loan");
  }
}

/** Columns that make up an Active loan's schedule. They generate the
 *  entries in tblentries (and, once payments arrive, their Payment rows),
 *  so while the loan is running none of them may change underneath that
 *  schedule — only presentation fields (title / description / colour /
 *  favourite) or cStatus (to cancel it) are accepted. */
const SCHEDULE_FIELDS = ["dAmount", "nTerms", "dttDueDate", "cInterestType", "dInterest"];

/** PUT /api/loans/:id — partial update: only fields present in the body change. */
export async function updateLoan(req, res) {
  const userId = requireUser(req, res);
  if (userId === null) return;

  const id = parseId(req, res);
  if (id === null) return;

  const { values, errors } = validate(req.body, { isNew: false });
  if (Object.keys(errors).length > 0) return sendValidation(res, errors);

  if (Object.keys(values).length === 0) {
    return res.status(400).json({ ok: false, message: "No fields to update." });
  }

  /* Schedule fields in the body? Confirm the loan isn't Active first.
     The Edit dialog never sends them for an Active loan — the API
     enforces the same rule. */
  const lockedFields = SCHEDULE_FIELDS.filter((key) => Object.hasOwn(values, key));

  try {
    if (lockedFields.length > 0) {
      const current = await loanModel.findById(id, userId);
      if (!current) {
        return res.status(404).json({ ok: false, message: "Loan not found." });
      }
      if (current.cStatus === "A") {
        return res.status(400).json({
          ok: false,
          message:
            "This loan is Active — its schedule is locked. Cancel the loan first to change its amount, terms, due date or interest.",
          errors: Object.fromEntries(
            lockedFields.map((key) => [key, "Locked while the loan is Active."])
          ),
        });
      }
    }

    /* dttDueDate is user-owned — no recompute here; the form sends the
       first payment date and edits leave it alone unless it is sent. */
    const loan = await loanModel.update(id, values, userId);
    if (!loan) {
      return res.status(404).json({ ok: false, message: "Loan not found." });
    }

    /* Keep tblentries in step: an Active or Completed loan owns a
       flat-interest schedule (one entry per term); a Pending one owns
       none. A failure here cannot undo the loan write — log it; the
       next update or activation re-syncs.

       A cosmetic-only write (colour / favourite) changes no number the
       schedule reads, so the sync is skipped entirely. */
    if (!isPresentationOnly(values)) {
      try {
        if (loan.cStatus === "A" || loan.cStatus === "C") {
          await syncEntries(loan);
        } else {
          // Back to Pending: no schedule, and no Payment rows left behind.
          await clearEntries(loan, userId);
        }
      } catch (entryErr) {
        console.warn("[loans] failed to sync tblentries:", entryErr?.message || entryErr);
      }
    }

    res.status(200).json({ ok: true, data: loan });
  } catch (err) {
    sendError(res, err, "update loan");
  }
}

/** DELETE /api/loans/:id */
export async function deleteLoan(req, res) {
  const userId = requireUser(req, res);
  if (userId === null) return;

  const id = parseId(req, res);
  if (id === null) return;

  try {
    /* Entries carry no owner column — confirm ownership first, then clear
       the loan's schedule before the loan itself so a failure can never
       leave orphaned rows behind. */
    const current = await loanModel.findById(id, userId);
    if (!current) {
      return res.status(404).json({ ok: false, message: "Loan not found." });
    }
    await clearEntries(current, userId);

    const removed = await loanModel.remove(id, userId);
    if (!removed) {
      return res.status(404).json({ ok: false, message: "Loan not found." });
    }
    res.status(200).json({ ok: true, message: "Loan deleted." });
  } catch (err) {
    sendError(res, err, "delete loan");
  }
}
