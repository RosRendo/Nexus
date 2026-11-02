import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { STAGES, PRIORITIES } from "@/lib/constants";
import { useUI } from "@/context/UIContext";
import { actions, useAction } from "@/lib/queries";
import { Field } from "@/components/common";

export const projectToForm = (p) => ({
  name: p?.name || "",
  slug: p?.slug || "",
  description: p?.description || "",
  logo_url: p?.logo_url || "",
  category: p?.category || "",
  priority: p?.priority || "medium",
  stage: p?.stage || "idea",
  tagsText: (p?.tags || []).join(", "),
  repo: p?.dev?.repo || "",
  branch: p?.dev?.branch || "main",
  stackText: (p?.dev?.stack || []).join(", "),
  framework: p?.dev?.framework || "",
  database: p?.dev?.database || "",
  architecture_notes: p?.dev?.architecture_notes || "",
  production_url: p?.prod?.production_url || "",
  preview_url: p?.prod?.preview_url || "",
  backend_url: p?.prod?.backend_url || "",
  hosting_provider: p?.prod?.hosting_provider || "",
  deployment_provider: p?.prod?.deployment_provider || "",
  environment_notes: p?.prod?.environment_notes || "",
  monitoring_notes: p?.prod?.monitoring_notes || "",
  revenue_model: p?.business?.revenue_model || "",
  monthly_revenue: p?.business?.monthly_revenue ?? "",
  monthly_expenses: p?.business?.monthly_expenses ?? "",
  subscriptions: p?.business?.subscriptions ?? "",
  customers: p?.business?.customers ?? "",
});

export const formToPayload = (f) => ({
  name: f.name.trim(),
  ...(f.slug ? { slug: f.slug.trim() } : {}),
  description: f.description || "",
  logo_url: f.logo_url || "",
  category: f.category || "",
  priority: f.priority || "medium",
  stage: f.stage || "idea",
  tags: (f.tagsText || "").split(",").map((x) => x.trim()).filter(Boolean),
  dev: {
    repo: f.repo || "",
    branch: f.branch || "main",
    stack: (f.stackText || "").split(",").map((x) => x.trim()).filter(Boolean),
    framework: f.framework || "",
    database: f.database || "",
    architecture_notes: f.architecture_notes || "",
  },
  prod: {
    production_url: f.production_url || "",
    preview_url: f.preview_url || "",
    backend_url: f.backend_url || "",
    hosting_provider: f.hosting_provider || "",
    deployment_provider: f.deployment_provider || "",
    environment_notes: f.environment_notes || "",
    monitoring_notes: f.monitoring_notes || "",
  },
  business: {
    revenue_model: f.revenue_model || "",
    monthly_revenue: f.monthly_revenue === "" ? 0 : Number(f.monthly_revenue),
    monthly_expenses: f.monthly_expenses === "" ? 0 : Number(f.monthly_expenses),
    subscriptions: f.subscriptions === "" ? 0 : Number(f.subscriptions),
    customers: f.customers === "" ? 0 : Number(f.customers),
  },
});

export function ProjectFields({ value, onChange, section }) {
  const set = (k, v) => onChange((prev) => ({ ...prev, [k]: v }));

  const identityFields = (
    <div className="space-y-3">
      <Field label="Project name *">
        <input
          data-testid="project-field-name"
          autoFocus={section === "identity"}
          className="fos-input"
          placeholder="e.g. Acme SaaS"
          value={value.name}
          onChange={(e) => set("name", e.target.value)}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Slug" hint="Leave blank to auto-generate">
          <input
            data-testid="project-field-slug"
            className="fos-input"
            placeholder="acme-saas"
            value={value.slug}
            onChange={(e) => set("slug", e.target.value)}
          />
        </Field>
        <Field label="Category">
          <input
            data-testid="project-field-category"
            className="fos-input"
            placeholder="e.g. B2B, AI, Tool"
            value={value.category}
            onChange={(e) => set("category", e.target.value)}
          />
        </Field>
      </div>
      <Field label="Description">
        <textarea
          data-testid="project-field-description"
          rows={3}
          className="fos-input"
          placeholder="Short summary of this project..."
          value={value.description}
          onChange={(e) => set("description", e.target.value)}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Stage">
          <select
            data-testid="project-field-stage"
            className="fos-input"
            value={value.stage}
            onChange={(e) => set("stage", e.target.value)}
          >
            {STAGES.map((s) => (
              <option key={s.key} value={s.key}>{s.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Priority">
          <select
            data-testid="project-field-priority"
            className="fos-input"
            value={value.priority}
            onChange={(e) => set("priority", e.target.value)}
          >
            {PRIORITIES.map((p) => (
              <option key={p.key} value={p.key}>{p.label}</option>
            ))}
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Logo URL">
          <input
            data-testid="project-field-logo"
            className="fos-input"
            placeholder="https://..."
            value={value.logo_url}
            onChange={(e) => set("logo_url", e.target.value)}
          />
        </Field>
        <Field label="Tags" hint="Comma separated">
          <input
            data-testid="project-field-tags"
            className="fos-input"
            placeholder="saas, b2b, automation"
            value={value.tagsText}
            onChange={(e) => set("tagsText", e.target.value)}
          />
        </Field>
      </div>
    </div>
  );

  const developmentFields = (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Repository">
          <input
            data-testid="project-field-repo"
            className="fos-input"
            placeholder="owner/repo"
            value={value.repo}
            onChange={(e) => set("repo", e.target.value)}
          />
        </Field>
        <Field label="Default branch">
          <input
            data-testid="project-field-branch"
            className="fos-input"
            placeholder="main"
            value={value.branch}
            onChange={(e) => set("branch", e.target.value)}
          />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Framework">
          <input
            data-testid="project-field-framework"
            className="fos-input"
            placeholder="React, Next.js, FastAPI..."
            value={value.framework}
            onChange={(e) => set("framework", e.target.value)}
          />
        </Field>
        <Field label="Database">
          <input
            data-testid="project-field-database"
            className="fos-input"
            placeholder="PostgreSQL, MongoDB..."
            value={value.database}
            onChange={(e) => set("database", e.target.value)}
          />
        </Field>
      </div>
      <Field label="Tech stack" hint="Comma separated">
        <input
          data-testid="project-field-stack"
          className="fos-input"
          placeholder="TypeScript, Python, Tailwind, Docker..."
          value={value.stackText}
          onChange={(e) => set("stackText", e.target.value)}
        />
      </Field>
      <Field label="Architecture notes">
        <textarea
          data-testid="project-field-arch"
          rows={3}
          className="fos-input"
          placeholder="High-level architecture and system design notes..."
          value={value.architecture_notes}
          onChange={(e) => set("architecture_notes", e.target.value)}
        />
      </Field>
    </div>
  );

  const productionFields = (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Production URL">
          <input
            data-testid="project-field-prod-url"
            className="fos-input"
            placeholder="https://example.com"
            value={value.production_url}
            onChange={(e) => set("production_url", e.target.value)}
          />
        </Field>
        <Field label="Preview URL">
          <input
            data-testid="project-field-preview-url"
            className="fos-input"
            placeholder="https://staging.example.com"
            value={value.preview_url}
            onChange={(e) => set("preview_url", e.target.value)}
          />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Backend API URL">
          <input
            data-testid="project-field-backend-url"
            className="fos-input"
            placeholder="https://api.example.com"
            value={value.backend_url}
            onChange={(e) => set("backend_url", e.target.value)}
          />
        </Field>
        <Field label="Hosting provider">
          <input
            data-testid="project-field-hosting"
            className="fos-input"
            placeholder="Vercel, AWS, Fly.io, Railway..."
            value={value.hosting_provider}
            onChange={(e) => set("hosting_provider", e.target.value)}
          />
        </Field>
      </div>
      <Field label="Deployment provider">
        <input
          data-testid="project-field-deploy"
          className="fos-input"
          placeholder="GitHub Actions, Vercel CI, Docker..."
          value={value.deployment_provider}
          onChange={(e) => set("deployment_provider", e.target.value)}
        />
      </Field>
      <Field label="Environment notes">
        <textarea
          data-testid="project-field-env-notes"
          rows={3}
          className="fos-input"
          placeholder="Environment variables, secrets setup, domain details..."
          value={value.environment_notes}
          onChange={(e) => set("environment_notes", e.target.value)}
        />
      </Field>
      <Field label="Monitoring notes">
        <textarea
          data-testid="project-field-mon-notes"
          rows={2}
          className="fos-input"
          placeholder="Monitoring and observability setup notes..."
          value={value.monitoring_notes}
          onChange={(e) => set("monitoring_notes", e.target.value)}
        />
      </Field>
    </div>
  );

  const businessFields = (
    <div className="space-y-3">
      <Field label="Revenue model">
        <input
          data-testid="project-field-rev-model"
          className="fos-input"
          placeholder="Subscription, Usage, Enterprise, One-off..."
          value={value.revenue_model}
          onChange={(e) => set("revenue_model", e.target.value)}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Monthly revenue ($)">
          <input
            data-testid="project-field-monthly-rev"
            type="number"
            min="0"
            step="any"
            className="fos-input"
            placeholder="0"
            value={value.monthly_revenue}
            onChange={(e) => set("monthly_revenue", e.target.value)}
          />
        </Field>
        <Field label="Monthly expenses ($)">
          <input
            data-testid="project-field-monthly-exp"
            type="number"
            min="0"
            step="any"
            className="fos-input"
            placeholder="0"
            value={value.monthly_expenses}
            onChange={(e) => set("monthly_expenses", e.target.value)}
          />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Subscriptions">
          <input
            data-testid="project-field-subscriptions"
            type="number"
            min="0"
            className="fos-input"
            placeholder="0"
            value={value.subscriptions}
            onChange={(e) => set("subscriptions", e.target.value)}
          />
        </Field>
        <Field label="Customers">
          <input
            data-testid="project-field-customers"
            type="number"
            min="0"
            className="fos-input"
            placeholder="0"
            value={value.customers}
            onChange={(e) => set("customers", e.target.value)}
          />
        </Field>
      </div>
    </div>
  );

  if (section === "identity") return identityFields;
  if (section === "development") return developmentFields;
  if (section === "production") return productionFields;
  if (section === "business") return businessFields;

  return (
    <div className="space-y-6">
      {identityFields}
      <div className="pt-4 border-t border-line">
        <div className="section-label mb-3">Development</div>
        {developmentFields}
      </div>
      <div className="pt-4 border-t border-line">
        <div className="section-label mb-3">Production & Environment</div>
        {productionFields}
      </div>
      <div className="pt-4 border-t border-line">
        <div className="section-label mb-3">Business</div>
        {businessFields}
      </div>
    </div>
  );
}

export function NewProjectSheet() {
  const { newProject, setNewProject } = useUI();
  const navigate = useNavigate();
  const [form, setForm] = useState(() => projectToForm(null));

  useEffect(() => {
    if (newProject) {
      setForm(projectToForm(null));
    }
  }, [newProject]);

  const close = () => setNewProject(false);

  const create = useAction(actions.createProject, {
    success: "Project created",
    onDone: (created) => {
      close();
      if (created?.slug) {
        navigate(`/projects/${created.slug}`);
      }
    },
  });

  const valid = form.name.trim().length > 0;

  return (
    <Sheet open={!!newProject} onOpenChange={(v) => !v && close()}>
      <SheetContent
        data-testid="new-project-sheet"
        className="bg-s1 border-line w-full sm:max-w-[520px] overflow-y-auto"
      >
        <SheetHeader>
          <SheetTitle className="text-[16px]">Create new project</SheetTitle>
        </SheetHeader>
        <form
          className="mt-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) create.mutate(formToPayload(form));
          }}
        >
          <ProjectFields value={form} onChange={setForm} />
          <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-line">
            <button type="button" className="btn btn-ghost" onClick={close}>
              Cancel
            </button>
            <button
              data-testid="new-project-submit-btn"
              type="submit"
              disabled={!valid || create.isPending}
              className="btn btn-primary"
            >
              {create.isPending ? "Creating…" : "Create project"}
            </button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
