import {
  Gauge, Siren, Activity, FolderKanban, ListChecks, Map, Flag, BookOpen, Rocket, Server, Database, Globe,
  Timer, HeartPulse, ScrollText, Bug, Zap, RadioTower, BarChart3, DollarSign, Receipt, Repeat, Users,
  Plug, Bell, ShieldCheck,
} from "lucide-react";

export const STAGES = [
  { key: "idea", label: "Idea", color: "#636366" },
  { key: "planning", label: "Planning", color: "#A1A1A6" },
  { key: "development", label: "Development", color: "#0A84FF" },
  { key: "testing", label: "Testing", color: "#64D2FF" },
  { key: "staging", label: "Staging", color: "#FF9F0A" },
  { key: "production", label: "Production", color: "#30D158" },
  { key: "maintenance", label: "Maintenance", color: "#7FB98A" },
  { key: "archived", label: "Archived", color: "#48484A" },
];
export const STAGE = Object.fromEntries(STAGES.map((s) => [s.key, s]));

export const PRIORITIES = [
  { key: "urgent", label: "Urgent", color: "#FF453A", bars: 4 },
  { key: "high", label: "High", color: "#FF9F0A", bars: 3 },
  { key: "medium", label: "Medium", color: "#F5F5F7", bars: 2 },
  { key: "low", label: "Low", color: "#929299", bars: 1 },
];
export const PRIORITY = Object.fromEntries(PRIORITIES.map((p) => [p.key, p]));

export const TASK_STATUSES = [
  { key: "backlog", label: "Backlog", color: "#929299" },
  { key: "in_progress", label: "In Progress", color: "#0A84FF" },
  { key: "review", label: "Review", color: "#BF5AF2" },
  { key: "completed", label: "Completed", color: "#30D158" },
  { key: "blocked", label: "Blocked", color: "#FF453A" },
];
export const TASK_STATUS = Object.fromEntries(TASK_STATUSES.map((s) => [s.key, s]));

export const HEALTH = {
  healthy: { label: "Healthy", color: "#30D158" },
  degraded: { label: "Degraded", color: "#FF9F0A" },
  down: { label: "Down", color: "#FF453A" },
};

export const SEVERITY = {
  critical: { label: "Critical", color: "#FF453A" },
  high: { label: "High", color: "#FF7A3D" },
  medium: { label: "Medium", color: "#FF9F0A" },
  low: { label: "Low", color: "#929299" },
};

export const DOC_CATEGORIES = ["architecture", "api", "schema", "deployment", "runbook", "other"];

export const NAV = [
  { group: "Overview", items: [
    { label: "Mission Control", path: "/", icon: Gauge, shortcut: "G M" },
    { label: "Attention Center", path: "/attention", icon: Siren, shortcut: "G A" },
    { label: "Activity Feed", path: "/activity", icon: Activity },
  ] },
  { group: "Workspace", items: [
    { label: "All Projects", path: "/projects", icon: FolderKanban, shortcut: "G P" },
    { label: "Tasks & Issues", path: "/tasks", icon: ListChecks, shortcut: "G T" },
    { label: "Roadmaps", path: "/roadmaps", icon: Map },
    { label: "Milestones", path: "/milestones", icon: Flag },
    { label: "Documentation", path: "/docs", icon: BookOpen },
  ] },
  { group: "Operations", items: [
    { label: "Deployments", path: "/deployments", icon: Rocket, phase: 2, preview: ["Deployment history across GitHub, Vercel, Railway, AWS EC2 and Docker", "Commit SHA, branch, author, build duration and environment per deploy", "Streaming deployment logs and failed-build alerts", "Controlled rollback with typed confirmation and audit trail"] },
    { label: "Infrastructure", path: "/infrastructure", icon: Server, phase: 2, preview: ["VPS, cloud instances, Docker containers and PM2 processes", "CPU, RAM, disk and network per resource, tied to a project", "Multiple providers — no assumption of a single server", "Resource threshold alerts into the Attention Center"] },
    { label: "Databases", path: "/databases", icon: Database, phase: 2, preview: ["PostgreSQL, MySQL and Redis instances per project", "Connection counts, pool saturation and replication health", "Backup status and last successful snapshot"] },
    { label: "Domains & SSL", path: "/domains", icon: Globe, phase: 2, preview: ["Domain inventory with DNS provider", "SSL certificate expiry countdown and renewal alerts"] },
    { label: "Background Jobs", path: "/jobs", icon: Timer, phase: 2, preview: ["Queues, workers and scheduled jobs per project", "Failure rates, retries and stuck-job detection"] },
  ] },
  { group: "Observability", items: [
    { label: "System Health", path: "/health", icon: HeartPulse, phase: 2, preview: ["Portfolio health matrix by service and environment"] },
    { label: "Logs Explorer", path: "/logs", icon: ScrollText, phase: 2, preview: ["Search logs by project, environment, severity, time range and service"] },
    { label: "Error Tracking", path: "/errors", icon: Bug, phase: 2, preview: ["Grouped errors with expandable stack traces", "First seen, last seen, frequency and affected users"] },
    { label: "API Performance", path: "/performance", icon: Zap, phase: 2, preview: ["Request volume and p50 / p95 / p99 latency per endpoint"] },
    { label: "Uptime Monitoring", path: "/uptime", icon: RadioTower, phase: 2, preview: ["HTTP checks per URL with incident history"] },
    { label: "Analytics", path: "/analytics", icon: BarChart3, phase: 3, preview: ["Traffic and active users per project via PostHog"] },
  ] },
  { group: "Business", items: [
    { label: "Revenue", path: "/revenue", icon: DollarSign, phase: 3, preview: ["Portfolio MRR, one-time revenue and history", "Manual figures labeled apart from verified payment-provider data"] },
    { label: "Expenses", path: "/expenses", icon: Receipt, phase: 3, preview: ["Hosting and API costs per project", "Monthly expense breakdown"] },
    { label: "Subscriptions", path: "/subscriptions", icon: Repeat, phase: 3, preview: ["Customer subscriptions, churn and plan mix"] },
    { label: "Customers", path: "/customers", icon: Users, phase: 3, preview: ["Customer list per product with lifetime value"] },
  ] },
  { group: "Settings", items: [
    { label: "Integrations", path: "/integrations", icon: Plug },
    { label: "Notifications", path: "/notifications", icon: Bell, phase: 3, preview: ["Notification delivery by email and push", "Per-project rules (already editable in each project's Settings tab)"] },
    { label: "Account & Security", path: "/account", icon: ShieldCheck },
  ] },
];

NAV.forEach((g) => g.items.forEach((i) => { delete i.phase; delete i.preview; }));
export const NAV_ITEMS = NAV.flatMap((g) => g.items);
