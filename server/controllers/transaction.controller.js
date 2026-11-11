/* ------------------------------------------------------------------
   HTTP layer for /api/transactions — the Income/Expense ledger
   (tbltransactions), which backs the Income/Expense tab.

   Validates input, calls server/models/transaction.model.js, and
   shapes the JSON responses. Mounted by server/routes/transactions.route.js
   (Express) and re-used by api/transactions*.js (Vercel serverless), so
   behaviour is identical in development and production.

   Response shapes:
     success -> { ok: true,  data }  or  { ok: true, message }
     failure -> { ok: false, message, errors? , debug? }

   AUTH: every endpoint requires a signed-in session (401 otherwise) and
   only ever reads/writes rows whose `nUserId` matches the session user,
   so each user sees exactly their own transactions.

   SERVER-OWNED FIELDS (never read from a request body):
     nTransactionId  identity primary key
     nUserId         stamped from the session cookie on create
     dttCreated      set on insert
     strCode         auto-generated as TXN-<id> after insert (user chose
                     "auto-generated": derived from the identity so codes
                     never collide, even after deletions)

    CARD LINK (user-owned): nCardId points at tblcards.nCardId — a row
    carrying it is a transaction charged to that card (the Cards tab
    computes the card's balance from these rows). Nullable: null means
    the transaction belongs to no card. The id is verified against the
    caller's own cards on every write.
   ------------------------------------------------------------------ */

import * as transactionModel from "../models/transaction.model.js";
import * as cardModel from "../models/card.model.js";
import { getSessionUserId } from "../utils/session.js";

const TITLE_MAX = 200;
const DESCRIPTION_MAX = 1000;
const VALID_TYPES = ["I", "E", "B", "P", "S"]; // I = Income, E = Expense, B = Purchase (card), P = Payment (loan), S = Savings (deposit)

/** Reads and validates :id. Sends a 400 and returns null when invalid. */
function parseId(req, res) {
  // Express puts :id in req.params; Vercel serverless puts it in req.query.
  const raw = req.params?.id ?? req.query?.id;
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ ok: false, message: "Invalid transaction id." });
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

/**
 * Validates + normalises a request body.
 *   create (isNew): every field is processed, required fields enforced.
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
    // The number input sends strings; accept both, reject everything else.
    const raw = body.dAmount;
    const amount =
      typeof raw === "number"
        ? raw
        : typeof raw === "string" && raw.trim() !== ""
          ? Number(raw)
          : NaN;

    if (!Number.isFinite(amount)) {
      errors.dAmount = "Amount must be a valid number.";
    } else if (amount < 0) {
      errors.dAmount = "Amount cannot be negative.";
    } else {
      values.dAmount = amount;
    }
  }

  if (isNew || has("cType")) {
    const type = str(body.cType);
    if (!type) {
      errors.cType = "Type is required.";
    } else if (!VALID_TYPES.includes(type)) {
      errors.cType = "Type must be Income, Expense, Purchase, Payment, or Savings.";
    } else {
      values.cType = type;
    }
  }

  /* nCardId — the card this transaction belongs to (nullable): a row
     with no card is just a plain ledger entry. Only the shape is
     checked here; the ownership check (the card must exist AND belong
     to the caller) runs async in assertCardOwned() below. */
  if (isNew || has("nCardId")) {
    const raw = body.nCardId;
    if (raw === null || raw === undefined || raw === "") {
      values.nCardId = null; // clears the link on a partial update
    } else {
      const cardId = Number(raw);
      if (!Number.isInteger(cardId) || cardId <= 0) {
        errors.nCardId = "Card must be one of your cards.";
      } else {
        values.nCardId = cardId;
      }
    }
  }

  return { values, errors };
}

/**
 * Guards the card link. The rules:
 *   - the card must exist AND belong to the caller (never trust an id
 *     from the client),
 *   - a plain Expense ("E") and a Purchase ("B") may charge any of the
 *     caller's cards (money out — E also covers a savings deposit paid
 *     from the card, written by the savings entries modal),
 *   - Income ("I") may only link a DEBIT card (money landing on a
 *     debit balance).
 * Sends 400 and returns false when a rule breaks. On a partial update
 * that carries nCardId but no cType, only the ownership rule applies
 * (the UI always sends both together).
 */
async function assertCardOwned(res, values, userId) {
  if (values.nCardId === null || values.nCardId === undefined) return true;

  const card = await cardModel.findById(values.nCardId, userId);
  if (!card) {
    res.status(400).json({
      ok: false,
      message: "That card was not found among your cards.",
      errors: { nCardId: "Pick one of your cards, or none." },
    });
    return false;
  }

  if (values.cType === "I" && card.cType !== "D") {
    res.status(400).json({
      ok: false,
      message: "Income can only be linked to a debit card.",
      errors: { nCardId: "Pick a debit card, or use Purchase for a credit card." },
    });
    return false;
  }
  return true;
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
      message: "That record conflicts with an existing transaction.",
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
  console.error(`[transactions] failed to ${action}:`, err?.message || err);

  res.status(status).json({
    ok: false,
    message: status === 500 ? "Unexpected server error." : err?.message || "Request failed.",
    ...(status === 500 && process.env.NODE_ENV !== "production"
      ? { debug: err?.message }
      : {}),
  });
}

/** GET /api/transactions — the signed-in user's rows only. */
export async function listTransactions(req, res) {
  const userId = requireUser(req, res);
  if (userId === null) return;

  try {
    const transactions = await transactionModel.findAllForUser(userId);
    res.status(200).json({ ok: true, data: transactions });
  } catch (err) {
    sendError(res, err, "load transactions");
  }
}

/** GET /api/transactions/:id */
export async function getTransaction(req, res) {
  const userId = requireUser(req, res);
  if (userId === null) return;

  const id = parseId(req, res);
  if (id === null) return;

  try {
    /* Scoped to the caller: someone else's id reads as missing (404),
       not forbidden — never leak that the row exists. */
    const transaction = await transactionModel.findById(id, userId);
    if (!transaction) {
      return res.status(404).json({ ok: false, message: "Transaction not found." });
    }
    res.status(200).json({ ok: true, data: transaction });
  } catch (err) {
    sendError(res, err, "load transaction");
  }
}

/** POST /api/transactions */
export async function createTransaction(req, res) {
  const userId = requireUser(req, res);
  if (userId === null) return;

  const { values, errors } = validate(req.body, { isNew: true });
  if (Object.keys(errors).length > 0) return sendValidation(res, errors);

  try {
    if (!(await assertCardOwned(res, values, userId))) return;

    // The owner comes from the session — a body-sent nUserId is ignored.
    // createWithCode also stamps TXN-<id> (best effort) after the insert.
    const data = await transactionModel.createWithCode({ ...values, nUserId: userId });

    res.status(201).json({ ok: true, data });
  } catch (err) {
    sendError(res, err, "create transaction");
  }
}

/** PUT /api/transactions/:id — partial update: only fields present in the body change. */
export async function updateTransaction(req, res) {
  const userId = requireUser(req, res);
  if (userId === null) return;

  const id = parseId(req, res);
  if (id === null) return;

  const { values, errors } = validate(req.body, { isNew: false });
  if (Object.keys(errors).length > 0) return sendValidation(res, errors);

  if (Object.keys(values).length === 0) {
    return res.status(400).json({ ok: false, message: "No fields to update." });
  }

  try {
    if (!(await assertCardOwned(res, values, userId))) return;

    const transaction = await transactionModel.update(id, values, userId);
    if (!transaction) {
      return res.status(404).json({ ok: false, message: "Transaction not found." });
    }
    res.status(200).json({ ok: true, data: transaction });
  } catch (err) {
    sendError(res, err, "update transaction");
  }
}

/** DELETE /api/transactions/:id */
export async function deleteTransaction(req, res) {
  const userId = requireUser(req, res);
  if (userId === null) return;

  const id = parseId(req, res);
  if (id === null) return;

  try {
    const removed = await transactionModel.remove(id, userId);
    if (!removed) {
      return res.status(404).json({ ok: false, message: "Transaction not found." });
    }
    res.status(200).json({ ok: true, message: "Transaction deleted." });
  } catch (err) {
    sendError(res, err, "delete transaction");
  }
}
