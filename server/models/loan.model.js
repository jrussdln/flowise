/* ------------------------------------------------------------------
   Data access for `tblloans` (borrowed money being paid back).
   Rows are scoped to the owner's auth.users uuid — see
   server/utils/owner.js.
   ------------------------------------------------------------------ */

import { getSupabase } from "../config/supabase.js";

const TABLE = "tblloans";

export const WRITABLE_FIELDS = [
  "strName",
  "strLender",
  "dPrincipal",
  "dInterestRate",
  "nTermMonths",
  "dMonthlyPayment",
  "dStartDate",
  "nPaymentDay",
  "cStatus",
  "strNotes",
  "nAccountId",
];

export async function findAll(ownerId) {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select("*")
    .eq("nUserId", ownerId)
    .order("dStartDate", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function findById(id, ownerId) {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select("*")
    .eq("nLoanId", id)
    .eq("nUserId", ownerId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function create(values, ownerId) {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .insert([{ ...values, nUserId: ownerId }])
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function update(id, ownerId, values) {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .update(values)
    .eq("nLoanId", id)
    .eq("nUserId", ownerId)
    .select();

  if (error) throw error;
  return data?.[0] ?? null;
}

export async function remove(id, ownerId) {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .delete()
    .eq("nLoanId", id)
    .eq("nUserId", ownerId)
    .select("nLoanId");

  if (error) throw error;
  return (data?.length ?? 0) > 0;
}
