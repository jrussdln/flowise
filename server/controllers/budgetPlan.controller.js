/* ------------------------------------------------------------------
   HTTP layer for /api/budget-plans — the Budget Plans page
   (tblbudgetplan).

   Validates input, calls server/models/budgetPlan.model.js, and shapes the
   JSON responses. Mounted by server/routes/budgetPlans.route.js (Express)
   and re-used by api/index.js (Vercel serverless), so behaviour is
   identical in development and production.

   Response shapes:
     success -> { ok: true,  data }  or  { ok: true, message }
     failure -> { ok: false, message, errors? , debug? }

   AUTH: every endpoint requires a signed-in session (401 otherwise) and
   only ever reads/writes rows whose `nUserId` matches the session user,
   so each user sees exactly their own budget plans.

   LIFECYCLE (mirrors savings, minus the money and the finish line): a
   new plan is always created Pending (cStatus "P"); the card's
   Activate button sends PUT { cStatus: "A" }, and its Deactivate button
   sends it back to "P". A plan is never Completed — it is a plan, not a
   loan: it holds no amount, has no entries, and never writes a row to
   tbltransactions.

   SERVER-OWNED FIELDS (never read from a request body):
     nBudgetPlanId  identity primary key
     nUserId        stamped from the session cookie on create
     dttCreated     set on insert
     strCode        auto-generated as BUD-<id> after insert (derived from
                    the identity so codes never collide, even after
                    deletions)
     cStatus        forced to "P" on create; only P/A/C accepted on update

   USER-OWNED:
     strTitle / strDescription  the plan's name and notes
     dBudgetAmount             what the plan is budgeted for (optional;
                               null when the plan has no fixed amount)

   USER-OWNED, COSMETIC (validated in utils/cardMeta.js):
     strColor     accent colour painted on the card (nullable hex/code)
     bIsFavorite  pins the card to the top of the grid (nullable bool)
   ------------------------------------------------------------------ */

import * as budgetPlanModel from "../models/budgetPlan.model.js";
import * as entryModel from "../models/entry.model.js";
import * as transactionModel from "../models/transaction.model.js";
import * as cardModel from "../models/card.model.js";
import { getSessionUserId } from "../utils/session.js";
import { applyCardMeta } from "../utils/cardMeta.js";
import { budgetPlanTransaction, toTransactionId } from "../utils/schedule.js";

const TITLE_MAX = 200;
const DESCRIPTION_MAX = 1000;
/* The plan's budget amount (dBudgetAmount) — optional, so no cap; the
   only rule is that it may not be negative. */
const VALID_STATUSES = ["P", "A", "C"]; // P = Pending, A = Active, C = Used (completed)
const ACTIVE_STATUS = "A"; // every new plan starts Active
const USED_STATUS = "C"; // the plan has been used — its entries are posted
/* cStatus of a plan entry: "P" while the entry is still a plan, "A"
   once the plan is used and the entry became an expense in the
   ledger (the savings-deposit convention). */
const ENTRY_STATUS_PLAN = "P";
const ENTRY_STATUS_POSTED = "A";

/** Reads and validates :id. Sends a 400 and returns null when invalid. */
function parseId(req, res) {
  // Express puts :id in req.params; Vercel serverless puts it in req.query.
  const raw = req.params?.id ?? req.query?.id;
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ ok: false, message: "Invalid budget plan id." });
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

  /* dBudgetAmount — what the plan is budgeted for. Optional: an empty
     value clears it (null), a number must be zero or more. */
  if (isNew || has("dBudgetAmount")) {
    const raw = body.dBudgetAmount;
    const amount =
      raw === null || raw === undefined || raw === ""
        ? null
        : typeof raw === "number"
          ? raw
          : typeof raw === "string" && raw.trim() !== ""
            ? Number(raw)
            : NaN;
    if (amount !== null && (!Number.isFinite(amount) || amount < 0)) {
      errors.dBudgetAmount = "Budget amount must be zero or more.";
    } else {
      values.dBudgetAmount = amount;
    }
  }

  /* cStatus is server-owned on create (forced to Pending) — only an
     update may change it, and only between the two known states. */
  if (!isNew && has("cStatus")) {
    const status = str(body.cStatus);
    if (!VALID_STATUSES.includes(status)) {
      errors.cStatus = "Status must be Pending or Active.";
    } else {
      values.cStatus = status;
    }
  }

  /* strColor / bIsFavorite — the cosmetic columns this controller
     shares with loan.controller.js and saving.controller.js (see
     utils/cardMeta.js). */
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
      message: "That record conflicts with an existing budget plan.",
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
  console.error(`[budget-plans] failed to ${action}:`, err?.message || err);

  res.status(status).json({
    ok: false,
    message: status === 500 ? "Unexpected server error." : err?.message || "Request failed.",
    ...(status === 500 && process.env.NODE_ENV !== "production"
      ? { debug: err?.message }
      : {}),
  });
}

/** GET /api/budget-plans — the signed-in user's rows only. Each plan
 *  carries dTotal, the sum of its entries (tblentries, cType "B"), and
 *  nEntries, how many there are — so the card can show what the plan
 *  adds up to without an extra entries request per card. */
export async function listBudgetPlans(req, res) {
  const userId = requireUser(req, res);
  if (userId === null) return;

  try {
    const plans = await budgetPlanModel.findAllForUser(userId);

    // One entries query for every plan, aggregated by reference id.
    const entries = await entryModel.findByReferences(
      "B",
      plans.map((p) => p.nBudgetPlanId)
    );
    const agg = new Map(); // nBudgetPlanId -> { total, count }
    for (const e of entries) {
      const a = agg.get(e.nReferenceId) || { total: 0, count: 0 };
      a.total += Number(e.dAmount) || 0;
      a.count += 1;
      agg.set(e.nReferenceId, a);
    }

    /* dTotal = what the plan adds up to; nEntries = how many line items
       it holds. Both are derived here, never stored. */
    const data = plans.map((p) => {
      const a = agg.get(p.nBudgetPlanId) || { total: 0, count: 0 };
      return {
        ...p,
        dTotal: Math.round(a.total * 100) / 100,
        nEntries: a.count,
      };
    });

    res.status(200).json({ ok: true, data });
  } catch (err) {
    sendError(res, err, "load budget plans");
  }
}

/** GET /api/budget-plans/:id */
export async function getBudgetPlan(req, res) {
  const userId = requireUser(req, res);
  if (userId === null) return;

  const id = parseId(req, res);
  if (id === null) return;

  try {
    /* Scoped to the caller: someone else's id reads as missing (404),
       not forbidden — never leak that the row exists. */
    const plan = await budgetPlanModel.findById(id, userId);
    if (!plan) {
      return res.status(404).json({ ok: false, message: "Budget plan not found." });
    }
    res.status(200).json({ ok: true, data: plan });
  } catch (err) {
    sendError(res, err, "load budget plan");
  }
}

/** POST /api/budget-plans — always created Active (cStatus "A"). */
export async function createBudgetPlan(req, res) {
  const userId = requireUser(req, res);
  if (userId === null) return;

  const { values, errors } = validate(req.body, { isNew: true });
  if (Object.keys(errors).length > 0) return sendValidation(res, errors);

  try {
    // Owner + status come from the server — a body-sent nUserId or
    // cStatus is ignored; every new plan starts Active, ready for its
    // entries. createWithCode also stamps BUD-<id> (best effort) after
    // the insert.
    const data = await budgetPlanModel.createWithCode({
      ...values,
      nUserId: userId,
      cStatus: ACTIVE_STATUS,
    });

    res.status(201).json({ ok: true, data });
  } catch (err) {
    sendError(res, err, "create budget plan");
  }
}

/** PUT /api/budget-plans/:id — partial update: only fields present in the
 *  body change. This is also the **Used Plan** (A -> C) and **Activate**
 *  (C -> A) button — both move the plan's entries in and out of the
 *  ledger (see postPlanEntries / unpostPlanEntries). */
export async function updateBudgetPlan(req, res) {
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
    /* The plan as it stands BEFORE the write — the status sync below
       needs to know where the plan came from. */
    const before = await budgetPlanModel.findById(id, userId);
    if (!before) {
      return res.status(404).json({ ok: false, message: "Budget plan not found." });
    }

    /* The debit card funding the plan is checked BEFORE anything is
       written — a rejected card must not leave the plan half-used. */
    let fundingCard = null;
    if (values.cStatus === USED_STATUS && values.cStatus !== before.cStatus) {
      const card = await fundingCardOf(req, res, userId);
      if (card === undefined) return;
      fundingCard = card;
    }

    const plan = await budgetPlanModel.update(id, values, userId);
    if (!plan) {
      return res.status(404).json({ ok: false, message: "Budget plan not found." });
    }

    /* A status change moves the plan's entries in and out of the
       ledger: USED (C) posts every entry as an expense, going back to
       Active (A) takes those expenses out again. The optional nCardId
       names the debit card the plan is paid from — its balance takes
       the deduction. */
    if (values.cStatus && values.cStatus !== before.cStatus) {
      if (values.cStatus === USED_STATUS) {
        await postPlanEntries(plan, userId, fundingCard?.nCardId ?? null);
      } else if (before.cStatus === USED_STATUS) {
        await unpostPlanEntries(plan, userId);
      }
    }

    res.status(200).json({ ok: true, data: plan });
  } catch (err) {
    sendError(res, err, "update budget plan");
  }
}

/**
 * Reads body `nCardId` — the DEBIT card funding the plan. Returns null
 * when none was sent; sends 400 (and returns undefined) on a malformed
 * id or a card that is not debit — only debit cards hold money, so
 * only they may fund a plan.
 */
async function fundingCardOf(req, res, userId) {
  const raw = req.body?.nCardId;
  if (raw === null || raw === undefined || raw === "") return null;

  const nCardId = Number(raw);
  if (!Number.isInteger(nCardId) || nCardId <= 0) {
    res.status(400).json({ ok: false, message: "Invalid card id." });
    return undefined;
  }

  const card = await cardModel.findById(nCardId, userId);
  if (!card) {
    res.status(400).json({ ok: false, message: "That card was not found among your cards." });
    return undefined;
  }
  if (card.cType !== "D") {
    res.status(400).json({
      ok: false,
      message: "A budget plan can only be paid from a debit card.",
    });
    return undefined;
  }
  return card;
}

/**
 * Posts a plan's entries to the ledger — what "Used Plan" does: every
 * line item becomes an EXPENSE row in tbltransactions, linked from its
 * entry through nTransactionId.
 *
 * `nCardId` is the debit card the plan was paid from (null when it came
 * out of the current balance): the expense rows then carry the card
 * link, so that card's balance takes the deduction — the same rule the
 * savings deposit and the loan installment follow.
 *
 * An entry that already carries a link is left alone, so using a plan
 * twice never writes the same expense twice.
 */
async function postPlanEntries(plan, userId, nCardId = null) {
  const entries = await entryModel.findByReference("B", plan.nBudgetPlanId);

  for (const entry of entries) {
    if (entry.nTransactionId) continue; // already posted

    const txn = await transactionModel.createWithCode({
      ...budgetPlanTransaction({ plan, entry }),
      ...(nCardId ? { nCardId } : {}),
      nUserId: userId,
    });

    /* The entry now points at the expense it became. */
    await entryModel.setStatus(entry.nEntriesId, ENTRY_STATUS_POSTED, txn.nTransactionId);
  }
}

/**
 * Takes a used plan's expenses back out of the ledger — what going back
 * to Active does: the transaction rows go, the entries drop their link
 * and return to their planning state ("P").
 */
async function unpostPlanEntries(plan, userId) {
  const entries = await entryModel.findByReference("B", plan.nBudgetPlanId);
  const ids = entries
    .map((entry) => toTransactionId(entry.nTransactionId))
    .filter((id) => id !== null);

  if (ids.length > 0) {
    await transactionModel.removeMany(ids, userId);
  }

  for (const entry of entries) {
    await entryModel.setStatus(entry.nEntriesId, ENTRY_STATUS_PLAN, null);
  }
}

/** DELETE /api/budget-plans/:id — a plan owns nothing else, so the row
 *  simply goes (no entries, no transactions to clean up). */
export async function deleteBudgetPlan(req, res) {
  const userId = requireUser(req, res);
  if (userId === null) return;

  const id = parseId(req, res);
  if (id === null) return;

  try {
    /* Ownership first — a foreign id reads as missing (404), never as
       a successful delete of someone else's row. */
    const plan = await budgetPlanModel.findById(id, userId);
    if (!plan) {
      return res.status(404).json({ ok: false, message: "Budget plan not found." });
    }

    /* The plan's line items describe this plan only, so they go with it
       — and so do the expense rows a used plan wrote into the ledger
       (the same cleanup rule the savings controller applies to a
       fund's deposits). */
    const entries = await entryModel.findByReference("B", plan.nBudgetPlanId);
    const txnIds = entries
      .map((entry) => toTransactionId(entry.nTransactionId))
      .filter((txnId) => txnId !== null);
    if (txnIds.length > 0) {
      await transactionModel.removeMany(txnIds, userId);
    }
    await entryModel.removeByReference("B", plan.nBudgetPlanId);

    const removed = await budgetPlanModel.remove(id, userId);
    if (!removed) {
      return res.status(404).json({ ok: false, message: "Budget plan not found." });
    }
    res.status(200).json({ ok: true, message: "Budget plan deleted." });
  } catch (err) {
    sendError(res, err, "delete budget plan");
  }
}
