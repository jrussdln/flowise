/* ------------------------------------------------------------------
   HTTP layer for /api/savings — the Savings tab (tblsavings).

   Validates input, calls server/models/saving.model.js, and shapes the
   JSON responses. Mounted by server/routes/saving.route.js (Express)
   and re-used by api/savings*.js (Vercel serverless), so behaviour is
   identical in development and production.

   Response shapes:
     success -> { ok: true,  data }  or  { ok: true, message }
     failure -> { ok: false, message, errors? , debug? }

   AUTH: every endpoint requires a signed-in session (401 otherwise) and
   only ever reads/writes rows whose `nUserId` matches the session user,
   so each user sees exactly their own savings.

   LIFECYCLE (mirrors loans, minus the schedule — activation itself
   builds nothing, but deposits arrive later):
     a new saving is always created Pending (cStatus "P"); the UI's
     Activate button sends PUT { cStatus: "A" }, and its Complete button
     sends PUT { cStatus: "C" }. Deposits are added from the card's
     View dialog (POST /api/entries, cType "S") and each one writes a
     Savings row in tbltransactions. Deleting the saving takes its
     deposits — and those transactions — with it.

   SERVER-OWNED FIELDS (never read from a request body):
     nSavingId   identity primary key
     nUserId     stamped from the session cookie on create
     dttCreated  set on insert
     strCode     auto-generated as SAV-<id> after insert (derived from
                 the identity so codes never collide, even after deletions)
     cStatus     forced to "P" on create; only P/A/C accepted on update

    USER-OWNED, COSMETIC (validated in utils/cardMeta.js):
      strColor     accent colour painted on the card (nullable hex)
      bIsFavorite  pins the card to the top of the grid (nullable bool)
   ------------------------------------------------------------------ */

import * as savingModel from "../models/saving.model.js";
import * as entryModel from "../models/entry.model.js";
import * as transactionModel from "../models/transaction.model.js";
import { getSessionUserId } from "../utils/session.js";
import { toTransactionId } from "../utils/schedule.js";
import { applyCardMeta } from "../utils/cardMeta.js";

const TITLE_MAX = 200;
const DESCRIPTION_MAX = 1000;
const VALID_STATUSES = ["P", "A", "C"]; // P = Pending, A = Active, C = Completed
const PENDING_STATUS = "P"; // every new saving starts Pending
/* Deposits live in tblentries as cType "S" (created by the entries
   controller together with their tbltransactions row). */
const ENTRY_TYPE_SAVINGS = "S";

/** Reads and validates :id. Sends a 400 and returns null when invalid. */
function parseId(req, res) {
  // Express puts :id in req.params; Vercel serverless puts it in req.query.
  const raw = req.params?.id ?? req.query?.id;
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ ok: false, message: "Invalid saving id." });
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

  /* strColor / bIsFavorite — the cosmetic columns this controller
     shares with loan.controller.js (see utils/cardMeta.js). */
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

/** Maps model/Supabase errors to an HTTP response (mirrors loan.controller.js). */
function sendError(res, err, action) {
  if (err?.code === "23505") {
    return res.status(409).json({
      ok: false,
      message: "That record conflicts with an existing saving.",
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
  console.error(`[savings] failed to ${action}:`, err?.message || err);

  res.status(status).json({
    ok: false,
    message: status === 500 ? "Unexpected server error." : err?.message || "Request failed.",
    ...(status === 500 && process.env.NODE_ENV !== "production"
      ? { debug: err?.message }
      : {}),
  });
}

/** GET /api/savings — the signed-in user's rows only. Each saving carries
 *  dBalance, the sum of its deposits, so the card can show what it holds
 *  without an extra entries request per card. */
export async function listSavings(req, res) {
  const userId = requireUser(req, res);
  if (userId === null) return;

  try {
    const savings = await savingModel.findAllForUser(userId);

    // One entries query for every saving, aggregated by reference id.
    const entries = await entryModel.findByReferences(
      ENTRY_TYPE_SAVINGS,
      savings.map((s) => s.nSavingId)
    );
    const agg = new Map(); // nSavingId -> { total, count }
    for (const e of entries) {
      const a = agg.get(e.nReferenceId) || { total: 0, count: 0 };
      a.total += Number(e.dAmount) || 0;
      a.count += 1;
      agg.set(e.nReferenceId, a);
    }

    /* dBalance = the card's balance and the Total Saved KPI;
       nDeposits = the Deposits Made KPI (and its average). */
    const data = savings.map((s) => {
      const a = agg.get(s.nSavingId) || { total: 0, count: 0 };
      return {
        ...s,
        dBalance: Math.round(a.total * 100) / 100,
        nDeposits: a.count,
      };
    });

    res.status(200).json({ ok: true, data });
  } catch (err) {
    sendError(res, err, "load savings");
  }
}

/** GET /api/savings/:id */
export async function getSaving(req, res) {
  const userId = requireUser(req, res);
  if (userId === null) return;

  const id = parseId(req, res);
  if (id === null) return;

  try {
    /* Scoped to the caller: someone else's id reads as missing (404),
       not forbidden — never leak that the row exists. */
    const saving = await savingModel.findById(id, userId);
    if (!saving) {
      return res.status(404).json({ ok: false, message: "Saving not found." });
    }
    res.status(200).json({ ok: true, data: saving });
  } catch (err) {
    sendError(res, err, "load saving");
  }
}

/** POST /api/savings — always created Pending (cStatus "P"). */
export async function createSaving(req, res) {
  const userId = requireUser(req, res);
  if (userId === null) return;

  const { values, errors } = validate(req.body, { isNew: true });
  if (Object.keys(errors).length > 0) return sendValidation(res, errors);

  try {
    // Owner + status come from the server — a body-sent nUserId or
    // cStatus ("A"?) is ignored; every new saving starts Pending.
    // createWithCode also stamps SAV-<id> (best effort) after the insert.
    const data = await savingModel.createWithCode({
      ...values,
      nUserId: userId,
      cStatus: PENDING_STATUS,
    });

    res.status(201).json({ ok: true, data });
  } catch (err) {
    sendError(res, err, "create saving");
  }
}

/** PUT /api/savings/:id — partial update: only fields present in the body change.
 *  This is also the Activate (P -> A) and Complete (A -> C) button. */
export async function updateSaving(req, res) {
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
    const saving = await savingModel.update(id, values, userId);
    if (!saving) {
      return res.status(404).json({ ok: false, message: "Saving not found." });
    }
    res.status(200).json({ ok: true, data: saving });
  } catch (err) {
    sendError(res, err, "update saving");
  }
}

/** DELETE /api/savings/:id */
export async function deleteSaving(req, res) {
  const userId = requireUser(req, res);
  if (userId === null) return;

  const id = parseId(req, res);
  if (id === null) return;

  try {
    /* Ownership first — a foreign id reads as missing (404), never as
       a successful delete of someone else's row. */
    const saving = await savingModel.findById(id, userId);
    if (!saving) {
      return res.status(404).json({ ok: false, message: "Saving not found." });
    }

    /* Deposits describe this saving only, so they go with it — together
       with the Savings transactions they generated (no orphans, same
       rule the loans controller applies to a payment schedule). */
    const deposits = await clearDeposits(saving.nSavingId);
    await removeSavingsTransactions(deposits, userId);

    const removed = await savingModel.remove(id, userId);
    if (!removed) {
      return res.status(404).json({ ok: false, message: "Saving not found." });
    }
    res.status(200).json({ ok: true, message: "Saving deleted." });
  } catch (err) {
    sendError(res, err, "delete saving");
  }
}

/** Removes a saving's deposits (tblentries, cType "S"). */
async function clearDeposits(nSavingId) {
  return entryModel.removeByReference(ENTRY_TYPE_SAVINGS, nSavingId);
}

/** Best effort: drops the tbltransactions rows linked to `rows`. */
async function removeSavingsTransactions(rows, userId) {
  const ids = (rows ?? [])
    .map((row) => toTransactionId(row.nTransactionId))
    .filter((id) => id !== null);
  if (ids.length === 0) return;

  try {
    await transactionModel.removeMany(ids, userId);
  } catch (err) {
    console.warn("[savings] could not remove deposit transactions:", err?.message || err);
  }
}
