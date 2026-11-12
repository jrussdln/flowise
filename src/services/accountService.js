/* ------------------------------------------------------------------
   Account service — the ONLY place the frontend knows about /api/accounts.

   Pages/components call these functions; they never touch Supabase or
   fetch directly.
     GET    /api/accounts           list
     GET    /api/accounts/balances  live balance per account (view)
     GET    /api/accounts/:id       single
     POST   /api/accounts           create
     PUT    /api/accounts/:id       update
     DELETE /api/accounts/:id       delete
   ------------------------------------------------------------------ */

import { api } from "./api";

export const accountService = {
  async list() {
    const json = await api.get("/accounts");
    return json.data ?? [];
  },

  async balances() {
    const json = await api.get("/accounts/balances");
    return json.data ?? [];
  },

  async getById(id) {
    const json = await api.get(`/accounts/${id}`);
    return json.data;
  },

  async create(payload) {
    const json = await api.post("/accounts", payload);
    return json.data;
  },

  async update(id, payload) {
    const json = await api.put(`/accounts/${id}`, payload);
    return json.data;
  },

  async remove(id) {
    await api.delete(`/accounts/${id}`);
  },
};
