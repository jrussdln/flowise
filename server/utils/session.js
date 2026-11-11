/* ------------------------------------------------------------------
   Stateless session helper for /api/auth — HMAC-signed tokens stored
   in an httpOnly cookie, so no session table or JWT library is needed.

   Token:  <base64url(payload)>.<base64url(hmac-sha256)>
   Payload: { uid, exp } — verified on every request in verifyToken().

   Cookies are written with plain Set-Cookie headers (not res.cookie())
   so Express (server/index.js) and Vercel (api/*.js) behave identically.
   ------------------------------------------------------------------ */

import crypto from "node:crypto";

export const COOKIE_NAME = "bms_session";
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/* Prefer SESSION_SECRET; fall back to the Supabase keys (already secret
   and stable). With nothing configured, use a random per-process secret:
   sessions then reset on restart instead of being forgeable. */
let fallbackSecret = null;
function getSecret() {
  const secret =
    process.env.SESSION_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY;

  if (secret) return secret;

  if (!fallbackSecret) {
    fallbackSecret = crypto.randomBytes(32).toString("hex");
    console.warn(
      "⚠ SESSION_SECRET / Supabase keys not set — signing sessions with an " +
        "unstable secret (they reset on restart). Set SESSION_SECRET in .env."
    );
  }
  return fallbackSecret;
}

function hmac(body) {
  return crypto.createHmac("sha256", getSecret()).update(body).digest("base64url");
}

/** Signs a session token for a user id. */
export function createToken(userId) {
  const body = Buffer.from(
    JSON.stringify({ uid: userId, exp: Date.now() + TOKEN_TTL_MS })
  ).toString("base64url");
  return `${body}.${hmac(body)}`;
}

/** Returns the token payload, or null when it is forged/expired. */
export function verifyToken(token) {
  if (typeof token !== "string" || !token.includes(".")) return null;
  const [body, signature] = token.split(".");

  const expected = Buffer.from(hmac(body));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (typeof payload?.uid !== "number") return null;
    if (typeof payload?.exp !== "number" || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

function serializeCookie(value, maxAgeSeconds) {
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (process.env.NODE_ENV === "production") parts.push("Secure");
  return parts.join("; ");
}

/** Sets the session cookie on the response. */
export function setSessionCookie(res, token) {
  res.setHeader("Set-Cookie", serializeCookie(token, TOKEN_TTL_MS / 1000));
}

/** Clears the session cookie (logout). */
export function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", serializeCookie("", 0));
}

/** Reads the session cookie from a request, or null when absent. */
export function readToken(req) {
  const header = req?.headers?.cookie;
  if (!header) return null;

  for (const part of String(header).split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1 || part.slice(0, eq).trim() !== COOKIE_NAME) continue;
    try {
      return decodeURIComponent(part.slice(eq + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Returns the signed-in user's id for this request, or null when the
 * caller is not signed in (missing / forged / expired cookie).
 * Use this in controllers that must only act on the caller's own data.
 */
export function getSessionUserId(req) {
  const payload = verifyToken(readToken(req));
  return payload?.uid ?? null;
}
