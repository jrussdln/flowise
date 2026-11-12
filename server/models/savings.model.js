/* ------------------------------------------------------------------
   Data access for `tblsavings` (savings goals).
   Rows are scoped to the owner's auth.users uuid — see
   server/utils/owner.js.
   ------------------------------------------------------------------ */

import { getSupabase } from "../config/supabase.js";

const TABLE = "tblsavings";

export const WRITABLE_FIELDS = [
  "strName",
  "dTargetAmount",
  "dTargetDate",
  "cStatus",
  "strNotes",
];

export async function findAll(ownerId) {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select("*")
    .eq("nUserId", ownerId)
    .order("dttCreated", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function findById(id, ownerId) {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select("*")
    .eq("nSavingsId", id)
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
    .eq("nSavingsId", id)
    .eq("nUserId", ownerId)
    .select();

  if (error) throw error;
  return data?.[0] ?? null;
}

export async function remove(id, ownerId) {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .delete()
    .eq("nSavingsId", id)
    .eq("nUserId", ownerId)
    .select("nSavingsId");

  if (error) throw error;
  return (data?.length ?? 0) > 0;
}
