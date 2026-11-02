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
      .then(({ data }) => { setUser(data); navigate("/", { replace: true, state: { user: data } }); })
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
          <h1 className="text-5xl xl:text-6xl font-semibold tracking-tight leading-[1.02]">One portfolio.<br />Many projects.<br /><span className="text-mute">One control center.</span></h1>
          <div className="mt-10 grid grid-cols-3 gap-6 max-w-lg">
            {[["What's broken", "Attention Center"], ["What's next", "Today"], ["How it's going", "Mission Control"]].map(([q, a]) => (
              <div key={q} className="border-t border-line pt-3"><div className="text-[12.5px]">{q}</div><div className="text-[11.5px] text-mute mt-0.5">{a}</div></div>
            ))}
          </div>
        </div>
        <div className="text-[11.5px] text-mute">Private workspace · owner access only</div>
      </div>
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-[340px]">
          <h2 className="text-[22px] font-semibold tracking-tight">Sign in</h2>
          <p className="text-mute text-[12.5px] mt-1 mb-7">Only allow-listed owner accounts can enter.</p>
          <button data-testid="login-google-btn" onClick={google} className="btn btn-outline w-full justify-center h-9">
            <svg width="14" height="14" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" /><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" /><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" /><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" /></svg>
            Continue with Google
          </button>
          <div className="flex items-center gap-3 my-5 text-[11px] text-mute"><span className="h-px flex-1 bg-line" />or<span className="h-px flex-1 bg-line" /></div>
          <form onSubmit={submit} className="space-y-3">
            <Field label="Email"><input data-testid="login-email-input" type="email" autoComplete="email" required className="fos-input h-9" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
            <Field label="Password"><input data-testid="login-password-input" type="password" autoComplete="current-password" required className="fos-input h-9" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
            {error && <div data-testid="login-error" className="text-[12px] text-bad">{error}</div>}
            <button data-testid="login-submit-btn" type="submit" disabled={busy} className="btn btn-primary w-full justify-center h-9">{busy ? "Signing in…" : "Sign in"}</button>
          </form>
        </div>
      </div>
    </div>
  );
}
