import axios from "axios";

export const API = process.env.REACT_APP_BACKEND_URL
  ? `${process.env.REACT_APP_BACKEND_URL}/api`
  : "/api";
export const api = axios.create({
  baseURL: API,
  withCredentials: true,
  headers: {
    "ngrok-skip-browser-warning": "true",
  },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("fos_token");
  if (token && !config.headers.Authorization) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

let refreshing = null;
api.interceptors.response.use(
  (r) => r,
  async (error) => {
    const cfg = error.config || {};
    if (error.response?.status === 401 && !cfg._retry && !String(cfg.url).includes("/auth/")) {
      cfg._retry = true;
      const refreshToken = localStorage.getItem("fos_refresh_token");
      refreshing =
        refreshing ||
        api
          .post("/auth/refresh", { refresh_token: refreshToken })
          .then((res) => {
            if (res.data?.access_token) {
              localStorage.setItem("fos_token", res.data.access_token);
            }
          })
          .finally(() => {
            refreshing = null;
          });
      try {
        await refreshing;
        const token = localStorage.getItem("fos_token");
        if (token) {
          cfg.headers.Authorization = `Bearer ${token}`;
        }
        return api(cfg);
      } catch (e) {
        localStorage.removeItem("fos_token");
        localStorage.removeItem("fos_refresh_token");
        window.dispatchEvent(new Event("fos:unauthorized"));
      }
    }
    return Promise.reject(error);
  }
);

export function errMsg(e) {
  const detail = e?.response?.data?.detail;
  if (!e?.response && e?.message) return navigator.onLine ? e.message : "You are offline";
  if (detail == null) return "Something went wrong. Please try again.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail.map((d) => d?.msg || JSON.stringify(d)).join(" ");
  return detail.msg || String(detail);
}
