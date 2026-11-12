/* ------------------------------------------------------------------
   Loan service — the ONLY place the frontend knows about /api/loans.

   Pages/components call these functions; they never touch Supabase or
   fetch directly.
     GET    /api/loans      list
     GET    /api/loans/:id  single
     POST   /api/loans      create
     PUT    /api/loans/:id  update
     DELETE /api/loans/:id  delete
   ------------------------------------------------------------------ */

import { api } from "./api";

export const loanService = {
  async list() {
    const json = await api.get("/loans");
    return json.data ?? [];
  },

  async getById(id) {
    const json = await api.get(`/loans/${id}`);
    return json.data;
  },

  async create(payload) {
    const json = await api.post("/loans", payload);
    return json.data;
  },

  async update(id, payload) {
    const json = await api.put(`/loans/${id}`, payload);
    return json.data;
  },

  async remove(id) {
    await api.delete(`/loans/${id}`);
  },
};
