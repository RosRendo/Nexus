import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, errMsg } from "./api";

const get = (url, params) => api.get(url, { params }).then((r) => r.data);
const q = (key, url, params, opts = {}) => ({ queryKey: [key, params], queryFn: () => get(url, params), ...opts });

export const useProjects = (params = {}) => useQuery(q("projects", "/projects", params));
export const useProject = (id) => useQuery(q("project", `/projects/${id}`, undefined, { enabled: !!id }));
export const useTasks = (params = {}) => useQuery(q("tasks", "/tasks", params));
export const useToday = () => useQuery(q("today", "/today"));
export const useMilestones = (params = {}) => useQuery(q("milestones", "/milestones", params));
export const useDocs = (params = {}) => useQuery(q("docs", "/documents", params));
export const useActivity = (params = {}) => useQuery(q("activity", "/activity", params));
export const useAttention = (params = {}) => useQuery(q("attention", "/attention", params));
export const useDashboard = () => useQuery(q("dashboard", "/dashboard"));
export const useIntegrations = () => useQuery(q("integrations", "/integrations"));
export const useWelcome = () => useQuery(q("welcome", "/workspace/welcome"));
export const useAuditLogs = () => useQuery(q("audit", "/audit-logs"));
export const useSearch = (term) => useQuery(q("search", "/search", { q: term }, { enabled: term.length > 1, staleTime: 10000 }));
export const useGithub = (id) => useQuery(q("github", `/projects/${id}/github`, undefined, { enabled: !!id, staleTime: 60000, retry: false }));

export const useOps = (kind, params = {}) => useQuery(q(`ops-${kind}`, `/ops/${kind}`, params));
export const useObs = (path, params = {}) => useQuery(q(`obs-${path}`, `/obs/${path}`, params));
export const useGet = (key, url, params, opts) => useQuery(q(key, url, params, opts));

export const opsActions = {
  create: (kind) => (body) => api.post(`/ops/${kind}`, body).then((r) => r.data),
  update: (kind) => ({ id, ...body }) => api.patch(`/ops/${kind}/${id}`, body).then((r) => r.data),
  remove: (kind) => ({ id, confirm = "" }) => api.post(`/ops/${kind}/${id}/delete`, { confirm }).then((r) => r.data),
};

export function useAction(fn, { success, onDone } = {}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (data) => {
      qc.invalidateQueries({ predicate: (query) => !["github"].includes(query.queryKey[0]) });
      if (success) toast.success(success);
      if (onDone) onDone(data);
    },
    onError: (e) => toast.error(errMsg(e)),
  });
}

export const actions = {
  createProject: (body) => api.post("/projects", body).then((r) => r.data),
  updateProject: ({ id, ...body }) => api.patch(`/projects/${id}`, body).then((r) => r.data),
  bulkProjects: (body) => api.post("/projects/bulk", body).then((r) => r.data),
  deleteProject: ({ id, confirm_name }) => api.post(`/projects/${id}/delete`, { confirm_name }).then((r) => r.data),
  restoreProject: (id) => api.post(`/projects/${id}/restore`).then((r) => r.data),
  createTask: (body) => api.post("/tasks", body).then((r) => r.data),
  updateTask: ({ id, ...body }) => api.patch(`/tasks/${id}`, body).then((r) => r.data),
  deleteTask: (id) => api.delete(`/tasks/${id}`).then((r) => r.data),
  createMilestone: (body) => api.post("/milestones", body).then((r) => r.data),
  updateMilestone: ({ id, ...body }) => api.patch(`/milestones/${id}`, body).then((r) => r.data),
  deleteMilestone: (id) => api.delete(`/milestones/${id}`).then((r) => r.data),
  createDoc: (body) => api.post("/documents", body).then((r) => r.data),
  updateDoc: ({ id, ...body }) => api.patch(`/documents/${id}`, body).then((r) => r.data),
  deleteDoc: (id) => api.delete(`/documents/${id}`).then((r) => r.data),
  ackAlert: (id) => api.post(`/attention/${id}/ack`).then((r) => r.data),
  welcome: (action) => api.post("/workspace/welcome", { action }).then((r) => r.data),
};
