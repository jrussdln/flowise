/* ------------------------------------------------------------------
   Data access for `tblentries` — four kinds of row:
     cType "L"  a loan's payment schedule, generated when the loan
                activates (nReferenceId = tblloans.nLoanId, dAmount =
                flat-interest installment, cStatus "X" until paid)
     cType "S"  a savings deposit, added from the savings entries modal
                (nReferenceId = tblsavings.nSavingId, cStatus "A",
                created directly through create()/remove())
     cType "C"  a credit-card purchase repayment, created by the FIRST
                payment of a Purchase row (nReferenceId =
                tbltransactions.nTransactionId, dAmount = the purchase
                amount, cStatus "X" until paid — same lifecycle as a
                loan entry)
     cType "B"  a budget-plan line item, added from the budget plan's
                entries modal (nReferenceId = tblbudgetplan.nBudgetPlanId,
                strTitle + dAmount, cStatus "P", nTransactionId NULL —
                a plan is a plan, so it never writes a ledger row)

   PAYMENT LINK: a settled entry points at the tbltransactions row its
   payment generated through `nTransactionId` (null while unpaid). The
   entry controller writes it on PAY, clears it on Undo Payment, and
   creates/deletes it alongside a savings entry. A budget-plan entry
   never has a link — there is no ledger row behind it.

   NOTE: entries carry no nUserId column — ownership is enforced by the
   controller, which verifies the *referenced* row (the loan, saving,
   budget plan or purchase) belongs to the session user before returning
   its entries.

   NOTE: this is the ONLY place that knows the table name/columns.
   ------------------------------------------------------------------ */

import { getSupabase } from "../config/supabase.js";

const TABLE = "tblentries";

/** One reference's entries in schedule order (term 1 first). */
export async function findByReference(cType, nReferenceId) {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select("*")
    .eq("cType", cType)
    .eq("nReferenceId", nReferenceId)
    .order("nEntriesId", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

/** Inserts the whole schedule at once; returns the new rows. */
export async function createMany(rows) {
  if (rows.length === 0) return [];

  const { data, error } = await getSupabase()
    .from(TABLE)
    .insert(rows)
    .select();

  if (error) throw error;
  return data ?? [];
}

/** Removes every entry of one reference; returns the deleted rows
 *  (nEntriesId + nTransactionId) so callers can drop the tbltransactions
 *  rows those entries had generated. */
export async function removeByReference(cType, nReferenceId) {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .delete()
    .eq("cType", cType)
    .eq("nReferenceId", nReferenceId)
    .select("nEntriesId, nTransactionId");

  if (error) throw error;
  return data ?? [];
}

/** One entry by id, or null when it does not exist. */
export async function findById(id) {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select("*")
    .eq("nEntriesId", id)
    .maybeSingle();

  if (error) throw error;
  return data ?? null;
}

/**
 * Updates the editable fields of one entry (currently the budget-plan
 * line items' strTitle / dAmount) and returns the row, or null when it
 * does not exist. The row's own cType / nReferenceId are never touched.
 */
export async function updateFields(id, values) {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .update(values)
    .eq("nEntriesId", id)
    .select()
    .maybeSingle();

  if (error) throw error;
  return data ?? null;
}

/** Inserts a single row (savings entries — loan schedules are built by
 *  the loans controller in one createMany) and returns it. */
export async function create(values) {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .insert([values])
    .select()
    .single();

  if (error) throw error;
  return data;
}

/** Returns true when the row was actually deleted. Entries carry no
 *  nUserId — the controller proves ownership through the referenced row
 *  before calling this. */
export async function remove(id) {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .delete()
    .eq("nEntriesId", id)
    .select("nEntriesId");

  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

/** Entries of several references in one query — used to summarise the
 *  paid/total counts shown on the loan cards, and to attach repayment
 *  entries to the purchases in a credit card's View (nEntriesId +
 *  nTransactionId drive undo and re-payment there). */
export async function findByReferences(cType, nReferenceIds) {
  if (nReferenceIds.length === 0) return [];

  const { data, error } = await getSupabase()
    .from(TABLE)
    .select("nEntriesId, nReferenceId, dAmount, cStatus, nTransactionId")
    .eq("cType", cType)
    .in("nReferenceId", nReferenceIds);

  if (error) throw error;
  return data ?? [];
}

/** Sets cStatus on one entry (X pending / P paid / L late / A advance).
 *  `nTransactionId` is passed whenever the caller knows the link to the
 *  tbltransactions row this payment generated (a number links, null
 *  clears it); leave it undefined to touch nothing. Returns the updated
 *  row (or null). */
export async function setStatus(id, cStatus, nTransactionId) {
  const values = { cStatus };
  if (nTransactionId !== undefined) values.nTransactionId = nTransactionId;

  const { data, error } = await getSupabase()
    .from(TABLE)
    .update(values)
    .eq("nEntriesId", id)
    .select()
    .maybeSingle();

  if (error) throw error;
  return data ?? null;
}

/**
 * Applies settled payments carried across a schedule rebuild — one
 * update per row, since each row restores its own cStatus *and* its own
 * nTransactionId link (the generated tbltransactions row must keep
 * pointing at the term it belongs to).
 * `rows` = [{ nEntriesId, cStatus, nTransactionId }]
 */
export async function setSettledMany(rows) {
  for (const row of rows) {
    const { error } = await getSupabase()
      .from(TABLE)
      .update({
        cStatus: row.cStatus,
        nTransactionId: row.nTransactionId ?? null,
      })
      .eq("nEntriesId", row.nEntriesId);

    if (error) throw error;
  }
}
