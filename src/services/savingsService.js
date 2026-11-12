/* ------------------------------------------------------------------
   Savings service — the ONLY place the frontend knows about /api/savings.

   Pages/components call these functions; they never touch Supabase or
   fetch directly.
     GET    /api/savings      list
     GET    /api/savings/:id  single
     POST   /api/savings      create
     PUT    /api/savings/:id  update
     DELETE /api/savings/:id  delete
   ------------------------------------------------------------------ */

import { api } from "./api";

export const savingsService = {
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
};
