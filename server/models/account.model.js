/* ------------------------------------------------------------------
   Data access for `tblaccounts` (cash / bank / card / e-wallets).

   Pure Supabase queries — no HTTP handling (that lives in
   server/controllers/account.controller.js). Every function takes the
   owner's auth.users uuid so rows stay scoped to the signed-in user.
   ------------------------------------------------------------------ */

import { getSupabase } from "../config/supabase.js";

const TABLE = "tblaccounts";

/** Columns clients are allowed to write; nUserId/dtt* are server-owned. */
export const WRITABLE_FIELDS = [
  "strName",
  "cAccountType",
  "strInstitution",
  "strLast4",
  "strCurrency",
  "dOpeningBalance",
  "dCreditLimit",
  "nStatementDay",
  "nDueDay",
  "bIsActive",
];

export async function findAll(ownerId) {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select("*")
    .eq("nUserId", ownerId)
    .order("strName", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

/** GET /api/accounts/balances — live balance per account from the view. */
export async function findBalances(ownerId) {
  const { data, error } = await getSupabase()
    .from("vwaccountbalances")
    .select("*")
    .eq("nUserId", ownerId)
    .order("strName", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function findById(id, ownerId) {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select("*")
    .eq("nAccountId", id)
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
    .eq("nAccountId", id)
    .eq("nUserId", ownerId)
    .select();

  if (error) throw error;
  return data?.[0] ?? null;
}

export async function remove(id, ownerId) {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .delete()
    .eq("nAccountId", id)
    .eq("nUserId", ownerId)
    .select("nAccountId");

  if (error) throw error;
  return (data?.length ?? 0) > 0;
}
