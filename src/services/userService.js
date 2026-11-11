/* ------------------------------------------------------------------
   User service — the ONLY place the frontend knows about /api/users.

   Pages/components call these functions; they never touch Supabase or
   fetch directly. Mirrors the backend model:
     GET    /api/users      list
     GET    /api/users/:id  single
     POST   /api/users      create
     PUT    /api/users/:id  update
     DELETE /api/users/:id  delete
   ------------------------------------------------------------------ */

import { api } from "./api";

export const userService = {
  async list() {
    const json = await api.get("/users");
    return json.data ?? [];
  },

  async getById(id) {
    const json = await api.get(`/users/${id}`);
    return json.data;
  },

  async create(payload) {
    const json = await api.post("/users", payload);
    return json.data;
  },

  async update(id, payload) {
    const json = await api.put(`/users/${id}`, payload);
    return json.data;
  },

  async remove(id) {
    await api.delete(`/users/${id}`);
  },
};
