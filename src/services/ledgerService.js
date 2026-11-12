/* ------------------------------------------------------------------
   Ledger service — the ONLY place the frontend knows about /api/ledger.

   Pages/components call these functions; they never touch Supabase or
   fetch directly.
     GET    /api/ledger      list (newest transaction first)
     GET    /api/ledger/:id  single
     POST   /api/ledger      create
     PUT    /api/ledger/:id  update
     DELETE /api/ledger/:id  delete
   ------------------------------------------------------------------ */

import { api } from "./api";

export const ledgerService = {
  async list() {
    const json = await api.get("/ledger");
    return json.data ?? [];
  },

  async getById(id) {
    const json = await api.get(`/ledger/${id}`);
    return json.data;
  },

  async create(payload) {
    const json = await api.post("/ledger", payload);
    return json.data;
  },

  async update(id, payload) {
    const json = await api.put(`/ledger/${id}`, payload);
    return json.data;
  },

  async remove(id) {
    await api.delete(`/ledger/${id}`);
  },
};
