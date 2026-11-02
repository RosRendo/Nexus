import "@/App.css";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { UIProvider } from "@/context/UIContext";
import { AppShell } from "@/components/layout/AppShell";
import Login, { AuthCallback } from "@/pages/Login";
import MissionControl from "@/pages/MissionControl";
import { AttentionPage, ActivityPage } from "@/pages/Feeds";
import Projects from "@/pages/Projects";
import ProjectWorkspace from "@/pages/ProjectWorkspace";
import Tasks from "@/pages/Tasks";
import { RoadmapsPage, DocumentationPage } from "@/pages/Workspace";
import Integrations from "@/pages/Integrations";
import Account from "@/pages/Account";
import OpsPage from "@/pages/Operations";
import ObsPage from "@/pages/Observability";
import BusinessPage from "@/pages/Business";
import Notifications from "@/pages/Notifications";

const OPS = ["deployments", "infrastructure", "databases", "domains", "jobs"];
const OBS = ["health", "logs", "errors", "performance", "uptime", "analytics"];
const BIZ = ["revenue", "expenses", "subscriptions", "customers"];

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 15000, retry: 1, refetchOnWindowFocus: true } } });

function Protected({ children }) {
  const { user } = useAuth();
  if (user === null) return <div className="min-h-screen bg-bg0 flex items-center justify-center"><div className="skeleton w-40 h-2" /></div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function AppRouter() {
  const location = useLocation();
  if (location.hash?.includes("session_id=")) return <AuthCallback />;
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<Protected><UIProvider><AppShell /></UIProvider></Protected>}>
        <Route path="/" element={<MissionControl />} />
        <Route path="/attention" element={<AttentionPage />} />
        <Route path="/activity" element={<ActivityPage />} />
        <Route path="/projects" element={<Projects />} />
        <Route path="/projects/:id" element={<ProjectWorkspace />} />
        <Route path="/projects/:id/:tab" element={<ProjectWorkspace />} />
        <Route path="/tasks" element={<Tasks />} />
        <Route path="/roadmaps" element={<RoadmapsPage mode="timeline" />} />
        <Route path="/milestones" element={<RoadmapsPage mode="milestones" />} />
        <Route path="/docs" element={<DocumentationPage />} />
        <Route path="/integrations" element={<Integrations />} />
        <Route path="/account" element={<Account />} />
        {OPS.map((p) => <Route key={p} path={`/${p}`} element={<OpsPage page={p} />} />)}
        {OBS.map((p) => <Route key={p} path={`/${p}`} element={<ObsPage page={p} />} />)}
        {BIZ.map((p) => <Route key={p} path={`/${p}`} element={<BusinessPage page={p} />} />)}
        <Route path="/notifications" element={<Notifications />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <div className="App dark">
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AuthProvider>
            <AppRouter />
          </AuthProvider>
        </BrowserRouter>
        <Toaster theme="dark" position="bottom-right" toastOptions={{ style: { background: "#18181B", border: "1px solid rgba(255,255,255,0.08)", color: "#F5F5F7", fontSize: 12.5 } }} />
      </QueryClientProvider>
    </div>
  );
}
