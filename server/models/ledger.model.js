/* ------------------------------------------------------------------
   Data access for `tblledger` (every money movement: IN / OUT / TRF).
   Rows are scoped to the owner's auth.users uuid — see
   server/utils/owner.js. Ordered newest transaction first.
   ------------------------------------------------------------------ */

import { getSupabase } from "../config/supabase.js";

const TABLE = "tblledger";

export const WRITABLE_FIELDS = [
  "strCode",
  "strTitle",
  "strDescription",
  "strMerchant",
  "strReference",
  "dAmount",
  "dFee",
  "strCurrency",
  "cType",
  "nAccountId",
  "nToAccountId",
  "nCategoryId",
  "nLoanId",
  "nSavingsId",
  "dTransactionDate",
  "cStatus",
  "bIsRecurring",
  "strNotes",
];

export async function findAll(ownerId) {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select("*")
    .eq("nUserId", ownerId)
    .order("dTransactionDate", { ascending: false })
    .order("nLedgerId", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function findById(id, ownerId) {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select("*")
    .eq("nLedgerId", id)
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
    .eq("nLedgerId", id)
    .eq("nUserId", ownerId)
    .select();

  if (error) throw error;
  return data?.[0] ?? null;
}

export async function remove(id, ownerId) {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .delete()
    .eq("nLedgerId", id)
    .eq("nUserId", ownerId)
    .select("nLedgerId");

  if (error) throw error;
  return (data?.length ?? 0) > 0;
}
