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
        const refreshToken = localStorage.getItem("fos_refresh_token");
        const { data: refData } = await api.post("/auth/refresh", { refresh_token: refreshToken });
        if (refData?.access_token) {
          localStorage.setItem("fos_token", refData.access_token);
        }
        if (refData?.refresh_token) {
          localStorage.setItem("fos_refresh_token", refData.refresh_token);
        }
        const { data } = await api.get("/auth/me");
        setUser(data);
      } catch (err) {
        localStorage.removeItem("fos_token");
        localStorage.removeItem("fos_refresh_token");
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
    const onUnauth = () => {
      localStorage.removeItem("fos_token");
      localStorage.removeItem("fos_refresh_token");
      setUser(false);
    };
    window.addEventListener("fos:unauthorized", onUnauth);
    return () => window.removeEventListener("fos:unauthorized", onUnauth);
  }, []);

  const logout = async () => {
    await api.post("/auth/logout").catch(() => null);
    localStorage.removeItem("fos_token");
    localStorage.removeItem("fos_refresh_token");
    setUser(false);
  };

  return <AuthContext.Provider value={{ user, setUser, logout, checkAuth }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
