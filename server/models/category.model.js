/* ------------------------------------------------------------------
   Data access for `tblcategories` (income/expense labels).
   Rows are scoped to the owner's auth.users uuid — see
   server/utils/owner.js. Feeds the Ledger page's category dropdown.
   ------------------------------------------------------------------ */

import { getSupabase } from "../config/supabase.js";

const TABLE = "tblcategories";

export const WRITABLE_FIELDS = ["strName", "strIcon", "strColor", "bIsActive"];

/** All categories, newest-relevant name order. */
export async function findAll(ownerId, { activeOnly = false } = {}) {
  let query = getSupabase()
    .from(TABLE)
    .select("*")
    .eq("nUserId", ownerId)
    .order("strName", { ascending: true });

  if (activeOnly) query = query.eq("bIsActive", true);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function findById(id, ownerId) {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select("*")
    .eq("nCategoryId", id)
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
    .eq("nCategoryId", id)
    .eq("nUserId", ownerId)
    .select();

  if (error) throw error;
  return data?.[0] ?? null;
}

export async function remove(id, ownerId) {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .delete()
    .eq("nCategoryId", id)
    .eq("nUserId", ownerId)
    .select("nCategoryId");

  if (error) throw error;
  return (data?.length ?? 0) > 0;
}
