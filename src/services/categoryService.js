/* ------------------------------------------------------------------
   Category service — the ONLY place the frontend knows about
   /api/categories. Used by the Ledger page's category dropdown and
   the admin Categories page.
     GET    /api/categories          list (all)
     GET    /api/categories?active=1 list (active only — dropdowns)
     GET    /api/categories/:id      single
     POST   /api/categories          create
     PUT    /api/categories/:id      update
     DELETE /api/categories/:id      delete
   ------------------------------------------------------------------ */

import { api } from "./api";

export const categoryService = {
  async list({ activeOnly = false } = {}) {
    const json = await api.get(`/categories${activeOnly ? "?active=1" : ""}`);
    return json.data ?? [];
  },

  async getById(id) {
    const json = await api.get(`/categories/${id}`);
    return json.data;
  },

  async create(payload) {
    const json = await api.post("/categories", payload);
    return json.data;
  },

  async update(id, payload) {
    const json = await api.put(`/categories/${id}`, payload);
    return json.data;
  },

  async remove(id) {
    await api.delete(`/categories/${id}`);
  },
};
