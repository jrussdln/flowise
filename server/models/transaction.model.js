/* ------------------------------------------------------------------
   Data access for `tbltransactions` (Income/Expense ledger).

   Pure Supabase queries — no HTTP/req handling here (that lives in
   server/controllers/transaction.controller.js). Every function throws
   the raw Supabase error on failure; the controller turns it into a
   JSON response.

   EVERY query is scoped by `nUserId`: a user only ever sees or touches
   their own rows (the owner id comes from the session cookie, never
   from a request body). Foreign or missing rows both read as null → 404.

   NOTE: this is the ONLY place that knows the table name/columns.
   ------------------------------------------------------------------ */

import { getSupabase } from "../config/supabase.js";

const TABLE = "tbltransactions";

/** TXN-0001, TXN-0002, ... — padded to 4 digits, wider ids kept whole. */
function makeTransactionCode(id) {
  return `TXN-${String(id).padStart(4, "0")}`;
}

/** All transactions owned by `nUserId`, newest first. */
export async function findAllForUser(nUserId) {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select("*")
    .eq("nUserId", nUserId)
    // Newest first; nTransactionId is the reliable creation order
    // (dttCreated is nullable and may repeat).
    .order("nTransactionId", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

/** Returns the row when it exists AND belongs to `nUserId`, else null. */
export async function findById(id, nUserId) {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select("*")
    .eq("nTransactionId", id)
    .eq("nUserId", nUserId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

/** Every transaction charged to `nCardId` (tbltransactions.nCardId),
 *  newest first — backs GET /api/cards/:id/transactions and the card's
 *  own balance arithmetic. */
export async function findByCard(nCardId, nUserId) {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select("*")
    .eq("nCardId", nCardId)
    .eq("nUserId", nUserId)
    .order("nTransactionId", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

/** Sums every card's balance in one query — money landing ON a card is
 *  Income (I) or a REPAYMENT (P linked to a card: a credit-card purchase
 *  being paid off — the row is written by the entries controller and
 *  linked to the CREDIT card; loan Payment rows carry no card link, so
 *  they never appear here). Everything else linked to a card is money
 *  out: Expense (E — including a savings deposit / loan installment /
 *  repayment paid FROM the card, written by the entries modal) and
 *  Purchase (B). Returns a Map keyed by nCardId. */
export async function sumByCard(nUserIds) {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select("nCardId, cType, dAmount")
    .eq("nUserId", nUserIds)
    .not("nCardId", "is", null);

  if (error) throw error;

  const balances = new Map();
  for (const row of data ?? []) {
    const current = balances.get(row.nCardId) || 0;
    const amount = Number(row.dAmount) || 0;
    // Income lands on a card, and so does a repayment of the charges
    // on it; an S/E row here carries nCardId, i.e. money leaving it.
    const moneyIn = row.cType === "I" || row.cType === "P";
    balances.set(row.nCardId, current + (moneyIn ? amount : -amount));
  }
  return balances;
}

/** Deletes every transaction charged to a card (the card itself is
 *  going away); returns how many were deleted. */
export async function removeByCard(nCardId, nUserId) {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .delete()
    .eq("nCardId", nCardId)
    .eq("nUserId", nUserId)
    .select("nTransactionId");

  if (error) throw error;
  return data?.length ?? 0;
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
 * Inserts a row and stamps TXN-<id> from its identity in a second,
 * best-effort write: if that write fails the row is still valid
 * (`strCode` is nullable) — it is logged and the insert is returned as
 * is. Used by the transactions controller (manual rows) and by the
 * entries controller (generated loan payments), so every row in the
 * ledger gets a code the same way.
 */
export async function createWithCode(values) {
  const row = await create(values);
  if (row.strCode) return row;

  try {
    return (
      (await update(row.nTransactionId, { strCode: makeTransactionCode(row.nTransactionId) }, values.nUserId)) ??
      row
    );
  } catch (err) {
    console.warn("[transactions] could not assign strCode:", err?.message || err);
    return row;
  }
}

/** Returns the updated row, or null when no row matched `id` for this user. */
export async function update(id, values, nUserId) {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .update(values)
    .eq("nTransactionId", id)
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
    .eq("nTransactionId", id)
    .eq("nUserId", nUserId)
    .select("nTransactionId");

  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

/** Deletes several of the user's rows at once (generated loan payments
 *  whose schedule or loan went away); returns how many were deleted. */
export async function removeMany(ids, nUserId) {
  if (ids.length === 0) return 0;

  const { data, error } = await getSupabase()
    .from(TABLE)
    .delete()
    .in("nTransactionId", ids)
    .eq("nUserId", nUserId)
    .select("nTransactionId");

  if (error) throw error;
  return data?.length ?? 0;
}
