/* ------------------------------------------------------------------
   Data access for `tblusers`.

   Pure Supabase queries — no HTTP/req handling here (that lives in
   server/controllers/user.controller.js). Every function throws the
   raw Supabase error on failure; the controller turns it into a
   JSON response.

   NOTE: this is the ONLY place that knows the table name/columns.
   ------------------------------------------------------------------ */

import { getSupabase } from "../config/supabase.js";

const TABLE = "tblusers";

/**
 * Columns clients are allowed to write. `nUserId` (identity) and
 * `dttCreated` (set on insert) are server-owned and never accepted
 * from a request body.
 */
export const WRITABLE_FIELDS = [
  "strFName",
  "strLName",
  "strUserName",
  "strPassword",
  "strEmail",
  "strPhoneNo",
  "dtBirthDate",
  "cType",
  "cStatus",
];

export async function findAll() {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select("*")
    .order("nUserId", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

/** Returns the user row, or null when it does not exist. */
export async function findById(id) {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select("*")
    .eq("nUserId", id)
    .maybeSingle();

  if (error) throw error;
  return data;
}

/**
 * Returns the row with this username, or null.
 * Used by the auth controller at sign-in; `.limit(1)` keeps it safe even
 * if duplicate usernames ever slip past the app-level conflict check.
 */
export async function findByUsername(strUserName) {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select("*")
    .eq("strUserName", strUserName)
    .limit(1);

  if (error) throw error;
  return data?.[0] ?? null;
}

/**
 * Looks for another row already using this email or username.
 * The table has no unique constraint, so create/update call this to
 * enforce uniqueness at the application level.
 * Pass `excludeId` when editing so a user's own row is ignored.
 * Returns the conflicting row, or null when the values are free.
 */
export async function findConflicting({ strEmail, strUserName } = {}, excludeId = null) {
  const checks = [
    ["strEmail", strEmail],
    ["strUserName", strUserName],
  ];

  for (const [column, value] of checks) {
    if (!value) continue;

    let query = getSupabase()
      .from(TABLE)
      .select("nUserId, strEmail, strUserName")
      .eq(column, value)
      .limit(1);

    if (excludeId !== null) query = query.neq("nUserId", excludeId);

    const { data, error } = await query;
    if (error) throw error;
    if (data && data.length > 0) return data[0];
  }

  return null;
}

export async function create(values) {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .insert([{ ...values, dttCreated: new Date().toISOString() }])
    .select()
    .single();

  if (error) throw error;
  return data;
}

/** Returns the updated row, or null when no row matched `id`. */
export async function update(id, values) {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .update(values)
    .eq("nUserId", id)
    .select();

  if (error) throw error;
  return data?.[0] ?? null;
}

/** Returns true when a row was actually deleted. */
export async function remove(id) {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .delete()
    .eq("nUserId", id)
    .select("nUserId");

  if (error) throw error;
  return (data?.length ?? 0) > 0;
}
