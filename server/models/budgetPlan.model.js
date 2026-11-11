/* ------------------------------------------------------------------
   Data access for `tblbudgetplan` (the Budget Plans page).

   Pure Supabase queries — no HTTP/req handling here (that lives in
   server/controllers/budgetPlan.controller.js). Every function throws the
   raw Supabase error on failure; the controller turns it into a JSON
   response.

   EVERY query is scoped by `nUserId`: a user only ever sees or touches
   their own rows (the owner id comes from the session cookie, never
   from a request body). Foreign or missing rows both read as null → 404.

   Columns: nBudgetPlanId (identity PK), strCode, strTitle,
   strDescription, cStatus, dttCreated, nUserId — plus the two cosmetic
   columns the card UI shares with the Loans/Savings grids: strColor
   (accent) and bIsFavorite (pinned to the top of the grid).

   NOTE: a budget plan is a NAMED PLAN only — it carries no amount and
   writes nothing to tbltransactions, so it never touches the ledger.

   NOTE: this is the ONLY place that knows the table name/columns.
   ------------------------------------------------------------------ */

import { getSupabase } from "../config/supabase.js";

const TABLE = "tblbudgetplan";

/** BUD-0001, BUD-0002, ... — padded to 4 digits, wider ids kept whole. */
function makeBudgetPlanCode(id) {
  return `BUD-${String(id).padStart(4, "0")}`;
}

/** All budget plans owned by `nUserId`, newest first. */
export async function findAllForUser(nUserId) {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select("*")
    .eq("nUserId", nUserId)
    // Newest first; nBudgetPlanId is the reliable creation order
    // (dttCreated is nullable and may repeat).
    .order("nBudgetPlanId", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

/** Returns the row when it exists AND belongs to `nUserId`, else null. */
export async function findById(id, nUserId) {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select("*")
    .eq("nBudgetPlanId", id)
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
 * Inserts a row and stamps BUD-<id> from its identity in a second,
 * best-effort write: if that write fails the row is still valid
 * (`strCode` is nullable) — it is logged and the insert is returned as
 * is. Same shape as savingModel.createWithCode.
 */
export async function createWithCode(values) {
  const row = await create(values);
  if (row.strCode) return row;

  try {
    return (
      (await update(row.nBudgetPlanId, { strCode: makeBudgetPlanCode(row.nBudgetPlanId) }, values.nUserId)) ??
      row
    );
  } catch (err) {
    console.warn("[budget-plans] could not assign strCode:", err?.message || err);
    return row;
  }
}

/** Returns the updated row, or null when no row matched `id` for this user. */
export async function update(id, values, nUserId) {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .update(values)
    .eq("nBudgetPlanId", id)
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
    .eq("nBudgetPlanId", id)
    .eq("nUserId", nUserId)
    .select("nBudgetPlanId");

  if (error) throw error;
  return (data?.length ?? 0) > 0;
}
