/* ------------------------------------------------------------------
   HTTP layer for /api/accounts (cash, bank, debit/credit cards,
   e-wallets). Validates input, calls account.model.js, shapes JSON.
   Every route resolves the signed-in caller's owner uuid first —
   401 without a session, and every query is scoped to their rows.
   ------------------------------------------------------------------ */

import * as accountModel from "../models/account.model.js";
import { getOwnerUuid } from "../utils/owner.js";
import { parseId, sendError, sendValidation, createValidator } from "../utils/finance.js";

const ACCOUNT_TYPES = ["CASH", "BANK", "DEBIT", "CREDIT", "EWALLET"];

/** 401 when there is no signed-in session; otherwise the owner uuid. */
async function requireOwner(req, res) {
  const ownerId = await getOwnerUuid(req);
  if (!ownerId) res.status(401).json({ ok: false, message: "Not signed in." });
  return ownerId;
}

function validate(body, { isNew = false } = {}) {
  const v = createValidator(body, { isNew });

  v.text("strName", "Account name", { required: true, max: 100 });
  v.oneOf("cAccountType", "Account type", ACCOUNT_TYPES, {
    required: true,
    fallback: "CASH",
  });
  v.text("strInstitution", "Institution", { max: 100 });
  v.text("strLast4", "Last 4 digits", { max: 4 });
  v.text("strCurrency", "Currency", { max: 3 });
  v.decimal("dOpeningBalance", "Opening balance", { min: -1_000_000_000, max: 1_000_000_000 });
  v.decimal("dCreditLimit", "Credit limit", { min: 0, max: 1_000_000_000 });
  v.integer("nStatementDay", "Statement day", { min: 1, max: 31 });
  v.integer("nDueDay", "Due day", { min: 1, max: 31 });
  v.bool("bIsActive", { fallback: true });

  /* Only credit cards can carry a credit limit (matches the DB check). */
  if (v.values.cAccountType && v.values.cAccountType !== "CREDIT") {
    v.values.dCreditLimit = null;
    v.values.nStatementDay = null;
    v.values.nDueDay = null;
  }

  return v;
}

/** GET /api/accounts */
export async function listAccounts(req, res) {
  const ownerId = await requireOwner(req, res);
  if (!ownerId) return;

  try {
    res.status(200).json({ ok: true, data: await accountModel.findAll(ownerId) });
  } catch (err) {
    sendError(res, err, "load accounts", "accounts");
  }
}

/** GET /api/accounts/balances — registered before /:id so it wins. */
export async function listBalances(req, res) {
  const ownerId = await requireOwner(req, res);
  if (!ownerId) return;

  try {
    res.status(200).json({ ok: true, data: await accountModel.findBalances(ownerId) });
  } catch (err) {
    sendError(res, err, "load account balances", "accounts");
  }
}

/** GET /api/accounts/:id */
export async function getAccount(req, res) {
  const id = parseId(req, res, "account");
  if (id === null) return;
  const ownerId = await requireOwner(req, res);
  if (!ownerId) return;

  try {
    const account = await accountModel.findById(id, ownerId);
    if (!account) return res.status(404).json({ ok: false, message: "Account not found." });
    res.status(200).json({ ok: true, data: account });
  } catch (err) {
    sendError(res, err, "load account", "accounts");
  }
}

/** POST /api/accounts */
export async function createAccount(req, res) {
  const ownerId = await requireOwner(req, res);
  if (!ownerId) return;

  const v = validate(req.body, { isNew: true });
  if (Object.keys(v.errors).length > 0) return sendValidation(res, v.errors);

  try {
    const account = await accountModel.create(v.values, ownerId);
    res.status(201).json({ ok: true, data: account });
  } catch (err) {
    sendError(res, err, "create account", "accounts");
  }
}

/** PUT /api/accounts/:id — partial update. */
export async function updateAccount(req, res) {
  const id = parseId(req, res, "account");
  if (id === null) return;
  const ownerId = await requireOwner(req, res);
  if (!ownerId) return;

  const v = validate(req.body, { isNew: false });
  if (Object.keys(v.errors).length > 0) return sendValidation(res, v.errors);
  if (Object.keys(v.values).length === 0) {
    return res.status(400).json({ ok: false, message: "No fields to update." });
  }

  try {
    const account = await accountModel.update(id, ownerId, v.values);
    if (!account) return res.status(404).json({ ok: false, message: "Account not found." });
    res.status(200).json({ ok: true, data: account });
  } catch (err) {
    sendError(res, err, "update account", "accounts");
  }
}

/** DELETE /api/accounts/:id */
export async function deleteAccount(req, res) {
  const id = parseId(req, res, "account");
  if (id === null) return;
  const ownerId = await requireOwner(req, res);
  if (!ownerId) return;

  try {
    const removed = await accountModel.remove(id, ownerId);
    if (!removed) return res.status(404).json({ ok: false, message: "Account not found." });
    res.status(200).json({ ok: true, message: "Account deleted." });
  } catch (err) {
    /* tblledger references accounts with ON DELETE restrict — explain it. */
    if (err?.code === "23503") {
      return res.status(409).json({
        ok: false,
        message: "This account has ledger entries. Delete or re-link those entries first.",
      });
    }
    sendError(res, err, "delete account", "accounts");
  }
}
