/* ------------------------------------------------------------------
   HTTP layer for /api/auth — sign-in, sign-out and session restore.

   The user asked for "login logout only": there is no register,
   password reset, or profile editing here (user management lives in
   server/controllers/user.controller.js).

     POST /api/auth/login   { strUserName, strPassword } -> sets cookie
     POST /api/auth/logout                            -> clears cookie
     GET  /api/auth/me                                -> current user

   Mounted by server/routes/auth.route.js inside server/app.js — the
   same Express app that api/index.js runs on Vercel, so behaviour is
   identical in both.
   SECURITY: responses never include `strPassword`, and passwords are
   verified + stored with scrypt (server/utils/password.js) — legacy
   plain-text rows are upgraded transparently on first sign-in.
   ------------------------------------------------------------------ */

import * as userModel from "../models/user.model.js";
import { hashPassword, verifyPassword, needsRehash } from "../utils/password.js";
import {
  createToken,
  setSessionCookie,
  clearSessionCookie,
  getSessionUserId,
} from "../utils/session.js";

const MAX_USERNAME_LENGTH = 100;
const MAX_PASSWORD_LENGTH = 200;

/* Simple in-memory rate limit on failed sign-ins: 10 per IP / 15 min.
   Same soft-guard approach as server/contact.js (per warm instance on
   serverless). Successful sign-ins clear the counter. */
const LOGIN_ATTEMPT_MAX = 10;
const LOGIN_ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const loginAttempts = new Map();

function recordFailure(key) {
  const now = Date.now();
  const recent = (loginAttempts.get(key) || []).filter(
    (ts) => now - ts < LOGIN_ATTEMPT_WINDOW_MS
  );
  recent.push(now);
  loginAttempts.set(key, recent);

  if (loginAttempts.size > 2000) {
    for (const [k, v] of loginAttempts) {
      if (v.every((ts) => now - ts >= LOGIN_ATTEMPT_WINDOW_MS)) loginAttempts.delete(k);
    }
  }
}

function isLockedOut(key) {
  const now = Date.now();
  const recent = (loginAttempts.get(key) || []).filter(
    (ts) => now - ts < LOGIN_ATTEMPT_WINDOW_MS
  );
  loginAttempts.set(key, recent);
  return recent.length >= LOGIN_ATTEMPT_MAX;
}

function getClientIp(req) {
  const forwarded = req.headers?.["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || "unknown";
}

/** The password column is never sent back to the client. */
function sanitize(user) {
  if (!user) return user;
  const safe = { ...user };
  delete safe.strPassword;
  return safe;
}

function sendError(res, err, action) {
  const status = err?.status || err?.statusCode || 500;
  console.error(`[auth] failed to ${action}:`, err?.message || err);

  res.status(status).json({
    ok: false,
    message: status === 500 ? "Unexpected server error." : err?.message || "Request failed.",
    ...(status === 500 && process.env.NODE_ENV !== "production"
      ? { debug: err?.message }
      : {}),
  });
}

/** POST /api/auth/login */
export async function login(req, res) {
  const body = req.body || {};
  const strUserName = typeof body.strUserName === "string" ? body.strUserName.trim() : "";
  const strPassword = typeof body.strPassword === "string" ? body.strPassword : "";

  const errors = {};
  if (!strUserName) errors.strUserName = "Username is required.";
  else if (strUserName.length > MAX_USERNAME_LENGTH) {
    errors.strUserName = `Username must be ${MAX_USERNAME_LENGTH} characters or fewer.`;
  }
  if (!strPassword) errors.strPassword = "Password is required.";
  else if (strPassword.length > MAX_PASSWORD_LENGTH) {
    errors.strPassword = `Password must be ${MAX_PASSWORD_LENGTH} characters or fewer.`;
  }
  if (Object.keys(errors).length > 0) {
    return res.status(400).json({
      ok: false,
      message: "Please fix the highlighted fields.",
      errors,
    });
  }

  const ip = getClientIp(req);

  try {
    const user = await userModel.findByUsername(strUserName);
    /* One scrypt run whether or not the username exists, so response
       timing does not reveal which accounts are in the database. */
    const check = await verifyPassword(strPassword, user?.strPassword);

    if (!user || !check.valid) {
      /* Rate limit failures only: a locked-out caller still pays for the
         verification above, and correct credentials are never blocked —
         a successful sign-in resets the counter below. */
      if (isLockedOut(ip)) {
        return res.status(429).json({
          ok: false,
          message: "Too many sign-in attempts. Please wait a few minutes and try again.",
        });
      }
      recordFailure(ip);
      return res
        .status(401)
        .json({ ok: false, message: "Invalid username or password." });
    }

    if (user.cStatus !== "A") {
      return res.status(403).json({
        ok: false,
        message: "Your account is not active. Please contact an administrator.",
      });
    }

    /* Transparent upgrade: rows created before hashing stored plain text. */
    if (check.needsUpgrade || needsRehash(user.strPassword)) {
      try {
        await userModel.update(user.nUserId, {
          strPassword: await hashPassword(strPassword),
        });
      } catch (upgradeErr) {
        console.warn("[auth] could not upgrade stored password:", upgradeErr?.message || upgradeErr);
      }
    }

    loginAttempts.delete(ip);
    setSessionCookie(res, createToken(user.nUserId));
    return res.status(200).json({ ok: true, data: sanitize(user) });
  } catch (err) {
    return sendError(res, err, "sign in");
  }
}

/** POST /api/auth/logout */
export async function logout(_req, res) {
  clearSessionCookie(res);
  return res.status(200).json({ ok: true, message: "Signed out." });
}

/** GET /api/auth/me — restores the session after a page refresh. */
export async function me(req, res) {
  try {
    const userId = getSessionUserId(req);
    if (userId === null) {
      return res.status(401).json({ ok: false, message: "Not signed in." });
    }

    const user = await userModel.findById(userId);
    if (!user || user.cStatus !== "A") {
      return res.status(401).json({ ok: false, message: "Not signed in." });
    }

    return res.status(200).json({ ok: true, data: sanitize(user) });
  } catch (err) {
    return sendError(res, err, "restore session");
  }
}
