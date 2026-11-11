/* ------------------------------------------------------------------
   Data access for `tblcards` (the Cards tab).

   Pure Supabase queries — no HTTP/req handling here (that lives in
   server/controllers/card.controller.js). Every function throws the
   raw Supabase error on failure; the controller turns it into a JSON
   response.

   EVERY query is scoped by `nUserId`: a user only ever sees or touches
   their own rows (the owner id comes from the session cookie, never
   from a request body). Foreign or missing rows both read as null → 404.

   Columns: nCardId (identity PK), strCode, strBankName, strAccountNumber,
   strDescription, cStatus, dttCreated, nUserId, strColor, bIsFavorite,
   cType, dCreditLimit, nDueDay (billing due day), strExpiry, nCVC. There is NO balance column, so
   a card never holds money of its own — it is a named card with a type
   (cType: D/C/P) and a status, plus card-specific fields (account
   number, expiry, CVC, credit limit) and the two cosmetic columns the
   card grids share (strColor accent, bIsFavorite pin).

   NOTE: this is the ONLY place that knows the table name/columns.
   ------------------------------------------------------------------ */

import { getSupabase } from "../config/supabase.js";

const TABLE = "tblcards";

/** CRD-0001, CRD-0002, ... — padded to 4 digits, wider ids kept whole. */
function makeCardCode(id) {
  return `CRD-${String(id).padStart(4, "0")}`;
}

/** All cards owned by `nUserId`, newest first. */
export async function findAllForUser(nUserId) {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select("*")
    .eq("nUserId", nUserId)
    // Newest first; nCardId is the reliable creation order
    // (dttCreated is nullable and may repeat).
    .order("nCardId", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

/** Returns the row when it exists AND belongs to `nUserId`, else null. */
export async function findById(id, nUserId) {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select("*")
    .eq("nCardId", id)
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
 * Inserts a row and stamps CRD-<id> from its identity in a second,
 * best-effort write: if that write fails the row is still valid
 * (`strCode` is nullable) — it is logged and the insert is returned as
 * is. Same shape as savingModel.createWithCode.
 */
export async function createWithCode(values) {
  const row = await create(values);
  if (row.strCode) return row;

  try {
    return (
      (await update(row.nCardId, { strCode: makeCardCode(row.nCardId) }, values.nUserId)) ?? row
    );
  } catch (err) {
    console.warn("[cards] could not assign strCode:", err?.message || err);
    return row;
  }
}

/** Returns the updated row, or null when no row matched `id` for this user. */
export async function update(id, values, nUserId) {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .update(values)
    .eq("nCardId", id)
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
    .eq("nCardId", id)
    .eq("nUserId", nUserId)
    .select("nCardId");

  if (error) throw error;
  return (data?.length ?? 0) > 0;
}
