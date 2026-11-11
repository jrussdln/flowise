/* ------------------------------------------------------------------
   Password hashing for tblusers — scrypt via node:crypto, so no new
   dependencies are needed.

   Stored format:  scrypt$<salt-hex>$<hash-hex>

   Rows created before this module existed store the password as
   plain text. verifyPassword() still accepts those (constant-time
   comparison) and reports `needsUpgrade: true` so the caller can
   transparently re-hash the row on the next successful sign-in.
   ------------------------------------------------------------------ */

import crypto from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(crypto.scrypt);

const SCHEME = "scrypt";
const KEY_LEN = 64;
const SALT_LEN = 16;
/* N=16384 (Node's default cost), r=8, p=1 → ~16 MB and ~30 ms per
   hash: a good fit for both the dev server and Vercel serverless. */
const SCRYPT_OPTS = { N: 16384, r: 8, p: 1 };

/* Fixed salt used only to keep legacy/missing-hash logins spending the
   same scrypt work as real ones, so response timing does not reveal
   which usernames exist. Never used to store anything. */
const TIMING_PAD_SALT = Buffer.from("bms-login-timing-pad", "utf8");

/** Returns true when the stored value still needs hashing (legacy plain text). */
export function needsRehash(stored) {
  return typeof stored === "string" && !stored.startsWith(`${SCHEME}$`);
}

/** Hashes a plain-text password for storage. */
export async function hashPassword(plain) {
  const salt = crypto.randomBytes(SALT_LEN);
  const derived = await scrypt(String(plain), salt, KEY_LEN, SCRYPT_OPTS);
  return [SCHEME, salt.toString("hex"), derived.toString("hex")].join("$");
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value), "utf8").digest();
}

/**
 * Verifies a plain-text password against the stored value.
 * Returns { valid, needsUpgrade } — `needsUpgrade` is true only when a
 * legacy plain-text row matched, so callers can re-hash it immediately.
 *
 * Every path spends exactly one scrypt derivation, so "no such user",
 * "legacy row" and "hashed row" all respond at roughly the same speed.
 */
export async function verifyPassword(plain, stored) {
  if (typeof plain !== "string" || !plain) return { valid: false, needsUpgrade: false };
  const value = typeof stored === "string" ? stored : "";

  if (value.startsWith(`${SCHEME}$`)) {
    const [, saltHex, hashHex] = value.split("$");
    if (!saltHex || !hashHex) return { valid: false, needsUpgrade: false };

    const salt = Buffer.from(saltHex, "hex");
    const expected = Buffer.from(hashHex, "hex");
    const derived = await scrypt(plain, salt, expected.length || KEY_LEN, SCRYPT_OPTS);
    const valid =
      expected.length === derived.length && crypto.timingSafeEqual(expected, derived);
    return { valid, needsUpgrade: false };
  }

  /* Legacy plain-text row (or no row at all): equalise the cost with a
     throw-away scrypt, then compare the value in constant time. */
  await scrypt(plain, TIMING_PAD_SALT, KEY_LEN, SCRYPT_OPTS);
  if (!value) return { valid: false, needsUpgrade: false };

  const a = sha256(plain);
  const b = sha256(value);
  const valid = crypto.timingSafeEqual(a, b);
  return { valid, needsUpgrade: valid };
}
