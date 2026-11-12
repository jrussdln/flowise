/* ------------------------------------------------------------------
   HTTP layer for /api/ledger (every money movement: IN / OUT / TRF).

   Extra rules enforced here before the DB constraints do:
     • the source account must belong to the signed-in caller
     • TRF needs a destination account that differs from the source;
       non-transfers must not carry one
     • an entry may link to a loan OR a savings goal, never both
   ------------------------------------------------------------------ */

import * as ledgerModel from "../models/ledger.model.js";
import * as accountModel from "../models/account.model.js";
import { getOwnerUuid } from "../utils/owner.js";
import { parseId, sendError, sendValidation, createValidator } from "../utils/finance.js";

const TYPES = ["IN", "OUT", "TRF"];
const STATUSES = ["PENDING", "POSTED", "VOID"];

async function requireOwner(req, res) {
  const ownerId = await getOwnerUuid(req);
  if (!ownerId) res.status(401).json({ ok: false, message: "Not signed in." });
  return ownerId;
}

function validate(body, { isNew = false } = {}) {
  const v = createValidator(body, { isNew });

  v.text("strCode", "Reference code", { max: 50 });
  v.text("strTitle", "Title", { required: true, max: 150 });
  v.text("strDescription", "Description", { max: 500 });
  v.text("strMerchant", "Merchant", { max: 150 });
  v.text("strReference", "Reference no.", { max: 100 });
  v.decimal("dAmount", "Amount", { required: true, min: 0.01, max: 1_000_000_000 });
  v.decimal("dFee", "Fee", { min: 0, max: 1_000_000 });
  v.text("strCurrency", "Currency", { max: 3 });
  v.oneOf("cType", "Type", TYPES, { required: true, fallback: "OUT" });
  v.integer("nAccountId", "Account", { required: true });
  v.integer("nToAccountId", "Destination account");
  v.integer("nCategoryId", "Category");
  v.integer("nLoanId", "Loan");
  v.integer("nSavingsId", "Savings goal");
  v.date("dTransactionDate", "Transaction date");
  v.oneOf("cStatus", "Status", STATUSES, { required: true, fallback: "POSTED" });
  v.bool("bIsRecurring", { fallback: false });
  v.text("strNotes", "Notes", { max: 500 });

  /* Non-transfers never carry a destination account. */
  if (v.values.cType && v.values.cType !== "TRF") {
    v.values.nToAccountId = null;
  }

  /* An entry belongs to a loan OR a savings goal, never both. */
  if (v.values.nLoanId != null && v.values.nSavingsId != null) {
    v.errors.nSavingsId = "Link to a loan or a savings goal, not both.";
  }

  return v;
}

/** Checks the source (and destination, for TRF) accounts are the caller's. */
async function checkAccounts(ownerId, values, res) {
  const ids = [values.nAccountId, values.nToAccountId].filter((n) => n != null);
  for (const id of ids) {
    const account = await accountModel.findById(id, ownerId);
    if (!account) {
      res.status(400).json({ ok: false, message: "One of the selected accounts is unknown." });
      return false;
    }
  }
  if (
    values.cType === "TRF" &&
    values.nAccountId != null &&
    values.nToAccountId === values.nAccountId
  ) {
    res
      .status(400)
      .json({ ok: false, message: "A transfer needs a different destination account." });
    return false;
  }
  return true;
}

/** GET /api/ledger */
export async function listLedger(req, res) {
  const ownerId = await requireOwner(req, res);
  if (!ownerId) return;

  try {
    res.status(200).json({ ok: true, data: await ledgerModel.findAll(ownerId) });
  } catch (err) {
    sendError(res, err, "load ledger", "ledger");
  }
}

/** GET /api/ledger/:id */
export async function getEntry(req, res) {
  const id = parseId(req, res, "ledger");
  if (id === null) return;
  const ownerId = await requireOwner(req, res);
  if (!ownerId) return;

  try {
    const entry = await ledgerModel.findById(id, ownerId);
    if (!entry) return res.status(404).json({ ok: false, message: "Ledger entry not found." });
    res.status(200).json({ ok: true, data: entry });
  } catch (err) {
    sendError(res, err, "load ledger entry", "ledger");
  }
}

/** POST /api/ledger */
export async function createEntry(req, res) {
  const ownerId = await requireOwner(req, res);
  if (!ownerId) return;

  const v = validate(req.body, { isNew: true });
  if (Object.keys(v.errors).length > 0) return sendValidation(res, v.errors);
  if (!(await checkAccounts(ownerId, v.values, res))) return;

  try {
    const entry = await ledgerModel.create(v.values, ownerId);
    res.status(201).json({ ok: true, data: entry });
  } catch (err) {
    sendError(res, err, "create ledger entry", "ledger");
  }
}

/** PUT /api/ledger/:id — partial update. */
export async function updateEntry(req, res) {
  const id = parseId(req, res, "ledger");
  if (id === null) return;
  const ownerId = await requireOwner(req, res);
  if (!ownerId) return;

  const v = validate(req.body, { isNew: false });
  if (Object.keys(v.errors).length > 0) return sendValidation(res, v.errors);
  if (Object.keys(v.values).length === 0) {
    return res.status(400).json({ ok: false, message: "No fields to update." });
  }

  /* On update the type may not be in the payload — fall back to the
     stored row when deciding whether the destination stays nullable. */
  try {
    let effective = v.values;
    if (!Object.hasOwn(v.values, "cType")) {
      const current = await ledgerModel.findById(id, ownerId);
      if (!current) return res.status(404).json({ ok: false, message: "Ledger entry not found." });
      effective = { ...v.values, cType: current.cType };
    }
    if (effective.cType !== "TRF") effective.nToAccountId = null;
    if (!(await checkAccounts(ownerId, effective, res))) return;

    const entry = await ledgerModel.update(id, ownerId, effective);
    if (!entry) return res.status(404).json({ ok: false, message: "Ledger entry not found." });
    res.status(200).json({ ok: true, data: entry });
  } catch (err) {
    sendError(res, err, "update ledger entry", "ledger");
  }
}

/** DELETE /api/ledger/:id */
export async function deleteEntry(req, res) {
  const id = parseId(req, res, "ledger");
  if (id === null) return;
  const ownerId = await requireOwner(req, res);
  if (!ownerId) return;

  try {
    const removed = await ledgerModel.remove(id, ownerId);
    if (!removed) return res.status(404).json({ ok: false, message: "Ledger entry not found." });
    res.status(200).json({ ok: true, message: "Ledger entry deleted." });
  } catch (err) {
    sendError(res, err, "delete ledger entry", "ledger");
  }
}
