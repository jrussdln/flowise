/* ------------------------------------------------------------------
    Auth service — the ONLY place the frontend knows about /api/auth.

    Pages/components call these functions; they never touch fetch or
    Supabase directly. Mirrors the backend controller:
      POST /api/auth/login    sign in  (sets an httpOnly cookie)
      POST /api/auth/logout   sign out (clears the cookie)
      GET  /api/auth/me       current user (null when not signed in)
    ------------------------------------------------------------------ */

import { api } from "./api";

export const authService = {
  async login(strUserName, strPassword) {
    const json = await api.post("/auth/login", { strUserName, strPassword });
    return json.data;
  },

  async logout() {
    await api.post("/auth/logout");
  },

  /** Restores the session after a refresh. Returns null when signed out. */
  async me() {
    try {
      const json = await api.get("/auth/me");
      return json.data ?? null;
    } catch (err) {
      // 401 = simply not signed in; anything else is a real failure.
      if (err.status === 401) return null;
      throw err;
    }
  },
};
