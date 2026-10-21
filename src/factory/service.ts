/**
 * The customer application service: the production flow, in one place.
 *
 *   account -> new plugin -> description -> AI interpretation -> PluginSpec
 *   -> human-readable plan -> refine -> choose interface -> authorise cost
 *   -> build -> live status -> QA -> READY/FAILED -> download -> history
 *
 * Everything expensive is metered and entitlement-checked here, before it
 * happens; every state the customer sees is read back from the stores or from
 * the orchestrator, never assumed from what the browser said.
 */

import {
  type AiGateway,
  type AiUsage,
  emptyUsage,
  interpretToSpec,
  MAX_DESCRIPTION_CHARS,
} from "./ai";
import {
  initializeTransaction,
  planPriceMinor,
  verifyTransaction,
  verifyWebhookSignature,
  type BillingConfig,
  type VerifyResult,
} from "./billing";
import { type BuildService, type RemoteBuild } from "./builds";
import { explainFailure, type ExplainedFailure } from "./explain";
import { compilePlan, previewAllTemplates, type BuildPlan, type TemplatePreview, type UiTemplate, UI_TEMPLATES } from "./plan";
import {
  entitlementsFor,
  estimateBuildVariableCost,
  evaluateEntitlement,
  entitlementSummary,
  planDefinition,
  PLANS,
  PRICING,
  PRICING_VERSION,
  PLAN_IDS,
  type EntitlementDecision,
  type PlanId,
  type UsageSnapshot,
} from "./pricing";
import { describeSpecError, parsePluginSpec, specSha256, type PluginSpec } from "./spec";
import { nowIso, type BuildRecord } from "./store";

// ---------------------------------------------------------------------------
// Dependencies
// ---------------------------------------------------------------------------

export interface ClientCall {
  (op: string, args: Record<string, unknown>): Promise<Record<string, unknown>>;
}

export interface FactoryDeps {
  identity: ClientCall;
  workspace: (userId: string) => ClientCall;
  ai: AiGateway;
  builds: BuildService;
  artifacts: { get(key: string): Promise<unknown> } | null;
  billing: BillingConfig;
  now?: () => Date;
  newId?: (prefix: string) => string;
  publicBaseUrl: string;
}

export interface Actor {
  userId: string;
  email: string;
  plan: string;
}

export class ServiceError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "ServiceError";
  }
}

function fail(status: number, code: string, message: string, extra: Record<string, unknown> = {}): never {
  throw new ServiceError(status, code, message, extra);
}

function at(deps: FactoryDeps): string {
  return nowIso(deps.now ?? (() => new Date()));
}

function id(deps: FactoryDeps, prefix: string): string {
  if (deps.newId) return deps.newId(prefix);
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return `${prefix}_${[...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

async function track(deps: FactoryDeps, name: string, userId: string | null, props?: Record<string, unknown>): Promise<void> {
  await deps.identity("track", { name, userId, props }).catch(() => undefined);
}

// ---------------------------------------------------------------------------
// Usage and entitlement
// ---------------------------------------------------------------------------

async function usageSnapshot(deps: FactoryDeps, actor: Actor): Promise<UsageSnapshot> {
  const result = await deps.workspace(actor.userId)("usageSnapshot", { plan: actor.plan });
  if (!result.ok) fail(500, "STORE_ERROR", "Could not read your usage.");
  return result.snapshot as UsageSnapshot;
}

async function authorise(deps: FactoryDeps, actor: Actor, action: Parameters<typeof evaluateEntitlement>[2]): Promise<UsageSnapshot> {
  const snapshot = await usageSnapshot(deps, actor);
  const decision: EntitlementDecision = evaluateEntitlement(actor.plan, snapshot, action);
  if (!decision.allowed) {
    fail(402, decision.reason, decision.message, {
      plan: decision.plan,
      upgrade: decision.upgrade,
      usage: snapshot,
      entitlements: entitlementsFor(decision.plan),
    });
  }
  return snapshot;
}

export async function accountOverview(deps: FactoryDeps, actor: Actor): Promise<Record<string, unknown>> {
  const snapshot = await usageSnapshot(deps, actor);
  const projects = await deps.workspace(actor.userId)("listProjects", {});
  return {
    account: { id: actor.userId, email: actor.email, plan: actor.plan },
    plan: planDefinition(actor.plan),
    pricing: { version: PRICING_VERSION, currency: PRICING.currency, plans: PLAN_IDS.map((planId) => PLANS[planId]) },
    entitlements: entitlementsFor(actor.plan),
    entitlement: entitlementSummary(actor.plan, snapshot),
    usage: snapshot,
    projects: projects.projects ?? [],
  };
}

// ---------------------------------------------------------------------------
// Projects and refinement
// ---------------------------------------------------------------------------

export async function createProject(deps: FactoryDeps, actor: Actor, input: { name?: string; description?: string }): Promise<Record<string, unknown>> {
  const name = String(input.name ?? "").trim() || "Untitled plugin";
  await authorise(deps, actor, { kind: "create-project" });

  const projectId = id(deps, "prj");
  const result = await deps.workspace(actor.userId)("createProject", {
    projectId,
    name: name.slice(0, 80),
    description: String(input.description ?? "").slice(0, 400),
  });
  if (!result.ok) fail(500, "STORE_ERROR", "Could not create the project.");

  await track(deps, "project_created", actor.userId, { projectId });
  return { project: result.project };
}

export async function listProjects(deps: FactoryDeps, actor: Actor): Promise<Record<string, unknown>> {
  const result = await deps.workspace(actor.userId)("listProjects", {});
  const snapshot = await usageSnapshot(deps, actor);
  return {
    projects: result.projects ?? [],
    entitlement: entitlementSummary(actor.plan, snapshot),
  };
}

export interface ProjectView {
  project: Record<string, unknown>;
  spec: { id: string; revision: number; spec: PluginSpec; sha256: string; source: string; createdAt: string } | null;
  plan: BuildPlan | null;
  builds: BuildRecord[];
  messages: Array<{ role: string; content: string; at: string }>;
  templates: TemplatePreview[] | null;
  entitlement: ReturnType<typeof entitlementSummary>;
}

export async function getProject(deps: FactoryDeps, actor: Actor, projectId: string): Promise<ProjectView> {
  const result = await deps.workspace(actor.userId)("getProject", { projectId });
  if (!result.ok) fail(404, "PROJECT_NOT_FOUND", "That project does not exist.");

  const spec = result.spec as ProjectView["spec"];
  const builds = (result.builds as BuildRecord[]).map((build) => ({
    ...build,
    failureExplanation: build.status === "FAILED" ? explainFailure(build.failure_state) : null,
  }));

  const snapshot = await usageSnapshot(deps, actor);
  return {
    project: result.project as Record<string, unknown>,
    spec,
    plan: spec ? compilePlan(spec.spec) : null,
    builds,
    messages: (result.messages as ProjectView["messages"]) ?? [],
    templates: spec ? previewAllTemplates(spec.spec) : null,
    entitlement: entitlementSummary(actor.plan, snapshot),
  };
}

export async function deleteProject(deps: FactoryDeps, actor: Actor, projectId: string): Promise<Record<string, unknown>> {
  const result = await deps.workspace(actor.userId)("deleteProject", { projectId });
  if (!result.ok) fail(404, "PROJECT_NOT_FOUND", "That project does not exist.");
  return { ok: true };
}

export interface InterpretResultView {
  ok: boolean;
  interpretation?: {
    summary: string;
    plan: BuildPlan;
    spec: PluginSpec;
    revision: number;
    specId: string;
    templates: TemplatePreview[];
    attempts: number;
  };
  unsupported?: { message: string; alternative: string | null };
  error?: { code: string; message: string; detail?: string };
  usage?: { aiRequests: number; aiTokens: number; costUsd: number };
}

/**
 * One assistant turn. Never builds: refinement is free of build cost, so a
 * customer can iterate on the design before spending a build.
 */
export async function interpret(
  deps: FactoryDeps,
  actor: Actor,
  projectId: string,
  input: { description: string; mode?: "initial" | "refine" },
): Promise<InterpretResultView> {
  const project = await deps.workspace(actor.userId)("getProject", { projectId });
  if (!project.ok) fail(404, "PROJECT_NOT_FOUND", "That project does not exist.");

  const text = String(input.description ?? "").trim();
  if (text.length === 0) fail(400, "EMPTY_DESCRIPTION", "Describe the processor you want.");
  if (text.length > MAX_DESCRIPTION_CHARS) fail(400, "DESCRIPTION_TOO_LONG", `Keep the description under ${MAX_DESCRIPTION_CHARS} characters.`);

  const existing = project.spec as ProjectView["spec"];
  const mode: "initial" | "refine" = existing ? "refine" : input.mode === "refine" ? "refine" : "initial";
  if (mode === "refine" && !existing) fail(409, "NO_SPEC_YET", "Describe the processor first.");

  // Cheap pre-check for a friendly message, then the authoritative reservation
  // inside the store (which also moves the counter, so concurrency cannot race).
  await authorise(deps, actor, { kind: "ai", estimatedTokens: 3000 });
  const reservation = await deps.workspace(actor.userId)("reserveAiRequest", { plan: actor.plan, projectId });
  if (!reservation.ok) {
    fail(402, String(reservation.code ?? "AI_ALLOWANCE"), "Your monthly assistant allowance is used up.", {
      plan: actor.plan,
      limit: reservation.limit,
      upgrade: actor.plan === "free",
    });
  }

  await deps.workspace(actor.userId)("addMessage", { id: id(deps, "msg"), projectId, role: "user", content: text });
  await track(deps, "ai_prompt", actor.userId, { projectId, mode, firstPrompt: !existing });

  const outcome = await interpretToSpec(deps.ai, {
    mode,
    description: text,
    currentSpec: existing ? existing.spec : null,
  });

  // Meter whatever the assistant actually spent, whatever the outcome.
  // (`ai.request` was already reserved before the call; tokens and cost land now.)
  const usage: AiUsage = outcome.totals ?? emptyUsage();
  if (usage.promptTokens + usage.completionTokens > 0) {
    await deps.workspace(actor.userId)("recordUsage", {
      events: [
        { kind: "ai.tokens", quantity: usage.promptTokens + usage.completionTokens, unit: "token", cost_usd: 0, project_id: projectId, created_at: at(deps) },
        { kind: "ai.cost_usd", quantity: usage.costUsd, unit: "usd", cost_usd: usage.costUsd, project_id: projectId, created_at: at(deps) },
      ],
    });
  }

  if (!outcome.ok) {
    if (outcome.code === "UNSUPPORTED") {
      const message = outcome.message;
      await deps.workspace(actor.userId)("addMessage", {
        id: id(deps, "msg"),
        projectId,
        role: "assistant",
        content: outcome.alternative ? `${message}\n\nClosest we can build: ${outcome.alternative}` : message,
      });
      await track(deps, "request_unsupported", actor.userId, { projectId });
      return {
        ok: false,
        unsupported: { message, alternative: outcome.alternative ?? null },
        usage: { aiRequests: 1, aiTokens: usage.promptTokens + usage.completionTokens, costUsd: usage.costUsd },
      };
    }

    const detail = outcome.validationError ? describeSpecError(outcome.validationError) : undefined;
    await track(deps, "spec_invalid", actor.userId, { projectId, code: outcome.code });
    return {
      ok: false,
      error: { code: outcome.code, message: outcome.message, detail },
      usage: { aiRequests: 1, aiTokens: usage.promptTokens + usage.completionTokens, costUsd: usage.costUsd },
    };
  }

  const specJson = JSON.stringify(outcome.spec);
  const sha = await specSha256(outcome.spec);
  const specId = id(deps, "spc");
  const saved = await deps.workspace(actor.userId)("saveSpec", {
    projectId,
    specId,
    specJson,
    sha256: sha,
    planJson: JSON.stringify(outcome.plan),
    source: mode,
    aiModel: usage.model,
    aiCostUsd: usage.costUsd,
  });
  if (!saved.ok) fail(500, "STORE_ERROR", "Could not save the design.");

  const assistantText = `${outcome.plan.summary}\n\n${outcome.plan.notes.join(" ")}`.trim();
  await deps.workspace(actor.userId)("addMessage", {
    id: id(deps, "msg"),
    projectId,
    role: "assistant",
    content: assistantText,
    specId,
  });

  await track(deps, "spec_valid", actor.userId, {
    projectId,
    modules: outcome.spec.graph.modules.map((module) => module.moduleId),
    moduleCount: outcome.spec.graph.modules.length,
    parameterCount: outcome.spec.parameters.length,
    macroCount: outcome.spec.macros.length,
    attempts: outcome.attempts,
  });

  return {
    ok: true,
    interpretation: {
      summary: outcome.message || outcome.plan.summary,
      plan: outcome.plan,
      spec: outcome.spec,
      revision: Number(saved.revision ?? 0),
      specId,
      templates: previewAllTemplates(outcome.spec),
      attempts: outcome.attempts,
    },
    usage: { aiRequests: 1, aiTokens: usage.promptTokens + usage.completionTokens, costUsd: usage.costUsd },
  };
}

/** Manual edit: a customer (or support) can submit a spec document directly. */
export async function saveSpecDocument(
  deps: FactoryDeps,
  actor: Actor,
  projectId: string,
  document: unknown,
): Promise<InterpretResultView> {
  const project = await deps.workspace(actor.userId)("getProject", { projectId });
  if (!project.ok) fail(404, "PROJECT_NOT_FOUND", "That project does not exist.");

  const parsed = parsePluginSpec(document);
  if (!parsed.ok) {
    return {
      ok: false,
      error: {
        code: "INVALID_SPEC",
        message: "That design is not valid.",
        detail: describeSpecError(parsed.error),
      },
    };
  }

  const plan = compilePlan(parsed.spec);
  const sha = await specSha256(parsed.spec);
  const specId = id(deps, "spc");
  const saved = await deps.workspace(actor.userId)("saveSpec", {
    projectId,
    specId,
    specJson: JSON.stringify(parsed.spec),
    sha256: sha,
    planJson: JSON.stringify(plan),
    source: "manual",
    aiModel: null,
    aiCostUsd: 0,
  });
  if (!saved.ok) fail(500, "STORE_ERROR", "Could not save the design.");

  return {
    ok: true,
    interpretation: {
      summary: plan.summary,
      plan,
      spec: parsed.spec,
      revision: Number(saved.revision ?? 0),
      specId,
      templates: previewAllTemplates(parsed.spec),
      attempts: 0,
    },
  };
}

export async function previewTemplates(deps: FactoryDeps, actor: Actor, projectId: string): Promise<Record<string, unknown>> {
  const project = await deps.workspace(actor.userId)("getProject", { projectId });
  if (!project.ok) fail(404, "PROJECT_NOT_FOUND", "That project does not exist.");
  const spec = project.spec as ProjectView["spec"];
  if (!spec) fail(409, "NO_SPEC_YET", "Describe the processor first.");
  return { templates: previewAllTemplates(spec.spec), current: project.plan };
}

// ---------------------------------------------------------------------------
// Builds
// ---------------------------------------------------------------------------

export interface BuildView {
  buildId: string;
  status: string;
  uiTemplate: string;
  productName: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  qaPassed: boolean;
  artifact: { name: string; bytes: number | null; sha256: string | null } | null;
  downloadUrl: string | null;
  failure: ExplainedFailure | null;
  reusedFrom: string | null;
}

export function buildView(deps: FactoryDeps, build: BuildRecord): BuildView {
  const ready = build.status === "READY" && build.qa_passed === 1 && Boolean(build.artifact_key);
  return {
    buildId: build.id,
    status: build.status,
    uiTemplate: build.ui_template,
    productName: build.product_name,
    createdAt: build.created_at,
    updatedAt: build.updated_at,
    completedAt: build.completed_at ?? null,
    qaPassed: build.qa_passed === 1,
    artifact: ready ? { name: build.artifact_name ?? "", bytes: build.artifact_bytes ?? null, sha256: build.artifact_sha256 ?? null } : null,
    downloadUrl: ready ? `${deps.publicBaseUrl}/api/factory/builds/${build.id}/artifact` : null,
    failure: build.status === "FAILED" ? explainFailure(build.failure_state) : null,
    reusedFrom: build.reused_from ?? null,
  };
}

export interface RequestBuildResult {
  build: BuildView;
  reused: boolean;
  entitlementRemaining: { builds: number };
}

export async function requestBuild(
  deps: FactoryDeps,
  actor: Actor,
  projectId: string,
  input: { uiTemplate: string; accept?: boolean },
): Promise<RequestBuildResult> {
  const project = await deps.workspace(actor.userId)("getProject", { projectId });
  if (!project.ok) fail(404, "PROJECT_NOT_FOUND", "That project does not exist.");

  const spec = project.spec as ProjectView["spec"];
  if (!spec) fail(409, "NO_SPEC_YET", "Describe the processor and review the plan before building.");
  if (!(UI_TEMPLATES as readonly string[]).includes(input.uiTemplate)) {
    fail(400, "INVALID_UI_TEMPLATE", "Choose one of the three Zarlino interfaces.");
  }
  if (input.accept !== true) fail(400, "NOT_CONFIRMED", "Confirm the build before it is started.");

  const template = input.uiTemplate as UiTemplate;
  const snapshot = await authorise(deps, actor, { kind: "build" });
  const sha = spec.sha256;

  // Exactly the same immutable build already exists: reuse it, charge nothing.
  const reusable = await deps.workspace(actor.userId)("findReusableBuild", { sha256: sha, uiTemplate: template });
  if (reusable.ok) {
    const original = reusable.build as BuildRecord;
    const buildId = id(deps, "fb");
    const created = await deps.workspace(actor.userId)("createBuild", {
      projectId,
      plan: actor.plan,
      build: {
        ...original,
        id: buildId,
        project_id: projectId,
        user_id: actor.userId,
        spec_id: spec.id,
        reused_from: original.id,
        created_at: at(deps),
        updated_at: at(deps),
        completed_at: original.completed_at ?? at(deps),
      },
    });
    if (!created.ok) fail(500, "STORE_ERROR", "Could not record the build.");
    await track(deps, "build_reused", actor.userId, { projectId, buildId, reusedFrom: original.id });
    return {
      build: buildView(deps, created.build as BuildRecord),
      reused: true,
      entitlementRemaining: {
        builds: Math.max(0, entitlementsFor(actor.plan).buildsPerMonth - snapshot.buildsThisMonth),
      },
    };
  }

  const buildId = id(deps, "fb");
  const plan = compilePlan(spec.spec);
  const draft: BuildRecord = {
    id: buildId,
    project_id: projectId,
    user_id: actor.userId,
    spec_id: spec.id,
    spec_sha256: sha,
    ui_template: template,
    product_name: plan.title,
    status: "QUEUED",
    failure_state: null,
    failure_message: null,
    github_run_id: null,
    github_run_url: null,
    qa_passed: null,
    artifact_name: null,
    artifact_key: null,
    artifact_bytes: null,
    artifact_sha256: null,
    compile_seconds: 0,
    test_seconds: 0,
    ai_cost_usd: 0,
    estimated_cost_usd: 0,
    reused_from: null,
    request_id: id(deps, "req"),
    created_at: at(deps),
    updated_at: at(deps),
    completed_at: null,
  };

  const created = await deps.workspace(actor.userId)("createBuild", { projectId, build: draft, plan: actor.plan });
  if (!created.ok) {
    const code = String(created.code ?? "STORE_ERROR");
    if (code === "BUILD_ALLOWANCE") {
      fail(402, code, `Your plan includes ${created.limit} builds per month and you have used them all.`, {
        upgrade: actor.plan === "free",
        limit: created.limit,
      });
    }
    if (code === "CONCURRENT_BUILDS") {
      fail(402, code, `You already have ${created.limit} build running. Wait for it to finish before starting another.`, {
        upgrade: actor.plan === "free",
        limit: created.limit,
      });
    }
    fail(500, "STORE_ERROR", "Could not record the build.");
  }

  await deps.workspace(actor.userId)("recordUsage", {
    events: [
      { kind: "build.request", quantity: 1, unit: "build", cost_usd: 0, project_id: projectId, build_id: buildId, created_at: at(deps) },
    ],
  });

  const dispatched = await deps.builds.dispatch({
    buildId,
    requestId: draft.request_id!,
    accountId: actor.userId,
    productId: spec.spec.plugin.id,
    productName: plan.title,
    productVersion: spec.spec.plugin.version,
    uiTemplate: template,
    spec: JSON.parse(JSON.stringify(spec.spec)),
    specSha256: sha,
  });

  await track(deps, "build_requested", actor.userId, { projectId, buildId, uiTemplate: template });

  if (!dispatched.ok) {
    const failureState = dispatchFailureState(dispatched.code);
    const updated = await deps.workspace(actor.userId)("updateBuild", {
      buildId,
      patch: {
        status: "FAILED",
        failure_state: failureState,
        failure_message: dispatched.message,
        github_run_url: dispatched.build?.githubRunUrl ?? null,
        completed_at: at(deps),
      },
    });
    const view = buildView(deps, (updated.build as BuildRecord) ?? { ...draft, status: "FAILED", failure_state: failureState });
    return { build: view, reused: false, entitlementRemaining: { builds: 0 } };
  }

  await deps.identity("indexBuild", { buildId, userId: actor.userId, projectId });
  await deps.workspace(actor.userId)("updateProject", { projectId, status: "building" });

  // The dispatch response is the orchestrator's first view of the build; fold it
  // exactly as a later status poll would, so a build that finishes immediately
  // (or fails immediately) is never left looking queued.
  const remote = dispatched.build as RemoteBuild;
  const folded = await foldRemoteBuild(deps, actor, { ...draft, request_id: draft.request_id }, remote);

  return {
    build: buildView(deps, folded),
    reused: false,
    entitlementRemaining: {
      builds: Math.max(0, entitlementsFor(actor.plan).buildsPerMonth - snapshot.buildsThisMonth - 1),
    },
  };
}

function dispatchFailureState(code: string): string {
  switch (code) {
    case "DISPATCH_NOT_CONFIGURED":
      return "DISPATCH_NOT_CONFIGURED";
    case "DISPATCH_UNAUTHORIZED":
      return "DISPATCH_UNAUTHORIZED";
    case "WORKFLOW_NOT_FOUND":
      return "WORKFLOW_NOT_FOUND";
    case "BUILD_SERVICE_UNREACHABLE":
    case "BUILD_SERVICE_BAD_RESPONSE":
    case "BUILD_DISPATCH_FAILED":
      return "DISPATCH_FAILED";
    default:
      return "DISPATCH_FAILED";
  }
}

/**
 * Fold the orchestrator's view of a build into our durable record: state,
 * artifact, timings, cost and the analytics/usage side effects.
 *
 * Both paths that learn something new about a build go through here (a dispatch
 * response and a status poll), so a build that finishes instantly is treated
 * exactly like one that finishes five minutes later.
 */
async function foldRemoteBuild(
  deps: FactoryDeps,
  actor: Actor,
  build: BuildRecord,
  fresh: RemoteBuild,
): Promise<BuildRecord> {
  const patch: Partial<BuildRecord> = {
    status: fresh.status,
    failure_state: fresh.failureState,
    github_run_url: fresh.githubRunUrl,
    qa_passed: fresh.qaPassed ? 1 : 0,
    compile_seconds: fresh.timings.compileSeconds,
    test_seconds: fresh.timings.testSeconds,
    updated_at: at(deps),
  };

  if (fresh.status === "READY" && fresh.qaPassed && fresh.artifact) {
    patch.artifact_name = fresh.artifact.name;
    patch.artifact_key = fresh.artifact.key;
    patch.artifact_bytes = fresh.artifact.bytes;
    patch.artifact_sha256 = fresh.artifact.sha256;
    patch.completed_at = fresh.completedAt ?? at(deps);
    patch.estimated_cost_usd = estimateBuildVariableCost({
      compileSeconds: fresh.timings.compileSeconds,
      testSeconds: fresh.timings.testSeconds,
      artifactBytes: fresh.artifact.bytes ?? 0,
      aiCostUsd: fresh.cost.aiCostUsd,
    });

    // Charge the metering exactly once, the first time this build becomes real.
    const alreadyRecorded = await deps.workspace(actor.userId)("getArtifact", { buildId: build.id });

    await deps.workspace(actor.userId)("saveArtifact", {
      artifact: {
        build_id: build.id,
        user_id: actor.userId,
        project_id: build.project_id,
        object_key: fresh.artifact.key ?? "",
        name: fresh.artifact.name,
        bytes: fresh.artifact.bytes ?? 0,
        sha256: fresh.artifact.sha256 ?? "",
        qa_passed: 1,
        created_at: at(deps),
      },
    });

    if (!alreadyRecorded.ok) {
      await deps.workspace(actor.userId)("recordUsage", {
        events: [
          {
            kind: "build.seconds",
            quantity: fresh.timings.compileSeconds + fresh.timings.testSeconds,
            unit: "second",
            cost_usd: 0,
            project_id: build.project_id,
            build_id: build.id,
            created_at: at(deps),
          },
          {
            kind: "build.artifact_bytes",
            quantity: fresh.artifact.bytes ?? 0,
            unit: "byte",
            cost_usd: 0,
            project_id: build.project_id,
            build_id: build.id,
            created_at: at(deps),
          },
          {
            kind: "build.cost_usd",
            quantity: patch.estimated_cost_usd!,
            unit: "usd",
            cost_usd: patch.estimated_cost_usd!,
            project_id: build.project_id,
            build_id: build.id,
            created_at: at(deps),
          },
        ],
      });
    }

    await track(deps, "build_passed", actor.userId, {
      projectId: build.project_id,
      buildId: build.id,
      uiTemplate: build.ui_template,
      compileSeconds: fresh.timings.compileSeconds,
      costUsd: patch.estimated_cost_usd,
    });
    await deps.workspace(actor.userId)("updateProject", { projectId: build.project_id, status: "ready" });
  } else if (fresh.status === "FAILED") {
    patch.completed_at = fresh.completedAt ?? at(deps);
    await track(deps, "build_failed", actor.userId, {
      projectId: build.project_id,
      buildId: build.id,
      failureState: fresh.failureState,
    });
    await deps.workspace(actor.userId)("updateProject", { projectId: build.project_id, status: "failed" });
  }

  const updated = await deps.workspace(actor.userId)("updateBuild", { buildId: build.id, patch });
  return (updated.build as BuildRecord) ?? { ...build, ...patch };
}

/** Pull the orchestrator's view of a build and fold it into our record. */
export async function refreshBuild(deps: FactoryDeps, actor: Actor, buildId: string): Promise<BuildView> {
  const local = await deps.workspace(actor.userId)("getBuild", { buildId });
  if (!local.ok) fail(404, "BUILD_NOT_FOUND", "That build does not exist.");
  const build = local.build as BuildRecord;

  if (build.status === "READY" || build.status === "FAILED") return buildView(deps, build);

  const remote = await deps.builds.status(buildId);
  if (!remote.ok) return buildView(deps, build);

  const folded = await foldRemoteBuild(deps, actor, build, remote.build);
  return buildView(deps, folded);
}

export async function listBuilds(deps: FactoryDeps, actor: Actor, projectId?: string): Promise<{ builds: BuildView[] }> {
  const result = await deps.workspace(actor.userId)("listBuilds", { projectId, limit: 50 });
  if (!result.ok) return { builds: [] };
  return { builds: (result.builds as BuildRecord[]).map((build) => buildView(deps, build)) };
}

/**
 * The download gate. A failed build, an unverified artifact, a build that was
 * never QA-passed, or an expired retention window can never produce bytes.
 */
export async function authoriseDownload(
  deps: FactoryDeps,
  actor: Actor,
  buildId: string,
): Promise<{ key: string; name: string; bytes: number | null; sha256: string | null }> {
  const local = await deps.workspace(actor.userId)("getBuild", { buildId });
  if (!local.ok) fail(404, "BUILD_NOT_FOUND", "That build does not exist.");
  const build = local.build as BuildRecord;

  if (build.status !== "READY" || build.qa_passed !== 1 || !build.artifact_key) {
    fail(409, "NOT_READY", "This build is not a downloadable plugin. Only a build that passed the quality check can be downloaded.", {
      failure: build.status === "FAILED" ? explainFailure(build.failure_state) : null,
    });
  }

  const artifact = await deps.workspace(actor.userId)("getArtifact", { buildId });
  if (!artifact.ok) fail(409, "NOT_READY", "No verified artifact is recorded for this build.");

  const completedAt = build.completed_at ? new Date(build.completed_at).getTime() : Date.now();
  const ageDays = (Date.now() - completedAt) / 86_400_000;
  const decision = evaluateEntitlement(actor.plan, await usageSnapshot(deps, actor), { kind: "download", artifactAgeDays: ageDays });
  if (!decision.allowed) fail(402, decision.reason, decision.message, { upgrade: decision.upgrade });

  const record = artifact.artifact as { object_key: string; name: string; bytes: number; sha256: string };
  // The stored key must address THIS build and nothing else: a prefix-only check
  // would let a tampered record serve another build's bytes.
  const expectedPrefix = `factory-builds/${build.id}/`;
  if (!record.object_key.startsWith(expectedPrefix) || record.object_key.includes("..") || record.object_key.includes("\\")) {
    fail(500, "ARTIFACT_INVALID", "The stored artifact reference is invalid.");
  }

  await track(deps, "download", actor.userId, { buildId, projectId: build.project_id });
  return { key: record.object_key, name: record.name, bytes: record.bytes ?? null, sha256: record.sha256 ?? null };
}

// ---------------------------------------------------------------------------
// Billing
// ---------------------------------------------------------------------------

export function plansView(): Record<string, unknown> {
  return {
    version: PRICING_VERSION,
    currency: PRICING.currency,
    plans: PLAN_IDS.map((planId) => PLANS[planId]),
  };
}

export async function startCheckout(
  deps: FactoryDeps,
  actor: Actor,
  input: { plan?: PlanId },
): Promise<Record<string, unknown>> {
  const plan: PlanId = input.plan === "pro" ? "pro" : (PRICING.defaultPlan as PlanId);
  const price = planPriceMinor(plan);
  if (!price) fail(400, "PLAN_NOT_PURCHASABLE", "That plan is not purchasable.");

  const reference = id(deps, "zf");
  const result = await initializeTransaction(
    { ...deps.billing, fetchImpl: deps.billing.fetchImpl },
    { email: actor.email, userId: actor.userId, plan, reference },
  );
  if (!result.ok) fail(503, result.code, result.message);

  await track(deps, "checkout_started", actor.userId, { plan, reference });
  return { authorizationUrl: result.authorizationUrl, reference: result.reference, amountMinor: result.amountMinor, currency: result.currency };
}

/**
 * Apply a verified payment to an account. Idempotent on the transaction
 * reference, so the webhook and the return page can both arrive.
 */
export async function applyVerifiedPayment(
  deps: FactoryDeps,
  verified: VerifyResult,
): Promise<{ granted: boolean; plan: string | null; reason?: string }> {
  if (!verified.ok) return { granted: false, plan: null, reason: verified.message };
  if (!verified.paid || !verified.plan) return { granted: false, plan: null, reason: "PAYMENT_NOT_SUCCESSFUL" };

  const userId = verified.userId;
  if (!userId) return { granted: false, plan: null, reason: "NO_ACCOUNT" };

  const result = await deps.identity("grantPlan", {
    userId,
    plan: verified.plan,
    reference: verified.reference,
    eventId: `paystack:${verified.reference}`,
    provider: "paystack",
    payloadSha256: await sha256Hex(`${verified.reference}:${verified.amountMinor}:${verified.plan}`),
    source: "paystack",
  });

  if (!result.ok) return { granted: false, plan: null, reason: "ACCOUNT_NOT_FOUND" };
  await track(deps, result.granted ? "paid_conversion" : "payment_duplicate", userId, {
    plan: verified.plan,
    amountMinor: verified.amountMinor,
    currency: verified.currency,
  });
  return { granted: result.granted === true, plan: String(result.plan ?? verified.plan) };
}

export async function verifyReturn(
  deps: FactoryDeps,
  actor: Actor,
  reference: string,
): Promise<{ paid: boolean; plan: string | null; granted: boolean; message: string }> {
  const verified = await verifyTransaction(deps.billing, reference);
  if (!verified.ok) fail(503, verified.code, verified.message);

  if (!verified.paid) {
    return { paid: false, plan: null, granted: false, message: "That payment has not completed." };
  }
  // The transaction must belong to the signed-in account: a reference from
  // another customer is never redeemable here.
  if (verified.userId && verified.userId !== actor.userId) {
    fail(403, "PAYMENT_OWNERSHIP", "That payment belongs to a different account.");
  }

  const applied = await applyVerifiedPayment(deps, verified);
  return {
    paid: true,
    plan: applied.plan,
    granted: applied.granted,
    message: applied.granted ? "Pro is active." : "This payment was already applied.",
  };
}

export interface WebhookOutcome {
  status: number;
  body: Record<string, unknown>;
}

/** Paystack webhook: signature first, then verify with the provider. */
export async function handleWebhook(
  deps: FactoryDeps,
  rawBody: string,
  signature: string | null,
): Promise<WebhookOutcome> {
  const secret = deps.billing.secretKey;
  if (!secret) return { status: 503, body: { error: "not configured" } };

  const valid = await verifyWebhookSignature(secret, rawBody, signature);
  if (!valid) return { status: 401, body: { error: "invalid signature" } };

  let event: { event?: string; data?: { reference?: string } };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return { status: 400, body: { error: "invalid payload" } };
  }

  // Only charge outcomes matter to us; everything else is acknowledged and
  // ignored, which is what Paystack expects.
  if (event.event !== "charge.success") return { status: 200, body: { ok: true, ignored: event.event ?? null } };

  const reference = event.data?.reference;
  if (!reference) return { status: 200, body: { ok: true, ignored: "no reference" } };

  // Re-fetch from the provider: the webhook body is never itself the evidence.
  const verified = await verifyTransaction(deps.billing, reference);
  if (!verified.ok) return { status: 200, body: { ok: true, deferred: true } };

  const applied = await applyVerifiedPayment(deps, verified);
  return { status: 200, body: { ok: true, granted: applied.granted, ...(applied.reason ? { reason: applied.reason } : {}) } };
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

// ---------------------------------------------------------------------------
// Founder metrics
// ---------------------------------------------------------------------------

export async function metricsView(deps: FactoryDeps, sinceDays = 30): Promise<Record<string, unknown>> {
  const since = new Date(Date.now() - sinceDays * 86_400_000).toISOString();
  const analytics = await deps.identity("analytics", { since });
  const counts = (analytics.counts as Array<{ name: string; n: number }>) ?? [];
  const byName = Object.fromEntries(counts.map((row) => [row.name, Number(row.n)]));

  const modules = (analytics.modules as Array<{ modules: string | null }>) ?? [];
  const moduleUsage: Record<string, number> = {};
  for (const row of modules) {
    if (!row.modules) continue;
    try {
      const ids = JSON.parse(row.modules) as unknown;
      if (!Array.isArray(ids)) continue;
      for (const moduleId of ids) {
        if (typeof moduleId === "string") moduleUsage[moduleId] = (moduleUsage[moduleId] ?? 0) + 1;
      }
    } catch {
      /* a malformed row must not break the report */
    }
  }

  const signups = byName.signup ?? 0;
  const validSpecs = byName.spec_valid ?? 0;
  const buildRequests = byName.build_requested ?? 0;
  const buildPasses = byName.build_passed ?? 0;
  const downloads = byName.download ?? 0;
  const paid = byName.paid_conversion ?? 0;

  return {
    window: { since, days: sinceDays },
    funnel: {
      signup: signups,
      firstPrompt: byName.ai_prompt ?? 0,
      validSpec: validSpecs,
      uiSelected: byName.build_requested ?? 0,
      buildRequested: buildRequests,
      buildPassed: buildPasses,
      download: downloads,
      repeatBuild: byName.build_reused ?? 0,
      paidConversion: paid,
    },
    rates: {
      signupToValidSpec: signups > 0 ? Number((validSpecs / signups).toFixed(4)) : 0,
      buildSuccessRate: buildRequests > 0 ? Number((buildPasses / buildRequests).toFixed(4)) : 0,
      freeToPaid: signups > 0 ? Number((paid / signups).toFixed(4)) : 0,
      unsupportedRequests: byName.request_unsupported ?? 0,
      invalidSpecs: byName.spec_invalid ?? 0,
    },
    moduleUsage,
    users: analytics.users ?? 0,
  };
}
