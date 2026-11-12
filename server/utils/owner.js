/* ------------------------------------------------------------------
   Owner resolution for the finance tables (tblaccounts, tblloans,
   tblsavings, tblledger, tblcategories).

   Every one of those tables stores `nUserId uuid references
   auth.users(id)` with RLS scoped to auth.uid(). This app, however,
   signs users in through its own `tblusers` table + signed session
   cookie (integer id), so the queries here run with the server's
   secret key (which bypasses RLS) and must scope rows themselves.

   Strategy: deterministically map the signed-in app user to a Supabase
   auth user — found by email (or created once through the admin API so
   the foreign key passes) — and cache the mapping per process. All
   finance queries filter/update with this uuid, which reproduces the
   RLS boundary ("each user only sees their own rows") at the API layer.
   ------------------------------------------------------------------ */

import crypto from "node:crypto";
import { getSupabase } from "../config/supabase.js";
import { getSessionUserId } from "./session.js";
import * as userModel from "../models/user.model.js";

/* Fallback: a valid-format uuid derived from the app user id, used only
   if the admin API is unreachable. Reads still work (empty set); the
   first insert would fail the FK with a clear error. */
function seededUuid(seed) {
  const hash = crypto
    .createHash("sha256")
    .update(`flowwise-owner:${seed}`)
    .digest("hex")
    .slice(0, 32);
  /* Set a version nibble and a RFC-4122 variant nibble so the string is
     a syntactically valid uuid for the uuid column. */
  const variant = ((parseInt(hash[16], 16) | 0x8) & 0xb).toString(16);
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    `5${hash.slice(13, 16)}`,
    `${variant}${hash.slice(17, 20)}`,
    hash.slice(20, 32),
  ].join("-");
}

const cache = new Map(); // app user id -> auth.users id

/**
 * Returns the auth.users uuid owning all finance rows for the signed-in
 * caller, or null when there is no session. Controllers respond 401 on
 * null and pass this value as `nUserId` / `.eq("nUserId", ...)` on every
 * query.
 */
export async function getOwnerUuid(req) {
  const uid = getSessionUserId(req);
  if (uid === null) return null;

  if (cache.has(uid)) return cache.get(uid);

  const email = `owner-${uid}@flowwise.local`;

  try {
    /* The email mirrors the app user's own address when we have it. */
    const appUser = await userModel.findById(uid).catch(() => null);
    const ownerEmail =
      appUser?.strEmail && appUser.strEmail.includes("@") ? appUser.strEmail : email;

    const admin = getSupabase().auth.admin;

    /* Find an existing auth user by email (listUsers is fine at the
       scale of this app). */
    const { data: listed, error: listError } = await admin.listUsers({ page: 1, perPage: 200 });
    const existing = !listError && listed?.users?.find((u) => u.email === ownerEmail);
    if (existing?.id) {
      cache.set(uid, existing.id);
      return existing.id;
    }

    /* None yet — create the linking auth user once. Nobody signs in with
       it; it only satisfies the FK + RLS owner. */
    const { data: created, error: createError } = await admin.createUser({
      email: ownerEmail,
      password: crypto.randomBytes(24).toString("base64url"),
      email_confirm: true,
    });
    if (createError) throw createError;

    cache.set(uid, created.user.id);
    return created.user.id;
  } catch (err) {
    console.warn("[owner] could not resolve auth user, using seeded uuid:", err?.message || err);
    const fallback = seededUuid(uid);
    cache.set(uid, fallback);
    return fallback;
  }
}
