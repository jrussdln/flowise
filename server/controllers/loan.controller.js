/* ------------------------------------------------------------------
   HTTP layer for /api/loans. Validates input, calls loan.model.js,
   shapes JSON. Every route resolves the signed-in caller's owner uuid
   first — 401 without a session, and every query is scoped to them.
   ------------------------------------------------------------------ */

import * as loanModel from "../models/loan.model.js";
import { getOwnerUuid } from "../utils/owner.js";
import { parseId, sendError, sendValidation, createValidator } from "../utils/finance.js";

const STATUSES = ["ACTIVE", "PAID", "DEFAULTED"];

async function requireOwner(req, res) {
  const ownerId = await getOwnerUuid(req);
  if (!ownerId) res.status(401).json({ ok: false, message: "Not signed in." });
  return ownerId;
}

function validate(body, { isNew = false } = {}) {
  const v = createValidator(body, { isNew });

  v.text("strName", "Loan name", { required: true, max: 150 });
  v.text("strLender", "Lender", { max: 150 });
  v.decimal("dPrincipal", "Principal", { required: true, min: 0.01, max: 1_000_000_000 });
  v.decimal("dInterestRate", "Interest rate", { min: 0, max: 1000 });
  v.integer("nTermMonths", "Term", { min: 1, max: 1200 });
  v.decimal("dMonthlyPayment", "Monthly payment", { min: 0, max: 1_000_000_000 });
  v.date("dStartDate", "Start date", { required: true });
  v.integer("nPaymentDay", "Payment day", { min: 1, max: 31 });
  v.oneOf("cStatus", "Status", STATUSES, { required: true, fallback: "ACTIVE" });
  v.text("strNotes", "Notes", { max: 500 });
  /* Optional link to a Loan-type account on the Accounts page. */
  v.integer("nAccountId", "Account", { min: 1 });

  return v;
}

/** GET /api/loans */
export async function listLoans(req, res) {
  const ownerId = await requireOwner(req, res);
  if (!ownerId) return;

  try {
    res.status(200).json({ ok: true, data: await loanModel.findAll(ownerId) });
  } catch (err) {
    sendError(res, err, "load loans", "loans");
  }
}

/** GET /api/loans/:id */
export async function getLoan(req, res) {
  const id = parseId(req, res, "loan");
  if (id === null) return;
  const ownerId = await requireOwner(req, res);
  if (!ownerId) return;

  try {
    const loan = await loanModel.findById(id, ownerId);
    if (!loan) return res.status(404).json({ ok: false, message: "Loan not found." });
    res.status(200).json({ ok: true, data: loan });
  } catch (err) {
    sendError(res, err, "load loan", "loans");
  }
}

/** POST /api/loans */
export async function createLoan(req, res) {
  const ownerId = await requireOwner(req, res);
  if (!ownerId) return;

  const v = validate(req.body, { isNew: true });
  if (Object.keys(v.errors).length > 0) return sendValidation(res, v.errors);

  try {
    const loan = await loanModel.create(v.values, ownerId);
    res.status(201).json({ ok: true, data: loan });
  } catch (err) {
    sendError(res, err, "create loan", "loans");
  }
}

/** PUT /api/loans/:id — partial update. */
export async function updateLoan(req, res) {
  const id = parseId(req, res, "loan");
  if (id === null) return;
  const ownerId = await requireOwner(req, res);
  if (!ownerId) return;

  const v = validate(req.body, { isNew: false });
  if (Object.keys(v.errors).length > 0) return sendValidation(res, v.errors);
  if (Object.keys(v.values).length === 0) {
    return res.status(400).json({ ok: false, message: "No fields to update." });
  }

  try {
    const loan = await loanModel.update(id, ownerId, v.values);
    if (!loan) return res.status(404).json({ ok: false, message: "Loan not found." });
    res.status(200).json({ ok: true, data: loan });
  } catch (err) {
    sendError(res, err, "update loan", "loans");
  }
}

/** DELETE /api/loans/:id */
export async function deleteLoan(req, res) {
  const id = parseId(req, res, "loan");
  if (id === null) return;
  const ownerId = await requireOwner(req, res);
  if (!ownerId) return;

  try {
    const removed = await loanModel.remove(id, ownerId);
    if (!removed) return res.status(404).json({ ok: false, message: "Loan not found." });
    res.status(200).json({ ok: true, message: "Loan deleted." });
  } catch (err) {
    if (err?.code === "23503") {
      return res.status(409).json({
        ok: false,
        message: "This loan has ledger entries. Delete or re-link those entries first.",
      });
    }
    sendError(res, err, "delete loan", "loans");
  }
}
