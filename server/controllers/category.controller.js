/* ------------------------------------------------------------------
   HTTP layer for /api/categories (income/expense labels). Validates
   input, calls category.model.js, shapes JSON. Every route resolves
   the signed-in caller's owner uuid first — 401 without a session.
   ------------------------------------------------------------------ */

import * as categoryModel from "../models/category.model.js";
import { getOwnerUuid } from "../utils/owner.js";
import { parseId, sendError, sendValidation, createValidator } from "../utils/finance.js";

async function requireOwner(req, res) {
  const ownerId = await getOwnerUuid(req);
  if (!ownerId) res.status(401).json({ ok: false, message: "Not signed in." });
  return ownerId;
}

function validate(body, { isNew = false } = {}) {
  const v = createValidator(body, { isNew });

  v.text("strName", "Category name", { required: true, max: 100 });
  v.text("strIcon", "Icon", { max: 50 });
  v.text("strColor", "Color", { max: 9 });
  v.bool("bIsActive", { fallback: true });

  return v;
}

/** GET /api/categories?active=1 — dropdown-friendly list. */
export async function listCategories(req, res) {
  const ownerId = await requireOwner(req, res);
  if (!ownerId) return;

  try {
    const activeOnly = ["1", "true"].includes(String(req.query?.active ?? ""));
    res
      .status(200)
      .json({ ok: true, data: await categoryModel.findAll(ownerId, { activeOnly }) });
  } catch (err) {
    sendError(res, err, "load categories", "categories");
  }
}

/** GET /api/categories/:id */
export async function getCategory(req, res) {
  const id = parseId(req, res, "category");
  if (id === null) return;
  const ownerId = await requireOwner(req, res);
  if (!ownerId) return;

  try {
    const category = await categoryModel.findById(id, ownerId);
    if (!category) return res.status(404).json({ ok: false, message: "Category not found." });
    res.status(200).json({ ok: true, data: category });
  } catch (err) {
    sendError(res, err, "load category", "categories");
  }
}

/** POST /api/categories */
export async function createCategory(req, res) {
  const ownerId = await requireOwner(req, res);
  if (!ownerId) return;

  const v = validate(req.body, { isNew: true });
  if (Object.keys(v.errors).length > 0) return sendValidation(res, v.errors);

  try {
    const category = await categoryModel.create(v.values, ownerId);
    res.status(201).json({ ok: true, data: category });
  } catch (err) {
    /* unique ("nUserId","strName") — friendly duplicate message. */
    if (err?.code === "23505") {
      return res.status(409).json({
        ok: false,
        message: "You already have a category with that name.",
      });
    }
    sendError(res, err, "create category", "categories");
  }
}

/** PUT /api/categories/:id — partial update. */
export async function updateCategory(req, res) {
  const id = parseId(req, res, "category");
  if (id === null) return;
  const ownerId = await requireOwner(req, res);
  if (!ownerId) return;

  const v = validate(req.body, { isNew: false });
  if (Object.keys(v.errors).length > 0) return sendValidation(res, v.errors);
  if (Object.keys(v.values).length === 0) {
    return res.status(400).json({ ok: false, message: "No fields to update." });
  }

  try {
    const category = await categoryModel.update(id, ownerId, v.values);
    if (!category) return res.status(404).json({ ok: false, message: "Category not found." });
    res.status(200).json({ ok: true, data: category });
  } catch (err) {
    if (err?.code === "23505") {
      return res.status(409).json({
        ok: false,
        message: "You already have a category with that name.",
      });
    }
    sendError(res, err, "update category", "categories");
  }
}

/** DELETE /api/categories/:id */
export async function deleteCategory(req, res) {
  const id = parseId(req, res, "category");
  if (id === null) return;
  const ownerId = await requireOwner(req, res);
  if (!ownerId) return;

  try {
    const removed = await categoryModel.remove(id, ownerId);
    if (!removed) return res.status(404).json({ ok: false, message: "Category not found." });
    res.status(200).json({ ok: true, message: "Category deleted." });
  } catch (err) {
    sendError(res, err, "delete category", "categories");
  }
}
