/* ------------------------------------------------------------------
   Shared helpers for the finance controllers (accounts, loans,
   savings, ledger, categories).

   Response shapes mirror user.controller.js:
     success -> { ok: true,  data }  or  { ok: true, message }
     failure -> { ok: false, message, errors?, debug? }
   ------------------------------------------------------------------ */

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Reads and validates :id. Sends a 400 and returns null when invalid. */
export function parseId(req, res, label = "record") {
  const id = Number(req.params?.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ ok: false, message: `Invalid ${label} id.` });
    return null;
  }
  return id;
}

/** Maps model/Supabase errors to an HTTP response (user.controller style). */
export function sendError(res, err, action, tag = "finance") {
  const known = {
    // unique_violation — e.g. duplicate category name for this user.
    "23505": [409, "A record with those details already exists."],
    // foreign_key_violation — a linked id no longer exists.
    "23503": [400, "One of the selected related records no longer exists."],
    // check_violation — a value broke a table constraint.
    "23514": [400, "One of the values is not allowed."],
    "22P02": [400, "One of the values sent is not in the expected format."],
    "22003": [400, "One of the numbers sent is out of range."],
    "22001": [400, "One of the values sent is too long."],
  };

  if (known[err?.code]) {
    const [status, message] = known[err.code];
    return res.status(status).json({ ok: false, message });
  }

  const status = err?.status || err?.statusCode || 500;
  console.error(`[${tag}] failed to ${action}:`, err?.message || err);

  res.status(status).json({
    ok: false,
    message: status === 500 ? "Unexpected server error." : err?.message || "Request failed.",
    ...(status === 500 && process.env.NODE_ENV !== "production" ? { debug: err?.message } : {}),
  });
}

/**
 * Field-by-field validator for one request body.
 *   create (isNew): every field is processed; required fields enforced.
 *   update: only keys present in the body land in `values` (partial update).
 * The `optional` text/decimal/etc. fields store null when blank, so
 * optional columns can be cleared on edit.
 */
export function createValidator(body = {}, { isNew = false } = {}) {
  const errors = {};
  const values = {};
  const has = (k) => Object.prototype.hasOwnProperty.call(body, k);
  const str = (v) => (typeof v === "string" ? v.trim() : "");
  const toNum = (v) => {
    if (v === undefined || v === null || v === "") return null;
    const n = Number(v);
    return Number.isNaN(n) ? NaN : n;
  };

  return {
    errors,
    values,
    has,

    text(key, label, { required = false, max = 0 } = {}) {
      if (!isNew && !has(key)) return;
      const value = str(body[key]);
      if (!value) {
        if (required) errors[key] = `${label} is required.`;
        else values[key] = null;
        return;
      }
      if (max && value.length > max) {
        errors[key] = `${label} must be ${max} characters or fewer.`;
        return;
      }
      values[key] = value;
    },

    decimal(key, label, { required = false, min = null, max = null } = {}) {
      if (!isNew && !has(key)) return;
      const n = toNum(body[key]);
      if (n === null) {
        if (required) errors[key] = `${label} is required.`;
        else values[key] = null;
        return;
      }
      if (Number.isNaN(n)) {
        errors[key] = `${label} must be a number.`;
        return;
      }
      if (min !== null && n < min) {
        errors[key] = `${label} must be at least ${min}.`;
        return;
      }
      if (max !== null && n > max) {
        errors[key] = `${label} must be at most ${max}.`;
        return;
      }
      values[key] = n;
    },

    integer(key, label, { required = false, min = null, max = null } = {}) {
      if (!isNew && !has(key)) return;
      const n = toNum(body[key]);
      if (n === null) {
        if (required) errors[key] = `${label} is required.`;
        else values[key] = null;
        return;
      }
      if (!Number.isInteger(n)) {
        errors[key] = `${label} must be a whole number.`;
        return;
      }
      if (min !== null && n < min) {
        errors[key] = `${label} must be between ${min}${max !== null ? ` and ${max}` : "+"}.`;
        return;
      }
      if (max !== null && n > max) {
        errors[key] = `${label} must be between ${min} and ${max}.`;
        return;
      }
      values[key] = n;
    },

    date(key, label, { required = false } = {}) {
      if (!isNew && !has(key)) return;
      const value = str(body[key]);
      if (!value) {
        if (required) errors[key] = `${label} is required.`;
        else values[key] = null;
        return;
      }
      if (!DATE_PATTERN.test(value)) {
        errors[key] = `${label} must be in YYYY-MM-DD format.`;
        return;
      }
      values[key] = value;
    },

    /** Uppercased single choice from `allowed` (cType/cStatus columns). */
    oneOf(key, label, allowed, { required = false, fallback = null } = {}) {
      if (!isNew && !has(key)) return;
      const value = str(body[key]).toUpperCase();
      if (!value) {
        if (isNew && fallback) values[key] = fallback;
        else if (required) errors[key] = `${label} is required.`;
        else values[key] = null;
        return;
      }
      if (!allowed.includes(value)) {
        errors[key] = `${label} must be one of: ${allowed.join(", ")}.`;
        return;
      }
      values[key] = value;
    },

    bool(key, { fallback = false } = {}) {
      if (!isNew && !has(key)) return;
      const raw = body[key];
      if (raw === undefined || raw === null || raw === "") {
        if (isNew) values[key] = fallback;
        return;
      }
      values[key] = raw === true || raw === "true" || raw === 1 || raw === "1";
    },
  };
}

export function sendValidation(res, errors) {
  res.status(400).json({
    ok: false,
    message: "Please fix the highlighted fields.",
    errors,
  });
}
