/**
 * Store operations â€” the only code that touches customer SQL.
 *
 * Each operation is a pure function of (Sql, arguments), so the same code runs
 * inside the Durable Object in production and against node:sqlite in tests.
 * Every workspace operation takes `userId` and filters on it; a mismatched
 * identifier returns the same "not found" as a row that never existed.
 */

import {
  analyticsCounts,
  bumpRateLimit,
  countActiveBuilds,
  countBuildsSince,
  countProjects,
  countUsers,
  findReusableBuild,
  getArtifact,
  getBuild,
  getProject,
  getSpec,
  indexBuild,
  insertAnalyticsEvent,
  insertArtifact,
  insertBuild,
  insertEntitlement,
  insertMessage,
  insertProject,
  insertSpecRevision,
  insertUsage,
  latestEntitlement,
  latestSpec,
  latestSuccessfulBuild,
  listBuilds,
  listMessages,
  listProjects,
  lookupBuildOwner,
  monthStartIso,
  nextRevision,
  publicUser,
  recordPaymentEventOnce,
  setUserPlan,
  softDeleteProject,
  sumUsage,
  totalArtifactBytes,
  updateBuild,
  updateProject,
  usageReport,
  type ArtifactRecord,
  type BuildRecord,
  type Sql,
  type UsageEventRecord,
  type UserRecord,
} from "./store";
import { login, logout, resolveSession, signup } from "./auth";
import { entitlementSummary, entitlementsFor } from "./pricing";

export type OpResult = Record<string, unknown>;

export interface OpContext {
  sql: Sql;
  now?: () => Date;
}

function now(ctx: OpContext): () => Date {
  return ctx.now ?? (() => new Date());
}

export function publicIdentity(user: UserRecord, plan: string): Record<string, unknown> {
  return {
    ...publicUser(user, entitlementsFor(plan).commercialUse),
    plan,
  };
}

// ---------------------------------------------------------------------------
// Identity operations
// ---------------------------------------------------------------------------

export async function identityOp(ctx: OpContext, op: string, args: Record<string, unknown>): Promise<OpResult> {
  const at = () => now(ctx)();

  switch (op) {
    case "signup": {
      const result = await signup(
        ctx.sql,
        {
          email: String(args.email ?? ""),
          password: String(args.password ?? ""),
          displayName: args.displayName === undefined ? undefined : String(args.displayName),
        },
        { now: now(ctx) },
      );
      if (!result.ok) return { ok: false, code: result.code, message: result.message };
      insertAnalyticsEvent(ctx.sql, { name: "signup", user_id: result.user.id, created_at: at().toISOString() });
      return { ok: true, user: publicIdentity(result.user, result.user.plan), token: result.token, expiresAt: result.expiresAt };
    }

    case "login": {
      const result = await login(ctx.sql, String(args.email ?? ""), String(args.password ?? ""), { now: now(ctx) });
      if (!result.ok) return { ok: false, code: result.code, message: result.message };
      return { ok: true, user: publicIdentity(result.user, result.user.plan), token: result.token, expiresAt: result.expiresAt };
    }

    case "logout": {
      await logout(ctx.sql, args.token === undefined ? null : String(args.token));
      return { ok: true };
    }

    case "session": {
      const resolved = await resolveSession(ctx.sql, args.token === undefined || args.token === null ? null : String(args.token), now(ctx));
      if (!resolved) return { ok: true, authenticated: false };
      return { ok: true, authenticated: true, user: publicIdentity(resolved.user, resolved.user.plan), tokenHash: resolved.tokenHash };
    }

    case "plan": {
      const user = findBy(ctx, String(args.userId ?? ""));
      if (!user) return { ok: false, code: "NOT_FOUND" };
      return { ok: true, plan: user.plan, entitlements: entitlementsFor(user.plan) };
    }

    case "rateLimit": {
      const windowStart = Number(args.windowStart ?? 0);
      const count = bumpRateLimit(ctx.sql, String(args.bucket ?? ""), windowStart, at().toISOString());
      return { ok: true, count };
    }

    case "track": {
      insertAnalyticsEvent(ctx.sql, {
        name: String(args.name ?? "unknown"),
        user_id: args.userId === undefined ? null : String(args.userId),
        anonymous_id: args.anonymousId === undefined ? null : String(args.anonymousId),
        props: typeof args.props === "object" && args.props !== null ? (args.props as Record<string, unknown>) : undefined,
        created_at: at().toISOString(),
      });
      return { ok: true };
    }

    case "analytics": {
      const since = String(args.since ?? new Date(Date.now() - 30 * 86_400_000).toISOString());
      const modules = ctx.sql.all<{ modules: string | null }>(
        "SELECT json_extract(props_json, '$.modules') AS modules FROM analytics_events WHERE name = 'spec_valid' AND created_at >= ?",
        since,
      );
      return { ok: true, counts: analyticsCounts(ctx.sql, since), modules, users: countUsers(ctx.sql) };
    }

    case "indexBuild": {
      indexBuild(ctx.sql, String(args.buildId ?? ""), String(args.userId ?? ""), String(args.projectId ?? ""), at().toISOString());
      return { ok: true };
    }

    case "buildOwner": {
      const owner = lookupBuildOwner(ctx.sql, String(args.buildId ?? ""));
      return owner ? { ok: true, owner } : { ok: false, code: "NOT_FOUND" };
    }

    // ---- billing -----------------------------------------------------------
    case "paymentSeen": {
      const rows = ctx.sql.all<{ id: string }>(
        "SELECT id FROM payment_events WHERE reference = ? AND event_type = 'grant'",
        String(args.reference ?? ""),
      );
      return { ok: true, seen: rows.length > 0 };
    }

    /**
     * Atomic: record the payment event (idempotency), then upgrade the plan.
     * Returns `granted: false` when the event was already processed, so the
     * caller can answer "already applied" instead of double-granting.
     */
    case "grantPlan": {
      const reference = String(args.reference ?? "");
      const userId = String(args.userId ?? "");
      const eventId = String(args.eventId ?? "");
      const plan = String(args.plan ?? "");
      const user = findBy(ctx, userId);
      if (!user) return { ok: false, code: "NOT_FOUND" };

      const firstTime = recordPaymentEventOnce(ctx.sql, {
        id: eventId,
        provider: String(args.provider ?? "paystack"),
        event_type: "grant",
        reference,
        user_id: userId,
        payload_sha256: String(args.payloadSha256 ?? ""),
        received_at: at().toISOString(),
      });
      if (!firstTime) return { ok: true, granted: false, plan: user.plan };

      const current = latestEntitlement(ctx.sql, userId);
      const grantId = String(args.grantId ?? `ent_${reference.slice(0, 24)}`);
      insertEntitlement(ctx.sql, {
        id: grantId,
        user_id: userId,
        plan,
        source: String(args.source ?? "paystack"),
        reference,
        starts_at: at().toISOString(),
        expires_at: args.expiresAt === undefined ? null : String(args.expiresAt),
        created_at: at().toISOString(),
      });
      setUserPlan(ctx.sql, userId, plan, String(args.source ?? "paystack"), reference, at().toISOString());
      return { ok: true, granted: true, plan, previousPlan: current?.plan === plan ? plan : user.plan };
    }

    case "grantPlanIfNewReference": {
      // Same as grantPlan but keyed by reference rather than event id: a webhook
      // and a return-page verification for the same charge must apply once.
      const reference = String(args.reference ?? "");
      const existing = ctx.sql.all<{ id: string }>(
        "SELECT id FROM payment_events WHERE reference = ? AND event_type = 'grant'",
        reference,
      );
      if (existing.length > 0) return { ok: true, granted: false };
      return identityOp(ctx, "grantPlan", args);
    }

    default:
      return { ok: false, code: "UNKNOWN_OP" };
  }
}

function findBy(ctx: OpContext, userId: string): UserRecord | null {
  if (!userId) return null;
  const rows = ctx.sql.all<UserRecord>("SELECT * FROM users WHERE id = ?", userId);
  return rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// Workspace operations
// ---------------------------------------------------------------------------

export async function workspaceOp(ctx: OpContext, op: string, args: Record<string, unknown>): Promise<OpResult> {
  const userId = String(args.userId ?? "");
  if (!userId) return { ok: false, code: "UNAUTHORIZED" };
  const at = () => now(ctx)();

  switch (op) {
    case "createProject": {
      const projectId = String(args.projectId ?? "");
      if (!projectId) return { ok: false, code: "INVALID" };
      insertProject(ctx.sql, {
        id: projectId,
        user_id: userId,
        name: String(args.name ?? "Untitled").slice(0, 80),
        description: String(args.description ?? "").slice(0, 400),
        status: "drafting",
        created_at: at().toISOString(),
        updated_at: at().toISOString(),
        deleted_at: null,
      });
      return { ok: true, project: getProject(ctx.sql, userId, projectId) };
    }

    case "listProjects": {
      const projects = listProjects(ctx.sql, userId).map((project) => {
        const spec = latestSpec(ctx.sql, userId, project.id);
        const ready = latestSuccessfulBuild(ctx.sql, userId, project.id);
        const builds = listBuilds(ctx.sql, userId, { projectId: project.id, limit: 5 });
        return {
          id: project.id,
          name: project.name,
          status: project.status,
          createdAt: project.created_at,
          updatedAt: project.updated_at,
          productName: spec ? (JSON.parse(spec.spec_json) as { plugin?: { name?: string } }).plugin?.name ?? null : null,
          uiTemplate: builds[0]?.ui_template ?? null,
          buildState: builds[0]?.status ?? null,
          latestBuildId: builds[0]?.id ?? null,
          latestReadyBuildId: ready?.id ?? null,
          failureReason: builds[0]?.status === "FAILED" ? builds[0]?.failure_state ?? null : null,
        };
      });
      return { ok: true, projects };
    }

    case "getProject": {
      const project = getProject(ctx.sql, userId, String(args.projectId ?? ""));
      if (!project) return { ok: false, code: "NOT_FOUND" };
      const spec = latestSpec(ctx.sql, userId, project.id);
      const builds = listBuilds(ctx.sql, userId, { projectId: project.id, limit: 20 });
      const messages = listMessages(ctx.sql, userId, project.id, 40);
      return {
        ok: true,
        project,
        spec: spec ? { id: spec.id, revision: spec.revision, spec: JSON.parse(spec.spec_json), sha256: spec.spec_sha256, source: spec.source, createdAt: spec.created_at } : null,
        plan: spec ? JSON.parse(spec.plan_json) : null,
        builds,
        messages: messages.map((message) => ({ role: message.role, content: message.content, at: message.created_at })),
      };
    }

    case "updateProject": {
      const projectId = String(args.projectId ?? "");
      if (!getProject(ctx.sql, userId, projectId)) return { ok: false, code: "NOT_FOUND" };
      updateProject(
        ctx.sql,
        userId,
        projectId,
        {
          name: args.name === undefined ? undefined : String(args.name).slice(0, 80),
          description: args.description === undefined ? undefined : String(args.description).slice(0, 400),
          status: args.status === undefined ? undefined : String(args.status),
        },
        at().toISOString(),
      );
      return { ok: true, project: getProject(ctx.sql, userId, projectId) };
    }

    case "deleteProject": {
      const projectId = String(args.projectId ?? "");
      if (!getProject(ctx.sql, userId, projectId)) return { ok: false, code: "NOT_FOUND" };
      softDeleteProject(ctx.sql, userId, projectId, at().toISOString());
      return { ok: true };
    }

    case "saveSpec": {
      const projectId = String(args.projectId ?? "");
      if (!getProject(ctx.sql, userId, projectId)) return { ok: false, code: "NOT_FOUND" };
      const revision = nextRevision(ctx.sql, userId, projectId);
      const specId = String(args.specId ?? "");
      insertSpecRevision(ctx.sql, {
        id: specId,
        project_id: projectId,
        user_id: userId,
        revision,
        spec_json: String(args.specJson ?? "{}"),
        spec_sha256: String(args.sha256 ?? ""),
        plan_json: String(args.planJson ?? "{}"),
        source: String(args.source ?? "ai"),
        ai_model: args.aiModel === undefined ? null : String(args.aiModel),
        ai_cost_usd: Number(args.aiCostUsd ?? 0),
        created_at: at().toISOString(),
      });
      updateProject(ctx.sql, userId, projectId, { status: "reviewing" }, at().toISOString());
      return { ok: true, revision, specId };
    }

    case "addMessage": {
      const projectId = String(args.projectId ?? "");
      if (!getProject(ctx.sql, userId, projectId)) return { ok: false, code: "NOT_FOUND" };
      insertMessage(ctx.sql, {
        id: String(args.id ?? ""),
        project_id: projectId,
        user_id: userId,
        role: args.role === "assistant" ? "assistant" : args.role === "system" ? "system" : "user",
        content: String(args.content ?? "").slice(0, 4000),
        spec_id: args.specId === undefined ? null : String(args.specId),
        created_at: at().toISOString(),
      });
      return { ok: true };
    }

    case "getSpec": {
      const spec = getSpec(ctx.sql, userId, String(args.projectId ?? ""), String(args.specId ?? ""));
      return spec ? { ok: true, spec } : { ok: false, code: "NOT_FOUND" };
    }

    case "usageSnapshot": {
      const since = monthStartIso(now(ctx)());
      const report = usageReport(ctx.sql, userId, since);
      const snapshot = {
        buildsThisMonth: report.buildRequests,
        aiRequestsThisMonth: report.aiRequests,
        aiTokensThisMonth: report.aiTokens,
        activeBuilds: countActiveBuilds(ctx.sql, userId),
        projects: countProjects(ctx.sql, userId),
      };
      return { ok: true, snapshot, report, summary: entitlementSummary(String(args.plan ?? "free"), snapshot) };
    }

    case "recordUsage": {
      const events = Array.isArray(args.events) ? (args.events as UsageEventRecord[]) : [];
      for (const event of events) {
        insertUsage(ctx.sql, { ...event, user_id: userId, created_at: event.created_at ?? at().toISOString() });
      }
      return { ok: true, recorded: events.length };
    }

    case "createBuild": {
      const projectId = String(args.projectId ?? "");
      if (!getProject(ctx.sql, userId, projectId)) return { ok: false, code: "NOT_FOUND" };
      const record = args.build as BuildRecord;
      if (!record || record.user_id !== userId) return { ok: false, code: "INVALID" };
      insertBuild(ctx.sql, { ...record, project_id: projectId, user_id: userId });
      return { ok: true, build: getBuild(ctx.sql, userId, record.id) };
    }

    case "updateBuild": {
      const build = updateBuild(
        ctx.sql,
        userId,
        String(args.buildId ?? ""),
        (args.patch ?? {}) as Partial<BuildRecord>,
        at().toISOString(),
      );
      return build ? { ok: true, build } : { ok: false, code: "NOT_FOUND" };
    }

    case "getBuild": {
      const build = getBuild(ctx.sql, userId, String(args.buildId ?? ""));
      return build ? { ok: true, build } : { ok: false, code: "NOT_FOUND" };
    }

    case "listBuilds": {
      return {
        ok: true,
        builds: listBuilds(ctx.sql, userId, {
          projectId: args.projectId === undefined ? undefined : String(args.projectId),
          limit: args.limit === undefined ? undefined : Number(args.limit),
        }),
      };
    }

    case "findReusableBuild": {
      const build = findReusableBuild(ctx.sql, userId, String(args.sha256 ?? ""), String(args.uiTemplate ?? ""));
      return build ? { ok: true, build } : { ok: false, code: "NOT_FOUND" };
    }

    case "saveArtifact": {
      const artifact = args.artifact as ArtifactRecord;
      if (!artifact || artifact.user_id !== userId) return { ok: false, code: "INVALID" };
      insertArtifact(ctx.sql, artifact);
      return { ok: true };
    }

    case "getArtifact": {
      const artifact = getArtifact(ctx.sql, userId, String(args.buildId ?? ""));
      return artifact ? { ok: true, artifact } : { ok: false, code: "NOT_FOUND" };
    }

    case "totals": {
      return {
        ok: true,
        artifactBytes: totalArtifactBytes(ctx.sql, userId),
        buildsThisMonth: countBuildsSince(ctx.sql, userId, monthStartIso(now(ctx)())),
        aiCost: sumUsage(ctx.sql, userId, "ai.cost_usd", monthStartIso(now(ctx)())).cost,
      };
    }

    default:
      return { ok: false, code: "UNKNOWN_OP" };
  }
}
