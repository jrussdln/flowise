/* ------------------------------------------------------------------
   HTTP layer for /api/savings (savings goals). Validates input, calls
   savings.model.js, shapes JSON. Every route resolves the signed-in
   caller's owner uuid first — 401 without a session, and every query
   is scoped to them.
   ------------------------------------------------------------------ */

import * as savingsModel from "../models/savings.model.js";
import { getOwnerUuid } from "../utils/owner.js";
import { parseId, sendError, sendValidation, createValidator } from "../utils/finance.js";

const STATUSES = ["ACTIVE", "REACHED", "CLOSED"];

async function requireOwner(req, res) {
  const ownerId = await getOwnerUuid(req);
  if (!ownerId) res.status(401).json({ ok: false, message: "Not signed in." });
  return ownerId;
}

function validate(body, { isNew = false } = {}) {
  const v = createValidator(body, { isNew });

  v.text("strName", "Goal name", { required: true, max: 150 });
  v.decimal("dTargetAmount", "Target amount", { min: 0.01, max: 1_000_000_000 });
  v.date("dTargetDate", "Target date");
  v.oneOf("cStatus", "Status", STATUSES, { required: true, fallback: "ACTIVE" });
  v.text("strNotes", "Notes", { max: 500 });

  return v;
}

/** GET /api/savings */
export async function listSavings(req, res) {
  const ownerId = await requireOwner(req, res);
  if (!ownerId) return;

  try {
    res.status(200).json({ ok: true, data: await savingsModel.findAll(ownerId) });
  } catch (err) {
    sendError(res, err, "load savings goals", "savings");
  }
}

/** GET /api/savings/:id */
export async function getSavings(req, res) {
  const id = parseId(req, res, "savings goal");
  if (id === null) return;
  const ownerId = await requireOwner(req, res);
  if (!ownerId) return;

  try {
    const goal = await savingsModel.findById(id, ownerId);
    if (!goal) return res.status(404).json({ ok: false, message: "Savings goal not found." });
    res.status(200).json({ ok: true, data: goal });
  } catch (err) {
    sendError(res, err, "load savings goal", "savings");
  }
}

/** POST /api/savings */
export async function createSavings(req, res) {
  const ownerId = await requireOwner(req, res);
  if (!ownerId) return;

  const v = validate(req.body, { isNew: true });
  if (Object.keys(v.errors).length > 0) return sendValidation(res, v.errors);

  try {
    const goal = await savingsModel.create(v.values, ownerId);
    res.status(201).json({ ok: true, data: goal });
  } catch (err) {
    sendError(res, err, "create savings goal", "savings");
  }
}

/** PUT /api/savings/:id — partial update. */
export async function updateSavings(req, res) {
  const id = parseId(req, res, "savings goal");
  if (id === null) return;
  const ownerId = await requireOwner(req, res);
  if (!ownerId) return;

  const v = validate(req.body, { isNew: false });
  if (Object.keys(v.errors).length > 0) return sendValidation(res, v.errors);
  if (Object.keys(v.values).length === 0) {
    return res.status(400).json({ ok: false, message: "No fields to update." });
  }

  try {
    const goal = await savingsModel.update(id, ownerId, v.values);
    if (!goal) return res.status(404).json({ ok: false, message: "Savings goal not found." });
    res.status(200).json({ ok: true, data: goal });
  } catch (err) {
    sendError(res, err, "update savings goal", "savings");
  }
}

/** DELETE /api/savings/:id */
export async function deleteSavings(req, res) {
  const id = parseId(req, res, "savings goal");
  if (id === null) return;
  const ownerId = await requireOwner(req, res);
  if (!ownerId) return;

  try {
    const removed = await savingsModel.remove(id, ownerId);
    if (!removed) return res.status(404).json({ ok: false, message: "Savings goal not found." });
    res.status(200).json({ ok: true, message: "Savings goal deleted." });
  } catch (err) {
    if (err?.code === "23503") {
      return res.status(409).json({
        ok: false,
        message: "This goal has ledger entries. Delete or re-link those entries first.",
      });
    }
    sendError(res, err, "delete savings goal", "savings");
  }
}
