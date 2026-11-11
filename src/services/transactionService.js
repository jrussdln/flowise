/* ------------------------------------------------------------------
   Transaction service — the ONLY place the frontend knows about
   /api/transactions (the Income/Expense ledger).

   Pages/components call these functions; they never touch Supabase or
   fetch directly. Mirrors the backend model:
     GET    /api/transactions      list
     GET    /api/transactions/:id  single
     POST   /api/transactions      create (server assigns strCode)
     PUT    /api/transactions/:id  update (partial)
     DELETE /api/transactions/:id  delete
   ------------------------------------------------------------------ */

import { api } from "./api";

export const transactionService = {
  async list() {
    const json = await api.get("/transactions");
    return json.data ?? [];
  },

  async getById(id) {
    const json = await api.get(`/transactions/${id}`);
    return json.data;
  },

  async create(payload) {
    const json = await api.post("/transactions", payload);
    return json.data;
  },

  async update(id, payload) {
    const json = await api.put(`/transactions/${id}`, payload);
    return json.data;
  },

  async remove(id) {
    await api.delete(`/transactions/${id}`);
  },
};
