/* ------------------------------------------------------------------
   Data access for `tblsavings` (the Savings tab).

   Pure Supabase queries — no HTTP/req handling here (that lives in
   server/controllers/saving.controller.js). Every function throws the
   raw Supabase error on failure; the controller turns it into a JSON
   response.

   EVERY query is scoped by `nUserId`: a user only ever sees or touches
   their own rows (the owner id comes from the session cookie, never
   from a request body). Foreign or missing rows both read as null → 404.

   Columns: nSavingId (identity PK), strCode, strTitle, strDescription,
   cStatus, dttCreated, nUserId — there is NO amount column yet, so a
   saving is a titled goal with a status, nothing more. Two cosmetic
   columns ride along for the card UI: strColor (accent) and
   bIsFavorite (pinned to the top of the grid).

   NOTE: this is the ONLY place that knows the table name/columns.
   ------------------------------------------------------------------ */

import { getSupabase } from "../config/supabase.js";

const TABLE = "tblsavings";

/** SAV-0001, SAV-0002, ... — padded to 4 digits, wider ids kept whole. */
function makeSavingCode(id) {
  return `SAV-${String(id).padStart(4, "0")}`;
}

/** All savings owned by `nUserId`, newest first. */
export async function findAllForUser(nUserId) {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select("*")
    .eq("nUserId", nUserId)
    // Newest first; nSavingId is the reliable creation order
    // (dttCreated is nullable and may repeat).
    .order("nSavingId", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

/** Returns the row when it exists AND belongs to `nUserId`, else null. */
export async function findById(id, nUserId) {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select("*")
    .eq("nSavingId", id)
    .eq("nUserId", nUserId)
    .maybeSingle();

  if (error) throw error;
  return data;
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

/**
 * Inserts a row and stamps SAV-<id> from its identity in a second,
 * best-effort write: if that write fails the row is still valid
 * (`strCode` is nullable) — it is logged and the insert is returned as
 * is. Same shape as transactionModel.createWithCode.
 */
export async function createWithCode(values) {
  const row = await create(values);
  if (row.strCode) return row;

  try {
    return (
      (await update(row.nSavingId, { strCode: makeSavingCode(row.nSavingId) }, values.nUserId)) ??
      row
    );
  } catch (err) {
    console.warn("[savings] could not assign strCode:", err?.message || err);
    return row;
  }
}

/** Returns the updated row, or null when no row matched `id` for this user. */
export async function update(id, values, nUserId) {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .update(values)
    .eq("nSavingId", id)
    .eq("nUserId", nUserId)
    .select();

  if (error) throw error;
  return data?.[0] ?? null;
}

/** Returns true when one of the user's rows was actually deleted. */
export async function remove(id, nUserId) {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .delete()
    .eq("nSavingId", id)
    .eq("nUserId", nUserId)
    .select("nSavingId");

  if (error) throw error;
  return (data?.length ?? 0) > 0;
}
