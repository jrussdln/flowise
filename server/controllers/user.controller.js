/* ------------------------------------------------------------------
   HTTP layer for /api/users.

   Validates input, calls server/models/user.model.js, and shapes the
   JSON responses. Mounted by server/routes/users.route.js (Express)
   and re-used by api/users*.js (Vercel serverless), so behaviour is
   identical in development and production.

   Response shapes:
     success -> { ok: true,  data }  or  { ok: true, message }
     failure -> { ok: false, message, errors? , debug? }

   SECURITY: responses never include `strPassword` (see sanitize());
   passwords are stored as scrypt hashes (server/utils/password.js).
   ------------------------------------------------------------------ */

import * as userModel from "../models/user.model.js";
import { hashPassword } from "../utils/password.js";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** The password column is never sent back to the client. */
function sanitize(user) {
  if (!user) return user;
  const safe = { ...user };
  delete safe.strPassword;
  return safe;
}

/** Reads and validates :id. Sends a 400 and returns null when invalid. */
function parseId(req, res) {
  const id = Number(req.params?.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ ok: false, message: "Invalid user id." });
    return null;
  }
  return id;
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

  const text = (key, label, { required = false, max = 0 } = {}) => {
    if (!isNew && !has(key)) return;
    const value = str(body[key]);
    if (required && !value) {
      errors[key] = `${label} is required.`;
      return;
    }
    if (max && value.length > max) {
      errors[key] = `${label} must be ${max} characters or fewer.`;
      return;
    }
    values[key] = value;
  };

  text("strFName", "First name", { required: true, max: 100 });
  text("strLName", "Last name", { required: true, max: 100 });
  text("strUserName", "Username", { required: true, max: 100 });

  if (isNew || has("strEmail")) {
    const email = str(body.strEmail);
    if (!email) {
      errors.strEmail = "Email address is required.";
    } else if (email.length > 254 || !EMAIL_PATTERN.test(email)) {
      errors.strEmail = "That email address doesn't look right.";
    } else {
      values.strEmail = email;
    }
  }

  if (isNew || has("strPhoneNo")) {
    const phone = str(body.strPhoneNo);
    if (phone.length > 30) {
      errors.strPhoneNo = "Phone number must be 30 characters or fewer.";
    } else {
      values.strPhoneNo = phone || null;
    }
  }

  if (isNew || has("dtBirthDate")) {
    const date = str(body.dtBirthDate);
    if (date && !DATE_PATTERN.test(date)) {
      errors.dtBirthDate = "Birth date must be in YYYY-MM-DD format.";
    } else {
      values.dtBirthDate = date || null;
    }
  }

  const select = (key, fallback, label) => {
    if (!isNew && !has(key)) return;
    const value = str(body[key]);
    if (!value) {
      // Creating without an explicit value -> sensible default;
      // updating with an explicit blank -> reject (can't store empty).
      if (isNew) values[key] = fallback;
      else errors[key] = `${label} is required.`;
      return;
    }
    if (value.length > 1) {
      errors[key] = `${label} must be a single character.`;
      return;
    }
    values[key] = value;
  };

  select("cType", "U", "User type");
  select("cStatus", "A", "Status");

  if (isNew || has("strPassword")) {
    const raw = typeof body.strPassword === "string" ? body.strPassword : "";
    if (isNew && !raw) {
      errors.strPassword = "Password is required.";
    } else if (raw.length > 200) {
      errors.strPassword = "Password must be 200 characters or fewer.";
    } else if (raw) {
      // Empty on update = "keep the current password" (never trimmed).
      values.strPassword = raw;
    }
  }

  return { values, errors };
}

function sendValidation(res, errors) {
  res.status(400).json({
    ok: false,
    message: "Please fix the highlighted fields.",
    errors,
  });
}

/**
 * Returns true (and responds 409) when another user already holds this
 * email or username. The table has no unique constraint, so this check
 * lives here — `excludeId` lets an edit ignore its own row.
 */
async function checkConflict(values, excludeId, res) {
  const conflict = await userModel.findConflicting(
    { strEmail: values.strEmail, strUserName: values.strUserName },
    excludeId
  );
  if (!conflict) return false;

  const errors = {};
  if (values.strEmail && conflict.strEmail === values.strEmail) {
    errors.strEmail = "That email address is already in use.";
  }
  if (values.strUserName && conflict.strUserName === values.strUserName) {
    errors.strUserName = "That username is already in use.";
  }

  res.status(409).json({
    ok: false,
    message: "A user with that email or username already exists.",
    errors,
  });
  return true;
}

/** Maps model/Supabase errors to an HTTP response (mirrors contact.js style). */
function sendError(res, err, action) {
  // Postgres unique_violation (belt-and-braces: a constraint may exist).
  if (err?.code === "23505") {
    return res.status(409).json({
      ok: false,
      message: "A user with that username or email already exists.",
    });
  }

  // Postgres numeric_value_out_of_range — the id doesn't fit nUserId's
  // type (smallint): a bad id, not a server fault.
  if (err?.code === "22003") {
    return res.status(400).json({ ok: false, message: "Invalid user id." });
  }

  // Postgres invalid_text_representation / string_data_right_truncation.
  if (err?.code === "22P02") {
    return res.status(400).json({
      ok: false,
      message: "One of the values sent is not in the expected format.",
    });
  }
  if (err?.code === "22001") {
    return res.status(400).json({ ok: false, message: "One of the values sent is too long." });
  }

  const status = err?.status || err?.statusCode || 500;
  console.error(`[users] failed to ${action}:`, err?.message || err);

  res.status(status).json({
    ok: false,
    message: status === 500 ? "Unexpected server error." : err?.message || "Request failed.",
    // Helpful locally, hidden on Vercel (NODE_ENV=production) — same
    // approach as server/contact.js.
    ...(status === 500 && process.env.NODE_ENV !== "production"
      ? { debug: err?.message }
      : {}),
  });
}

/** GET /api/users */
export async function listUsers(_req, res) {
  try {
    const users = await userModel.findAll();
    res.status(200).json({ ok: true, data: users.map(sanitize) });
  } catch (err) {
    sendError(res, err, "load users");
  }
}

/** GET /api/users/:id */
export async function getUser(req, res) {
  const id = parseId(req, res);
  if (id === null) return;

  try {
    const user = await userModel.findById(id);
    if (!user) {
      return res.status(404).json({ ok: false, message: "User not found." });
    }
    res.status(200).json({ ok: true, data: sanitize(user) });
  } catch (err) {
    sendError(res, err, "load user");
  }
}

/** POST /api/users */
export async function createUser(req, res) {
  const { values, errors } = validate(req.body, { isNew: true });
  if (Object.keys(errors).length > 0) return sendValidation(res, errors);

  try {
    if (await checkConflict(values, null, res)) return;
    // Never store plain text — auth.controller verifies with scrypt.
    if (values.strPassword) values.strPassword = await hashPassword(values.strPassword);
    const user = await userModel.create(values);
    res.status(201).json({ ok: true, data: sanitize(user) });
  } catch (err) {
    sendError(res, err, "create user");
  }
}

/** PUT /api/users/:id — partial update: only fields present in the body change. */
export async function updateUser(req, res) {
  const id = parseId(req, res);
  if (id === null) return;

  const { values, errors } = validate(req.body, { isNew: false });
  if (Object.keys(errors).length > 0) return sendValidation(res, errors);

  const payload = { ...values };
  if (!payload.strPassword) delete payload.strPassword;

  if (Object.keys(payload).length === 0) {
    return res.status(400).json({ ok: false, message: "No fields to update." });
  }

  try {
    const touchesIdentity =
      Object.hasOwn(payload, "strEmail") || Object.hasOwn(payload, "strUserName");
    if (touchesIdentity && (await checkConflict(payload, id, res))) return;

    // Never store plain text — auth.controller verifies with scrypt.
    if (payload.strPassword) payload.strPassword = await hashPassword(payload.strPassword);

    const user = await userModel.update(id, payload);
    if (!user) {
      return res.status(404).json({ ok: false, message: "User not found." });
    }
    res.status(200).json({ ok: true, data: sanitize(user) });
  } catch (err) {
    sendError(res, err, "update user");
  }
}

/** DELETE /api/users/:id */
export async function deleteUser(req, res) {
  const id = parseId(req, res);
  if (id === null) return;

  try {
    const removed = await userModel.remove(id);
    if (!removed) {
      return res.status(404).json({ ok: false, message: "User not found." });
    }
    res.status(200).json({ ok: true, message: "User deleted." });
  } catch (err) {
    sendError(res, err, "delete user");
  }
}
