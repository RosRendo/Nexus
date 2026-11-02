import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api } from "@/lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);

  const checkAuth = useCallback(async () => {
    try {
      const { data } = await api.get("/auth/me");
      setUser(data);
    } catch (e) {
      try {
        await api.post("/auth/refresh");
        const { data } = await api.get("/auth/me");
        setUser(data);
      } catch (err) {
        setUser(false);
      }
    }
  }, []);

  useEffect(() => {
    // Skip /me while an OAuth callback is exchanging its session_id.
    if (window.location.hash?.includes("session_id=")) {
      setUser(false);
      return;
    }
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    const onUnauth = () => setUser(false);
    window.addEventListener("fos:unauthorized", onUnauth);
    return () => window.removeEventListener("fos:unauthorized", onUnauth);
  }, []);

  const logout = async () => {
    await api.post("/auth/logout").catch(() => null);
    setUser(false);
  };

  return <AuthContext.Provider value={{ user, setUser, logout, checkAuth }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
