/**
 * HTTP surface of the customer application: /api/factory/*.
 *
 * Order of business on every request:
 *   1. method + path allow-list (unknown paths are a JSON 404, never an asset),
 *   2. CSRF (same-origin) for anything that mutates,
 *   3. rate limit (per IP for public routes, per account once signed in),
 *   4. authentication (session cookie -> identity store),
 *   5. the service call, with ownership enforced by the per-user workspace,
 *   6. a JSON response that never contains a stack trace, a token or a log.
 */

import { adminAuthorized } from "../auth";
import { clientIdentity, clearedSessionCookie, parseCookies, rateLimitKey, rateLimitWindow, RATE_LIMITS, isSameOriginRequest, resolveSession, sessionCookie, sessionTokenFrom, type RateLimitName } from "./auth";
import { createAiGateway } from "./ai";
import { createOsBuildService } from "./builds";
import type { BillingConfig } from "./billing";
import {
  accountOverview,
  authoriseDownload,
  createProject,
  deleteProject,
  getProject,
  handleWebhook,
  interpret,
  listBuilds,
  listProjects,
  metricsView,
  plansView,
  previewTemplates,
  refreshBuild,
  requestBuild,
  saveSpecDocument,
  ServiceError,
  startCheckout,
  verifyReturn,
  type Actor,
  type ClientCall,
  type FactoryDeps,
} from "./service";
import { explainFailure } from "./explain";

export interface DurableNamespace {
  idFromName(name: string): unknown;
  get(id: unknown): { fetch(request: Request): Promise<Response> };
}

export interface ArtifactBinding {
  get(key: string): Promise<
    | {
        body: ReadableStream | null;
        size?: number;
        httpEtag?: string;
        writeHttpMetadata?(headers: Headers): void;
      }
    | null
  >;
}

export interface FactoryHttpEnv {
  FACTORY_IDENTITY?: DurableNamespace;
  FACTORY_WORKSPACE?: DurableNamespace;
  FACTORY_ARTIFACTS?: ArtifactBinding;
  FACTORY_GATEWAY_SECRET?: string;
  FACTORY_OS_URL?: string;
  PAYSTACK_SECRET_KEY?: string;
  PAYSTACK_CURRENCY?: string;
  FACTORY_PUBLIC_URL?: string;
  ADMIN_SESSION_KEY?: string;
}

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...headers } });
}

function doCall(namespace: DurableNamespace | undefined, name: string): ClientCall {
  if (!namespace) {
    return async () => ({ ok: false, code: "STORE_UNAVAILABLE" });
  }
  const stub = namespace.get(namespace.idFromName(name));
  return async (op, args) => {
    const response = await stub.fetch(
      new Request("https://factory.internal/op", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ op, args }),
      }),
    );
    const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    return body ?? { ok: false, code: "STORE_ERROR" };
  };
}

export function buildDeps(env: FactoryHttpEnv, publicBaseUrl: string): FactoryDeps {
  const osUrl = (env.FACTORY_OS_URL ?? "").replace(/\/$/, "");
  const secret = env.FACTORY_GATEWAY_SECRET ?? "";

  const billing: BillingConfig = {
    secretKey: env.PAYSTACK_SECRET_KEY,
    currency: env.PAYSTACK_CURRENCY ?? "GHS",
    callbackBase: publicBaseUrl,
  };

  return {
    identity: doCall(env.FACTORY_IDENTITY, "global"),
    // The user id is injected by the binding, not by the caller: a service
    // function cannot accidentally query a workspace with the wrong (or no)
    // owner, and the store still filters every statement on it.
    workspace: (userId: string) => {
      const call = doCall(env.FACTORY_WORKSPACE, `user:${userId}`);
      return (op: string, args: Record<string, unknown>) => call(op, { ...args, userId });
    },
    ai: createAiGateway({ baseUrl: osUrl, secret }),
    builds: createOsBuildService({ baseUrl: osUrl, secret }),
    artifacts: env.FACTORY_ARTIFACTS ?? null,
    billing,
    publicBaseUrl,
  };
}

// ---------------------------------------------------------------------------
// Route matching
// ---------------------------------------------------------------------------

interface Route {
  method: string;
  pattern: RegExp;
  /** Public routes skip authentication. */
  public?: boolean;
  limit?: RateLimitName;
  handle: (ctx: RouteContext) => Promise<Response | Record<string, unknown>>;
}

interface RouteContext {
  request: Request;
  url: URL;
  env: FactoryHttpEnv;
  deps: FactoryDeps;
  params: string[];
  actor: Actor | null;
  token: string | null;
}

const ROUTES: Route[] = [
  {
    method: "POST",
    pattern: /^\/api\/factory\/auth\/signup$/,
    public: true,
    limit: "signup",
    handle: async ({ request, deps }) => {
      const body = await readJson(request);
      const result = await deps.identity("signup", {
        email: String(body.email ?? ""),
        password: String(body.password ?? ""),
        displayName: body.displayName === undefined ? undefined : String(body.displayName),
      });
      if (!result.ok) return json({ error: result.code, message: result.message }, result.code === "EMAIL_TAKEN" ? 409 : 400);
      return json(
        { ok: true, account: result.user },
        200,
        { "set-cookie": sessionCookie(String(result.token)) },
      );
    },
  },
  {
    method: "POST",
    pattern: /^\/api\/factory\/auth\/login$/,
    public: true,
    limit: "login",
    handle: async ({ request, deps }) => {
      const body = await readJson(request);
      const result = await deps.identity("login", { email: String(body.email ?? ""), password: String(body.password ?? "") });
      if (!result.ok) return json({ error: result.code, message: "That email and password do not match an account." }, 401);
      return json({ ok: true, account: result.user }, 200, { "set-cookie": sessionCookie(String(result.token)) });
    },
  },
  {
    method: "POST",
    pattern: /^\/api\/factory\/auth\/logout$/,
    public: true,
    handle: async ({ deps, token }) => {
      await deps.identity("logout", { token });
      return json({ ok: true }, 200, { "set-cookie": clearedSessionCookie() });
    },
  },
  {
    method: "GET",
    pattern: /^\/api\/factory\/me$/,
    handle: async ({ deps, actor }) => accountOverview(deps, actor!),
  },
  {
    method: "GET",
    pattern: /^\/api\/factory\/plans$/,
    public: true,
    handle: async () => plansView(),
  },
  {
    method: "GET",
    pattern: /^\/api\/factory\/projects$/,
    handle: async ({ deps, actor }) => listProjects(deps, actor!),
  },
  {
    method: "POST",
    pattern: /^\/api\/factory\/projects$/,
    limit: "interpret",
    handle: async ({ request, deps, actor }) => {
      const body = await readJson(request);
      return createProject(deps, actor!, { name: body.name === undefined ? undefined : String(body.name), description: body.description === undefined ? undefined : String(body.description) });
    },
  },
  {
    method: "GET",
    pattern: /^\/api\/factory\/projects\/([A-Za-z0-9_-]{6,64})$/,
    handle: async ({ deps, actor, params }) => getProject(deps, actor!, params[0]!),
  },
  {
    method: "PATCH",
    pattern: /^\/api\/factory\/projects\/([A-Za-z0-9_-]{6,64})$/,
    handle: async ({ request, deps, actor, params }) => {
      const body = await readJson(request);
      const result = await deps.workspace(actor!.userId)("updateProject", {
        projectId: params[0]!,
        name: body.name === undefined ? undefined : String(body.name),
        description: body.description === undefined ? undefined : String(body.description),
      });
      if (!result.ok) throw new ServiceError(404, "PROJECT_NOT_FOUND", "That project does not exist.");
      return { project: result.project };
    },
  },
  {
    method: "DELETE",
    pattern: /^\/api\/factory\/projects\/([A-Za-z0-9_-]{6,64})$/,
    handle: async ({ deps, actor, params }) => deleteProject(deps, actor!, params[0]!),
  },
  {
    method: "POST",
    pattern: /^\/api\/factory\/projects\/([A-Za-z0-9_-]{6,64})\/interpret$/,
    limit: "interpret",
    handle: async ({ request, deps, actor, params }) => {
      const body = await readJson(request);
      const result = await interpret(deps, actor!, params[0]!, {
        description: String(body.description ?? ""),
        mode: body.mode === "refine" ? "refine" : "initial",
      });
      return json(result, result.ok ? 200 : result.unsupported ? 422 : 400);
    },
  },
  {
    method: "POST",
    pattern: /^\/api\/factory\/projects\/([A-Za-z0-9_-]{6,64})\/spec$/,
    handle: async ({ request, deps, actor, params }) => {
      const body = await readJson(request);
      const result = await saveSpecDocument(deps, actor!, params[0]!, body.spec ?? body);
      return json(result, result.ok ? 200 : 400);
    },
  },
  {
    method: "GET",
    pattern: /^\/api\/factory\/projects\/([A-Za-z0-9_-]{6,64})\/templates$/,
    handle: async ({ deps, actor, params }) => previewTemplates(deps, actor!, params[0]!),
  },
  {
    method: "POST",
    pattern: /^\/api\/factory\/projects\/([A-Za-z0-9_-]{6,64})\/builds$/,
    limit: "build",
    handle: async ({ request, deps, actor, params, env }) => {
      const body = await readJson(request);
      const result = await requestBuild(deps, actor!, params[0]!, {
        uiTemplate: String(body.uiTemplate ?? ""),
        accept: body.accept === true,
      });
      return json({ ...result, billing: { currency: env.PAYSTACK_CURRENCY ?? "GHS" } }, 202);
    },
  },
  {
    method: "GET",
    pattern: /^\/api\/factory\/builds\/([A-Za-z0-9][A-Za-z0-9._-]{5,63})$/,
    handle: async ({ deps, actor, params }) => {
      const refreshed = await refreshBuild(deps, actor!, params[0]!);
      const project = await deps.workspace(actor!.userId)("getBuild", { buildId: params[0]! });
      const build = project.ok ? (project.build as { failure_state?: string | null }) : null;
      return { build: refreshed, failure: refreshed.status === "FAILED" ? explainFailure(build?.failure_state ?? null) : null };
    },
  },
  {
    method: "GET",
    pattern: /^\/api\/factory\/builds$/,
    handle: async ({ deps, actor, url }) => listBuilds(deps, actor!, url.searchParams.get("projectId") ?? undefined),
  },
  {
    method: "GET",
    pattern: /^\/api\/factory\/builds\/([A-Za-z0-9][A-Za-z0-9._-]{5,63})\/artifact$/,
    limit: "download",
    handle: async ({ deps, env, actor, params }) => downloadArtifact(deps, env, actor!, params[0]!),
  },
  {
    method: "GET",
    pattern: /^\/api\/factory\/billing\/plans$/,
    public: true,
    handle: async () => plansView(),
  },
  {
    method: "POST",
    pattern: /^\/api\/factory\/billing\/checkout$/,
    limit: "billing",
    handle: async ({ request, deps, actor }) => {
      const body = await readJson(request);
      return startCheckout(deps, actor!, { plan: body.plan === "pro" ? "pro" : undefined });
    },
  },
  {
    method: "GET",
    pattern: /^\/api\/factory\/billing\/verify$/,
    limit: "billing",
    handle: async ({ deps, actor, url }) => {
      const reference = url.searchParams.get("reference") ?? "";
      if (!reference) throw new ServiceError(400, "MISSING_REFERENCE", "A payment reference is required.");
      return verifyReturn(deps, actor!, reference);
    },
  },
  {
    method: "POST",
    pattern: /^\/api\/factory\/billing\/webhook$/,
    public: true,
    limit: "webhook",
    handle: async ({ request, deps }) => {
      const raw = await request.text();
      const outcome = await handleWebhook(deps, raw, request.headers.get("x-paystack-signature"));
      return json(outcome.body, outcome.status);
    },
  },
  {
    method: "GET",
    pattern: /^\/api\/factory\/admin\/metrics$/,
    public: true,
    handle: async ({ request, deps, url, env }) => {
      const authorised = await founderAuthorised(request, env);
      if (!authorised) return json({ error: "Unauthorized" }, 401);
      const days = Math.max(1, Math.min(365, Number(url.searchParams.get("days") ?? 30) || 30));
      return metricsView(deps, days);
    },
  },
];

async function founderAuthorised(request: Request, env: FactoryHttpEnv): Promise<boolean> {
  // Founder/admin access is the site's existing HMAC admin session — a separate
  // credential from anything a customer can obtain. Reusing the one
  // implementation keeps the two surfaces from drifting apart.
  if (!env.ADMIN_SESSION_KEY) return false;
  return adminAuthorized(request, { ADMIN_SESSION_KEY: env.ADMIN_SESSION_KEY });
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  const text = await request.text();
  if (text.length > 64_000) throw new ServiceError(413, "BODY_TOO_LARGE", "Request body is too large.");
  if (!text) return {};
  try {
    const parsed = JSON.parse(text);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new ServiceError(400, "INVALID_BODY", "Body must be a JSON object.");
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof ServiceError) throw error;
    throw new ServiceError(400, "INVALID_BODY", "Body must be valid JSON.");
  }
}

function safeFilename(name: string): string {
  const base = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").replace(/^\.+/, "_").trim();
  return base.length > 0 ? base.slice(0, 180) : "plugin.vst3.zip";
}

async function downloadArtifact(deps: FactoryDeps, env: FactoryHttpEnv, actor: Actor, buildId: string): Promise<Response> {
  const artifact = await authoriseDownload(deps, actor, buildId);
  if (!env.FACTORY_ARTIFACTS) return json({ error: "ARTIFACT_STORE_UNAVAILABLE", message: "The artifact store is not configured." }, 503);

  const object = await env.FACTORY_ARTIFACTS.get(artifact.key);
  if (!object || !object.body) {
    return json({ error: "ARTIFACT_MISSING", message: "This artifact is no longer stored. Build the project again." }, 410);
  }

  const headers = new Headers({
    "content-type": "application/octet-stream",
    "content-disposition": `attachment; filename="${safeFilename(artifact.name)}"`,
    "cache-control": "private, no-store",
    "x-content-type-options": "nosniff",
  });
  if (artifact.sha256) headers.set("x-artifact-sha256", artifact.sha256);
  if (typeof object.size === "number") headers.set("content-length", String(object.size));
  object.writeHttpMetadata?.(headers);

  return new Response(object.body, { status: 200, headers });
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export async function handleFactoryApi(
  request: Request,
  env: FactoryHttpEnv,
  url: URL,
  depsOverride?: FactoryDeps,
): Promise<Response> {
  const method = request.method.toUpperCase();

  if (method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "access-control-allow-origin": url.origin,
        "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
        "access-control-allow-headers": "content-type,authorization",
        "access-control-allow-credentials": "true",
      },
    });
  }

  const deps = depsOverride ?? buildDeps(env, env.FACTORY_PUBLIC_URL ?? url.origin);

  let matched: { route: Route; params: string[] } | null = null;
  for (const route of ROUTES) {
    if (route.method !== method) continue;
    const match = route.pattern.exec(url.pathname);
    if (match) {
      matched = { route, params: match.slice(1) };
      break;
    }
  }

  if (!matched) {
    return json({ error: "NOT_FOUND", message: "No such factory endpoint." }, 404);
  }

  const { route, params } = matched;

  try {
    if (!route.public && !isSameOriginRequest(request)) {
      return json({ error: "CROSS_ORIGIN_REFUSED", message: "Cross-origin request refused." }, 403);
    }

    const token = sessionTokenFrom(request);
    let actor: Actor | null = null;

    if (!route.public) {
      const session = await deps.identity("session", { token });
      if (session.authenticated !== true) return json({ error: "UNAUTHORIZED", message: "Sign in to continue." }, 401);
      const account = session.user as { id: string; email: string; plan: string };
      actor = { userId: account.id, email: account.email, plan: account.plan };
    }

    if (route.limit) {
      const config = RATE_LIMITS[route.limit];
      const identity = actor ? `u:${actor.userId}` : `ip:${clientIdentity(request)}`;
      const now = new Date();
      const bucket = rateLimitKey(route.limit, identity);
      const result = await deps.identity("rateLimit", { bucket, windowStart: rateLimitWindow(route.limit, now) });
      const count = Number(result.count ?? 0);
      if (count > config.limit) {
        return json(
          { error: "RATE_LIMITED", message: "Too many requests. Please wait a moment and try again.", retryAfterSeconds: config.windowSeconds },
          429,
          { "retry-after": String(Math.min(config.windowSeconds, 900)) },
        );
      }
    }

    const result = await route.handle({ request, url, env, deps, params, actor, token });

    if (result instanceof Response) return result;
    return json(result);
  } catch (error) {
    if (error instanceof ServiceError) {
      return json({ error: error.code, message: error.message, ...error.extra }, error.status);
    }
    // Diagnostics go to the platform log (observability), never to the customer
    // and never with request contents: a stack trace or a body could carry a
    // session token or a design the customer has not shared.
    console.error("[factory] unhandled route error", error instanceof Error ? `${error.name}: ${error.message}`.slice(0, 300) : typeof error);
    return json({ error: "INTERNAL_ERROR", message: "Something went wrong on our side. Please try again." }, 500);
  }
}

/** Small helper the pages use to decide whether to render the app shell. */
export function sessionCookieName(): string {
  return "zf_session";
}

export function readSession(request: Request): string | null {
  return parseCookies(request.headers.get("cookie"))[sessionCookieName()] ?? null;
}

export { resolveSession, sessionTokenFrom };
