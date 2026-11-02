import { useEffect, useRef, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { api, errMsg } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Field } from "@/components/common";

export function AuthCallback() {
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    const sid = new URLSearchParams(location.hash.slice(1)).get("session_id");
    api.post("/auth/google/session", { session_id: sid })
      .then(({ data }) => {
        if (data.access_token) localStorage.setItem("fos_token", data.access_token);
        if (data.session_token) localStorage.setItem("fos_token", data.session_token);
        setUser(data);
        navigate("/", { replace: true, state: { user: data } });
      })
      .catch((e) => navigate("/login", { replace: true, state: { error: errMsg(e) } }));
  }, [location.hash, navigate, setUser]);
  return <div className="min-h-screen bg-bg0" />;
}

export default function Login() {
  const { user, setUser } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(location.state?.error || "");
  const [busy, setBusy] = useState(false);
  if (user) return <Navigate to="/" replace />;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { data } = await api.post("/auth/login", { email, password });
      if (data.access_token) {
        localStorage.setItem("fos_token", data.access_token);
      }
      if (data.refresh_token) {
        localStorage.setItem("fos_refresh_token", data.refresh_token);
      }
      setUser(data);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  const google = () => {
    // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    const redirectUrl = window.location.origin + "/";
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };

  return (
    <div className="min-h-screen bg-bg0 grid lg:grid-cols-[1.1fr_1fr]">
      <div className="hidden lg:flex flex-col justify-between p-12 border-r border-line">
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 rounded-[6px] bg-ink text-bg0 flex items-center justify-center text-[11px] font-bold">F</span>
          <span className="text-[14px] font-semibold tracking-tight">Founder OS</span>
        </div>
        <div>
          <div className="section-label mb-4">Multi-project command center</div>
          <h1 className="text-3xl font-semibold tracking-tight leading-tight max-w-md">Run all your ventures from a single surface.</h1>
          <p className="text-muted text-[13px] mt-4 leading-relaxed max-w-md">Unified telemetry, release trains, task boards, docs, and audit trails for indie founders.</p>
        </div>
        <div className="text-[12px] text-subtle font-mono">v1.0 · production ready</div>
      </div>
      <div className="flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          <div className="mb-8">
            <h2 className="text-xl font-semibold tracking-tight">Sign in</h2>
            <p className="text-[13px] text-muted mt-1">Access your founder dashboard.</p>
          </div>
          {error && <div className="mb-4 p-3 text-[13px] text-red-400 bg-red-950/40 border border-red-800/40 rounded-[6px]">{error}</div>}
          <form onSubmit={submit} className="space-y-4">
            <Field label="Email">
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="input-base" placeholder="you@example.com" autoFocus />
            </Field>
            <Field label="Password">
              <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="input-base" placeholder="••••••••" />
            </Field>
            <button type="submit" disabled={busy} className="btn-primary w-full justify-center">
              {busy ? "Signing in..." : "Continue"}
            </button>
          </form>
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-line" /></div>
            <div className="relative flex justify-center text-[11px] uppercase tracking-wider text-subtle"><span className="bg-bg0 px-2">or</span></div>
          </div>
          <button type="button" onClick={google} className="btn-secondary w-full justify-center">Sign in with Google</button>
        </div>
      </div>
    </div>
  );
}
