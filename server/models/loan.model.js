/* ------------------------------------------------------------------
   Data access for `tblloans` (the Loans tab).

   Pure Supabase queries — no HTTP/req handling here (that lives in
   server/controllers/loan.controller.js). Every function throws the
   raw Supabase error on failure; the controller turns it into a
   JSON response.

   EVERY query is scoped by `nUserId`: a user only ever sees or touches
   their own loans (the owner id comes from the session cookie, never
   from a request body). Foreign or missing rows both read as null → 404.

   NOTE: this is the ONLY place that knows the table name/columns.
   ------------------------------------------------------------------ */

import { getSupabase } from "../config/supabase.js";

const TABLE = "tblloans";

/** All loans owned by `nUserId`, newest first. */
export async function findAllForUser(nUserId) {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select("*")
    .eq("nUserId", nUserId)
    // Newest first; nLoanId is the reliable creation order
    // (dttCreated is nullable and may repeat).
    .order("nLoanId", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

/** Returns the row when it exists AND belongs to `nUserId`, else null. */
export async function findById(id, nUserId) {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select("*")
    .eq("nLoanId", id)
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

/** Returns the updated row, or null when no row matched `id` for this user. */
export async function update(id, values, nUserId) {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .update(values)
    .eq("nLoanId", id)
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
    .eq("nLoanId", id)
    .eq("nUserId", nUserId)
    .select("nLoanId");

  if (error) throw error;
  return (data?.length ?? 0) > 0;
}
