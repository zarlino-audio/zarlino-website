/**
 * Client access to the factory API.
 *
 * One place that knows the endpoints and the error shape. Nothing here
 * optimistically advances a build state: the dashboard re-reads the build from
 * the server, because the backend is the only authority on READY.
 */

export interface Account {
  id: string;
  email: string;
  plan: "free" | "pro" | string;
}

export interface PlanPreview {
  template: string;
  label: string;
  description: string;
  columns: number;
  layout: string;
  drawnCount: number;
  hiddenCount: number;
  availableCount: number;
  density: number;
  showsUnits: boolean;
  showsValueReadouts: boolean;
  controls: Array<{
    id: string;
    label: string;
    unit: string;
    group: string;
    kind: string;
    default: number;
    min: number;
    max: number;
    macroDriven: boolean;
    moduleLevel: boolean;
    importance: string;
  }>;
  rows: Array<Array<{ id: string; label: string; unit: string; group: string; kind: string; default: number }>>;
}

export interface BuildPlanView {
  title: string;
  summary: string;
  notes: string[];
  chain: Array<{ instanceId: string; moduleName: string; role: string; description: string; latencySamples: number }>;
  macros: Array<{ id: string; name: string; default: number; drives: string[] }>;
  parameters: Array<{
    id: string;
    name: string;
    group: string;
    unit: string;
    min: number;
    max: number;
    default: number;
    target: string;
    drivenByMacro: boolean;
  }>;
  latencySamples: number;
  latencyMsAt48k: number;
  accentColor: string;
  category: string;
  channels: string;
}

export interface BuildView {
  buildId: string;
  status: string;
  uiTemplate: string;
  productName: string;
  createdAt: string;
  completedAt: string | null;
  qaPassed: boolean;
  artifact: { name: string; bytes: number | null; sha256: string | null } | null;
  downloadUrl: string | null;
  failure: { category: string; title: string; message: string; action: string; retryable: boolean } | null;
  reusedFrom: string | null;
}

export interface EntitlementView {
  plan: string;
  planName: string;
  builds: { used: number; limit: number };
  aiRequests: { used: number; limit: number };
  projects: { used: number; limit: number };
  commercialUse: boolean;
  retentionDays: number;
}

export interface ProjectSummary {
  id: string;
  name: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  productName: string | null;
  uiTemplate: string | null;
  buildState: string | null;
  latestBuildId: string | null;
  latestReadyBuildId: string | null;
  failureReason: string | null;
}

export interface ApiErrorBody {
  error: string;
  message: string;
  [key: string]: unknown;
}

export class ApiFailure extends Error {
  readonly code: string;
  readonly status: number;
  readonly detail: Record<string, unknown>;

  constructor(status: number, code: string, message: string, detail: Record<string, unknown> = {}) {
    super(message);
    this.name = "ApiFailure";
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    credentials: "same-origin",
    ...init,
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
  });

  const text = await response.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }

  if (!response.ok) {
    const error = (body ?? {}) as Partial<ApiErrorBody>;
    throw new ApiFailure(
      response.status,
      String(error.error ?? "ERROR"),
      String(error.message ?? "Something went wrong."),
      (body ?? {}) as Record<string, unknown>,
    );
  }
  return body as T;
}

export const factoryApi = {
  overview: () =>
    call<{
      account: Account;
      entitlement: EntitlementView;
      projects: ProjectSummary[];
      plans: { plans: Array<{ id: string; name: string; tagline: string; price: { amountMinor: number; currency: string; interval: string } | null; entitlements: Record<string, unknown>; features: string[] }> };
    }>("/api/factory/me"),

  async session(): Promise<Account | null> {
    try {
      const me = await call<{ account: Account }>("/api/factory/me");
      return me.account;
    } catch (error) {
      if (error instanceof ApiFailure && error.status === 401) return null;
      throw error;
    }
  },

  signup: (email: string, password: string, displayName?: string) =>
    call<{ ok: true; account: Account }>("/api/factory/auth/signup", {
      method: "POST",
      body: JSON.stringify({ email, password, displayName }),
    }),

  login: (email: string, password: string) =>
    call<{ ok: true; account: Account }>("/api/factory/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),

  logout: () => call<{ ok: true }>("/api/factory/auth/logout", { method: "POST", body: "{}" }),

  createProject: (name: string) => call<{ project: ProjectSummary }>("/api/factory/projects", { method: "POST", body: JSON.stringify({ name }) }),

  project: (id: string) =>
    call<{
      project: ProjectSummary;
      spec: { id: string; revision: number; spec: unknown; sha256: string; source: string; createdAt: string } | null;
      plan: BuildPlanView | null;
      builds: Array<BuildView & { failureExplanation?: BuildView["failure"] }>;
      messages: Array<{ role: string; content: string; at: string }>;
      templates: PlanPreview[] | null;
      entitlement: EntitlementView;
    }>(`/api/factory/projects/${id}`),

  deleteProject: (id: string) => call<{ ok: true }>(`/api/factory/projects/${id}`, { method: "DELETE" }),

  interpret: (id: string, description: string) =>
    call<{
      ok: boolean;
      interpretation?: { summary: string; plan: BuildPlanView; revision: number; specId: string; templates: PlanPreview[] };
      unsupported?: { message: string; alternative: string | null };
      error?: { code: string; message: string; detail?: string };
      usage?: { aiRequests: number; aiTokens: number; costUsd: number };
    }>(`/api/factory/projects/${id}/interpret`, { method: "POST", body: JSON.stringify({ description }) }),

  build: (id: string, uiTemplate: string) =>
    call<{ build: BuildView; reused: boolean; entitlementRemaining: { builds: number } }>(`/api/factory/projects/${id}/builds`, {
      method: "POST",
      body: JSON.stringify({ uiTemplate, accept: true }),
    }),

  buildStatus: (buildId: string) => call<{ build: BuildView; failure: BuildView["failure"] }>(`/api/factory/builds/${buildId}`),

  checkout: (plan: string) => call<{ authorizationUrl: string }>("/api/factory/billing/checkout", { method: "POST", body: JSON.stringify({ plan }) }),

  verifyPayment: (reference: string) =>
    call<{ paid: boolean; plan: string | null; granted: boolean; message: string }>(`/api/factory/billing/verify?reference=${encodeURIComponent(reference)}`),
};

export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function formatMoney(minor: number, currency: string): string {
  const amount = minor / 100;
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(0)}`;
  }
}

export const BUILD_STATE_LABEL: Record<string, string> = {
  QUEUED: "Queued for the build server",
  ASSEMBLING: "Preparing the project",
  BUILDING: "Compiling your plugin",
  TESTING: "Running the quality checks",
  PACKAGING: "Packaging the plugin",
  READY: "Ready to download",
  FAILED: "Build failed",
};
