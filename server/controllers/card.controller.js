/* ------------------------------------------------------------------
   HTTP layer for /api/cards — the Cards tab (tblcards).

   Validates input, calls server/models/card.model.js, and shapes the
   JSON responses. Mounted by server/routes/cards.route.js (Express)
   and re-used by api/index.js (Vercel serverless), so behaviour is
   identical in development and production.

   Response shapes:
     success -> { ok: true,  data }  or  { ok: true, message }
     failure -> { ok: false, message, errors? , debug? }

   AUTH: every endpoint requires a signed-in session (401 otherwise) and
   only ever reads/writes rows whose `nUserId` matches the session user,
   so each user sees exactly their own cards.

   LIFECYCLE (same vocabulary as loans and savings — no schedule and no
   entries, because tblcards has no amount column):
     a new card is always created Pending (cStatus "P"); the UI's
     Activate button sends PUT { cStatus: "A" }, and its Complete button
     sends PUT { cStatus: "C" }. Nothing else about a card moves money.

   SERVER-OWNED FIELDS (never read from a request body):
     nCardId    identity primary key
     nUserId    stamped from the session cookie on create
     dttCreated set on insert
     strCode    auto-generated as CRD-<id> after insert (derived from
                the identity so codes never collide, even after deletions)
     cStatus    forced to "P" on create; only P/A/C accepted on update

   USER-OWNED:
     cType         the kind of card — D = Debit, C = Credit, P = Prepaid
                   (chosen in the dialog; defaults to "D" on create)
     strBankName   the bank/issuer name shown on the card (required on
                   create, max 200 chars)
     strAccountNumber  nullable account/card number (masked in the UI)
     strDescription    nullable free-text description
     dCreditLimit  nullable credit limit (credit cards only; null for debit)
      nDueDay        nullable billing due day (credit cards only — the
                    day of the month, 1–31, stored as an integer)
     strExpiry     nullable expiry date string
     nCVC          nullable 3-4 digit CVC (stored as bigint)
     strColor      accent colour painted on the card (nullable hex/code)
     bIsFavorite   pins the card to the top of the grid (nullable bool)
                   — the last two validated in utils/cardMeta.js
   ------------------------------------------------------------------ */

import * as cardModel from "../models/card.model.js";
import * as transactionModel from "../models/transaction.model.js";
import { getSessionUserId } from "../utils/session.js";
import { applyCardMeta } from "../utils/cardMeta.js";

const TITLE_MAX = 200;
const DESCRIPTION_MAX = 1000;
const VALID_STATUSES = ["P", "A", "C"]; // P = Pending, A = Active, C = Completed
const PENDING_STATUS = "P"; // every new card starts Pending
/* tblcards.cType — the kind of card. D/C/P is the whole vocabulary;
   widen this list (and CARD_TYPES in src/lib/cards.js) together. */
const VALID_TYPES = ["D", "C", "P"];
const DEFAULT_TYPE = "D"; // a create that omits cType stores Debit

/** Reads and validates :id. Sends a 400 and returns null when invalid. */
function parseId(req, res) {
  // Express puts :id in req.params; Vercel serverless puts it in req.query.
  const raw = req.params?.id ?? req.query?.id;
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ ok: false, message: "Invalid card id." });
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

  if (isNew || has("strBankName")) {
    const title = str(body.strBankName);
    if (!title) {
      errors.strBankName = "Bank name is required.";
    } else if (title.length > TITLE_MAX) {
      errors.strBankName = `Bank name must be ${TITLE_MAX} characters or fewer.`;
    } else {
      values.strBankName = title;
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

  /* cType — the card type (Debit / Credit / Prepaid). Blank clears it
     back to null on update; a create that never mentions it stores the
     default instead of leaving the column empty. */
  if (isNew || has("cType")) {
    const type = str(body.cType).toUpperCase();
    if (!type) {
      values.cType = isNew ? DEFAULT_TYPE : null;
    } else if (!VALID_TYPES.includes(type)) {
      errors.cType = "Type must be Debit, Credit, or Prepaid.";
    } else {
      values.cType = type;
    }
  }

  /* cStatus is server-owned on create (forced to Pending) — only an
     update may change it, and only between the three known states. */
  if (!isNew && has("cStatus")) {
    const status = str(body.cStatus);
    if (!VALID_STATUSES.includes(status)) {
      errors.cStatus = "Status must be Pending, Active, or Completed.";
    } else {
      values.cStatus = status;
    }
  }

  /* Card-specific fields — strAccountNumber, strExpiry, nCVC, dCreditLimit.
     All nullable; blank strings are stored as null. */
  if (isNew || has("strAccountNumber")) {
    const account = str(body.strAccountNumber);
    values.strAccountNumber = account || null;
  }

  if (isNew || has("strExpiry")) {
    const expiry = str(body.strExpiry);
    values.strExpiry = expiry || null;
  }

  /* nCVC — stored as bigint; must be 3-4 digits when present. */
  if (isNew || has("nCVC")) {
    const cvc = str(body.nCVC);
    if (!cvc) {
      values.nCVC = null;
    } else if (!/^\d{3,4}$/.test(cvc)) {
      errors.nCVC = "CVC must be 3 or 4 digits.";
    } else {
      values.nCVC = Number(cvc);
    }
  }

  /* dCreditLimit — credit cards only; must be a positive number. */
  if (isNew || has("dCreditLimit")) {
    const raw = body.dCreditLimit;
    if (raw === "" || raw === null || raw === undefined) {
      values.dCreditLimit = null;
    } else {
      const limit = Number(raw);
      if (!Number.isFinite(limit) || limit <= 0) {
        errors.dCreditLimit = "Credit limit must be a positive number.";
      } else {
        values.dCreditLimit = limit;
      }
    }
  }

  /* nDueDay — the credit card's BILLING due day: the day of the month
     (1–31) the bill falls due. Blank clears it. */
  if (isNew || has("nDueDay")) {
    const raw = body.nDueDay;
    if (raw === "" || raw === null || raw === undefined) {
      values.nDueDay = null;
    } else {
      const day = Number(raw);
      if (!Number.isInteger(day) || day < 1 || day > 31) {
        errors.nDueDay = "Due day must be a whole number from 1 to 31.";
      } else {
        values.nDueDay = day;
      }
    }
  }

  /* strColor / bIsFavorite — the cosmetic columns this controller
     shares with loan.controller.js and saving.controller.js
     (see utils/cardMeta.js). */
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

/** Maps model/Supabase errors to an HTTP response (mirrors saving.controller.js). */
function sendError(res, err, action) {
  if (err?.code === "23505") {
    return res.status(409).json({
      ok: false,
      message: "That record conflicts with an existing card.",
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
  console.error(`[cards] failed to ${action}:`, err?.message || err);

  res.status(status).json({
    ok: false,
    message: status === 500 ? "Unexpected server error." : err?.message || "Request failed.",
    ...(status === 500 && process.env.NODE_ENV !== "production"
      ? { debug: err?.message }
      : {}),
  });
}

/** GET /api/cards — the signed-in user's rows only. Each card carries
 *  dBalance, the sum of its transactions (Income/Savings in, the rest out). */
export async function listCards(req, res) {
  const userId = requireUser(req, res);
  if (userId === null) return;

  try {
    const cards = await cardModel.findAllForUser(userId);
    const balances = await transactionModel.sumByCard(userId);

    const data = cards.map((card) => ({
      ...card,
      dBalance: Math.round((balances.get(card.nCardId) || 0) * 100) / 100,
    }));

    res.status(200).json({ ok: true, data });
  } catch (err) {
    sendError(res, err, "load cards");
  }
}

/** GET /api/cards/:id */
export async function getCard(req, res) {
  const userId = requireUser(req, res);
  if (userId === null) return;

  const id = parseId(req, res);
  if (id === null) return;

  try {
    /* Scoped to the caller: someone else's id reads as missing (404),
       not forbidden — never leak that the row exists. */
    const card = await cardModel.findById(id, userId);
    if (!card) {
      return res.status(404).json({ ok: false, message: "Card not found." });
    }
    res.status(200).json({ ok: true, data: card });
  } catch (err) {
    sendError(res, err, "load card");
  }
}

/** POST /api/cards — always created Pending (cStatus "P"). */
export async function createCard(req, res) {
  const userId = requireUser(req, res);
  if (userId === null) return;

  const { values, errors } = validate(req.body, { isNew: true });
  if (Object.keys(errors).length > 0) return sendValidation(res, errors);

  try {
    // Owner + status come from the server — a body-sent nUserId or
    // cStatus ("A"?) is ignored; every new card starts Pending.
    // createWithCode also stamps CRD-<id> (best effort) after the insert.
    const data = await cardModel.createWithCode({
      ...values,
      nUserId: userId,
      cStatus: PENDING_STATUS,
    });

    res.status(201).json({ ok: true, data });
  } catch (err) {
    sendError(res, err, "create card");
  }
}

/** PUT /api/cards/:id — partial update: only fields present in the body change.
 *  This is also the Activate (P -> A) and Complete (A -> C) button. */
export async function updateCard(req, res) {
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
    const card = await cardModel.update(id, values, userId);
    if (!card) {
      return res.status(404).json({ ok: false, message: "Card not found." });
    }
    res.status(200).json({ ok: true, data: card });
  } catch (err) {
    sendError(res, err, "update card");
  }
}

/** GET /api/cards/:id/transactions — the ledger rows charged to one card. */
export async function listCardTransactions(req, res) {
  const userId = requireUser(req, res);
  if (userId === null) return;

  const id = parseId(req, res);
  if (id === null) return;

  try {
    /* Ownership check — never leak another user's transactions. */
    const card = await cardModel.findById(id, userId);
    if (!card) {
      return res.status(404).json({ ok: false, message: "Card not found." });
    }

    const transactions = await transactionModel.findByCard(id, userId);
    res.status(200).json({ ok: true, data: transactions });
  } catch (err) {
    sendError(res, err, "load card transactions");
  }
}

/** DELETE /api/cards/:id */
export async function deleteCard(req, res) {
  const userId = requireUser(req, res);
  if (userId === null) return;

  const id = parseId(req, res);
  if (id === null) return;

  try {
    /* Ownership first — a foreign id reads as missing (404), never as
       a successful delete of someone else's row. */
    const card = await cardModel.findById(id, userId);
    if (!card) {
      return res.status(404).json({ ok: false, message: "Card not found." });
    }

    /* A card owns no entries or transactions (tblcards has no amount
       column), so there is nothing to cascade — same shape as savings
       minus the deposit cleanup. */
    const removed = await cardModel.remove(id, userId);
    if (!removed) {
      return res.status(404).json({ ok: false, message: "Card not found." });
    }
    res.status(200).json({ ok: true, message: "Card deleted." });
  } catch (err) {
    sendError(res, err, "delete card");
  }
}
