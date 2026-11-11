/* ------------------------------------------------------------------
   Budget plan service — the ONLY place the frontend knows about
   /api/budget-plans.

   Pages/components call these functions; they never touch Supabase or
   fetch directly. Mirrors the backend model:
     GET    /api/budget-plans      list (the signed-in user's rows)
     GET    /api/budget-plans/:id  single
     POST   /api/budget-plans      create (server assigns strCode, forces
                                   cStatus "P" = Pending)
     PUT    /api/budget-plans/:id  update (partial) — { cStatus: "A" }
                                   activates, { cStatus: "C" } completes
     DELETE /api/budget-plans/:id  delete

   A budget plan is a NAMED PLAN: it carries no amount of its own, but
   it holds line items (tblentries, cType "B") — a title and an amount
   each. Those entries are plain rows: no ledger row is written behind
   them, so nothing here touches tbltransactions.
   ------------------------------------------------------------------ */

import { api } from "./api";

export const budgetPlanService = {
  async list() {
    const json = await api.get("/budget-plans");
    return json.data ?? [];
  },

  async getById(id) {
    const json = await api.get(`/budget-plans/${id}`);
    return json.data;
  },

  async create(payload) {
    const json = await api.post("/budget-plans", payload);
    return json.data;
  },

  async update(id, payload) {
    const json = await api.put(`/budget-plans/${id}`, payload);
    return json.data;
  },

  async remove(id) {
    await api.delete(`/budget-plans/${id}`);
  },

  /* ---- entries (tblentries, cType "B") ----------------------------- */

  /** The plan's line items, oldest row first. */
  async listEntries(planId) {
    const json = await api.get(`/entries?cType=B&nReferenceId=${planId}`);
    return json.data ?? [];
  },

  /**
   * Adds ONE line item to the plan — a title and an amount. The server
   * writes it with cStatus "P" and no transaction link.
   */
  async addEntry(planId, { strTitle, dAmount }) {
    const json = await api.post("/entries", {
      cType: "B",
      nReferenceId: planId,
      strTitle,
      dAmount,
    });
    return json.data;
  },

  /** Deletes one line item (nothing else hangs off it). */
  async removeEntry(entryId) {
    await api.delete(`/entries/${entryId}`);
  },

  /**
   * Edits one line item — its title and/or its amount. Partial update:
   * a key left out keeps its stored value.
   */
  async updateEntry(entryId, { strTitle, dAmount }) {
    const json = await api.put(`/entries/${entryId}`, { strTitle, dAmount });
    return json.data;
  },
};
