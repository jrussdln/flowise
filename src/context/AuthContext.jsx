import { useCallback, useEffect, useState } from "react";
import { AuthContext } from "../hooks/useAuth.js";
import { authService } from "../services/authService.js";

/**
 * Keeps the signed-in user in memory for the whole app.
 * On mount it asks GET /api/auth/me (httpOnly cookie) to restore the
 * session after a page refresh; `loading` stays true until that answers
 * so protected routes can wait instead of flashing the login page.
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const current = await authService.me();
        if (alive) setUser(current);
      } catch {
        // Network/server hiccup — start signed out rather than crash.
        if (alive) setUser(null);
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  const login = useCallback(async (strUserName, strPassword) => {
    const signedIn = await authService.login(strUserName, strPassword);
    setUser(signedIn);
    return signedIn;
  }, []);

  const logout = useCallback(async () => {
    try {
      await authService.logout();
    } finally {
      setUser(null);
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
