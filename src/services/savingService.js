/* ------------------------------------------------------------------
   Saving service — the ONLY place the frontend knows about /api/savings.

   Pages/components call these functions; they never touch Supabase or
   fetch directly. Mirrors the backend model:
     GET    /api/savings      list (the signed-in user's rows)
     GET    /api/savings/:id  single
     POST   /api/savings      create (server assigns strCode, forces
                              cStatus "P" = Pending)
     PUT    /api/savings/:id  update (partial) — { cStatus: "A" } activates,
                              { cStatus: "C" } completes
     DELETE /api/savings/:id  delete

   Entries live in /api/entries but belong to this domain (the loan
   service owns the cType "L" ones):
     GET    /api/entries?cType=S&nReferenceId=<savingId>  list deposits
     POST   /api/entries  { cType: "S", nReferenceId, dAmount }
                               add one deposit (cStatus "A") + its
                               tbltransactions row (cType "S")
     POST   /api/entries  { ..., transfer: true }
                               same deposit, but the row it writes is
                               logged as Income (cType "I", "Transfer
                               to fund") instead of Savings
     DELETE /api/entries/:id  drop a deposit + its transaction
   ------------------------------------------------------------------ */

import { api } from "./api";

export const savingService = {
  async list() {
    const json = await api.get("/savings");
    return json.data ?? [];
  },

  async getById(id) {
    const json = await api.get(`/savings/${id}`);
    return json.data;
  },

  async create(payload) {
    const json = await api.post("/savings", payload);
    return json.data;
  },

  async update(id, payload) {
    const json = await api.put(`/savings/${id}`, payload);
    return json.data;
  },

  async remove(id) {
    await api.delete(`/savings/${id}`);
  },

  /* ---- deposits (tblentries, cType "S") ---------------------------- */

  /** The saving's deposits, oldest row first. */
  async listEntries(savingId) {
    const json = await api.get(`/entries?cType=S&nReferenceId=${savingId}`);
    return json.data ?? [];
  },

  /**
   * Adds ONE deposit and its linked transaction (server-generated).
   * Pass `{ transfer: true }` to log it as an Income transaction
   * ("Transfer to fund") instead of a Savings one. Pass `{ cardId }`
   * when the deposit is paid FROM that card — the ledger row carries
   * the link, so the card's balance is deducted.
   */
  async addEntry(savingId, dAmount, options = {}) {
    const json = await api.post("/entries", {
      cType: "S",
      nReferenceId: savingId,
      dAmount,
      ...(options.transfer ? { transfer: true } : {}),
      ...(options.cardId ? { nCardId: options.cardId } : {}),
    });
    return json.data;
  },

  /** Deletes the deposit AND the transaction it created. */
  async removeEntry(entryId) {
    await api.delete(`/entries/${entryId}`);
  },
};
