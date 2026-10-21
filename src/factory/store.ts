/**
 * The customer data model.
 *
 * Two stores, deliberately:
 *
 *   FactoryIdentity  (one instance, "global")
 *       accounts, password hashes, sessions, plan/entitlement grants,
 *       payment events (idempotency), rate-limit buckets, funnel analytics and
 *       the buildId -> userId index used only by the build callback.
 *
 *   FactoryWorkspace (one instance PER USER, id = the user id)
 *       projects, spec revisions, conversation, builds, artifacts, usage.
 *
 * Isolation is therefore structural, not just a WHERE clause: the workspace
 * instance is addressed by the authenticated user's id and by nothing else, so
 * no request can reach another customer's rows even with a valid identifier.
 * Every workspace function still takes `userId` and filters on it, so the
 * invariant also holds if the class is ever reused differently, and the tests
 * assert that a cross-account read is indistinguishable from a missing row.
 */

export type SqlParam = string | number | boolean | bigint | null | Uint8Array;

export interface Sql {
  run(sql: string, ...params: SqlParam[]): void;
  /** eslint-disable-next-line @typescript-eslint/no-explicit-any */
  all<T = any>(sql: string, ...params: SqlParam[]): T[];
}

export const IDENTITY_SCHEMA_VERSION = 1;
export const WORKSPACE_SCHEMA_VERSION = 1;

export const IDENTITY_SQL = `
CREATE TABLE IF NOT EXISTS schema_info (key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS users (
  id                TEXT PRIMARY KEY,
  email             TEXT NOT NULL,
  email_normalised  TEXT NOT NULL UNIQUE,
  display_name      TEXT NOT NULL,
  password_hash     TEXT NOT NULL,
  password_salt     TEXT NOT NULL,
  password_iterations INTEGER NOT NULL,
  plan              TEXT NOT NULL DEFAULT 'free',
  plan_source       TEXT NOT NULL DEFAULT 'default',
  plan_reference    TEXT,
  plan_updated_at   TEXT,
  status            TEXT NOT NULL DEFAULT 'active',
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash    TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  expires_at    TEXT NOT NULL,
  last_seen_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS entitlements (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL,
  plan          TEXT NOT NULL,
  source        TEXT NOT NULL,
  reference     TEXT,
  starts_at     TEXT NOT NULL,
  expires_at    TEXT,
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS entitlements_user ON entitlements(user_id, created_at);

CREATE TABLE IF NOT EXISTS payment_events (
  id             TEXT PRIMARY KEY,
  provider       TEXT NOT NULL,
  event_type     TEXT NOT NULL,
  reference      TEXT,
  user_id        TEXT,
  payload_sha256 TEXT NOT NULL,
  received_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS rate_limits (
  bucket        TEXT PRIMARY KEY,
  window_start  INTEGER NOT NULL,
  count         INTEGER NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS analytics_events (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT NOT NULL,
  user_id      TEXT,
  anonymous_id TEXT,
  props_json   TEXT,
  created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS analytics_name_time ON analytics_events(name, created_at);

CREATE TABLE IF NOT EXISTS build_index (
  build_id    TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  project_id  TEXT NOT NULL,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS build_index_user ON build_index(user_id);
`;

export const WORKSPACE_SQL = `
CREATE TABLE IF NOT EXISTS schema_info (key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS projects (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'drafting',
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  deleted_at  TEXT
);
CREATE INDEX IF NOT EXISTS projects_user ON projects(user_id, created_at);

CREATE TABLE IF NOT EXISTS spec_revisions (
  id           TEXT PRIMARY KEY,
  project_id   TEXT NOT NULL,
  user_id      TEXT NOT NULL,
  revision     INTEGER NOT NULL,
  spec_json    TEXT NOT NULL,
  spec_sha256  TEXT NOT NULL,
  plan_json    TEXT NOT NULL,
  source       TEXT NOT NULL,
  ai_model     TEXT,
  ai_cost_usd  REAL NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL,
  UNIQUE (project_id, revision)
);
CREATE INDEX IF NOT EXISTS spec_revisions_project ON spec_revisions(user_id, project_id, revision);

CREATE TABLE IF NOT EXISTS messages (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL,
  user_id     TEXT NOT NULL,
  role        TEXT NOT NULL,
  content     TEXT NOT NULL,
  spec_id     TEXT,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS messages_project ON messages(user_id, project_id, created_at);

CREATE TABLE IF NOT EXISTS builds (
  id                    TEXT PRIMARY KEY,
  project_id            TEXT NOT NULL,
  user_id               TEXT NOT NULL,
  spec_id               TEXT NOT NULL,
  spec_sha256           TEXT NOT NULL,
  ui_template           TEXT NOT NULL,
  product_name          TEXT NOT NULL,
  status                TEXT NOT NULL,
  failure_state         TEXT,
  failure_message       TEXT,
  github_run_id         TEXT,
  github_run_url        TEXT,
  qa_passed             INTEGER,
  artifact_name         TEXT,
  artifact_key          TEXT,
  artifact_bytes        INTEGER,
  artifact_sha256       TEXT,
  compile_seconds       REAL NOT NULL DEFAULT 0,
  test_seconds          REAL NOT NULL DEFAULT 0,
  ai_cost_usd           REAL NOT NULL DEFAULT 0,
  estimated_cost_usd    REAL NOT NULL DEFAULT 0,
  reused_from           TEXT,
  request_id            TEXT,
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL,
  completed_at          TEXT
);
CREATE INDEX IF NOT EXISTS builds_user ON builds(user_id, created_at);
CREATE INDEX IF NOT EXISTS builds_project ON builds(user_id, project_id, created_at);
CREATE INDEX IF NOT EXISTS builds_identity ON builds(user_id, spec_sha256, ui_template, status);

CREATE TABLE IF NOT EXISTS artifacts (
  build_id     TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL,
  project_id   TEXT NOT NULL,
  object_key   TEXT NOT NULL,
  name         TEXT NOT NULL,
  bytes        INTEGER NOT NULL,
  sha256       TEXT NOT NULL,
  qa_passed    INTEGER NOT NULL,
  created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS artifacts_user ON artifacts(user_id, created_at);

CREATE TABLE IF NOT EXISTS usage_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     TEXT NOT NULL,
  kind        TEXT NOT NULL,
  quantity    REAL NOT NULL,
  unit        TEXT NOT NULL,
  cost_usd    REAL NOT NULL DEFAULT 0,
  project_id  TEXT,
  build_id    TEXT,
  detail_json TEXT,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS usage_kind_time ON usage_events(user_id, kind, created_at);
`;

export function nowIso(now: () => Date = () => new Date()): string {
  return now().toISOString();
}

/** Prefix + 128 random bits, hex. Ids are opaque on purpose. */
export function newId(prefix: string, random: (bytes: number) => Uint8Array = randomBytes): string {
  const bytes = random(16);
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${prefix}_${hex}`;
}

function randomBytes(count: number): Uint8Array {
  const out = new Uint8Array(count);
  crypto.getRandomValues(out);
  return out;
}

export function applyIdentitySchema(sql: Sql): void {
  sql.run(IDENTITY_SQL);
  sql.run(
    "INSERT INTO schema_info (key, value) VALUES ('identity_schema', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    String(IDENTITY_SCHEMA_VERSION),
  );
}

export function applyWorkspaceSchema(sql: Sql): void {
  sql.run(WORKSPACE_SQL);
  sql.run(
    "INSERT INTO schema_info (key, value) VALUES ('workspace_schema', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    String(WORKSPACE_SCHEMA_VERSION),
  );
}

// ---------------------------------------------------------------------------
// Identity: accounts, sessions, plans, payments, limits, analytics
// ---------------------------------------------------------------------------

export interface UserRecord {
  id: string;
  email: string;
  email_normalised: string;
  display_name: string;
  password_hash: string;
  password_salt: string;
  password_iterations: number;
  plan: string;
  plan_source: string;
  plan_reference: string | null;
  plan_updated_at: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface PublicUser {
  id: string;
  email: string;
  displayName: string;
  plan: string;
  createdAt: string;
  commercialUse: boolean;
}

export function publicUser(user: UserRecord, commercialUse: boolean): PublicUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.display_name,
    plan: user.plan,
    createdAt: user.created_at,
    commercialUse,
  };
}

export function insertUser(sql: Sql, user: UserRecord): void {
  sql.run(
    `INSERT INTO users (id, email, email_normalised, display_name, password_hash, password_salt,
       password_iterations, plan, plan_source, plan_reference, plan_updated_at, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    user.id,
    user.email,
    user.email_normalised,
    user.display_name,
    user.password_hash,
    user.password_salt,
    user.password_iterations,
    user.plan,
    user.plan_source,
    user.plan_reference,
    user.plan_updated_at,
    user.status,
    user.created_at,
    user.updated_at,
  );
}

export function findUserByEmail(sql: Sql, emailNormalised: string): UserRecord | null {
  const rows = sql.all<UserRecord>("SELECT * FROM users WHERE email_normalised = ?", emailNormalised);
  return rows[0] ?? null;
}

export function findUserById(sql: Sql, id: string): UserRecord | null {
  const rows = sql.all<UserRecord>("SELECT * FROM users WHERE id = ?", id);
  return rows[0] ?? null;
}

export function countUsers(sql: Sql): number {
  const rows = sql.all<{ n: number }>("SELECT COUNT(*) AS n FROM users");
  return Number(rows[0]?.n ?? 0);
}

export function setUserPlan(
  sql: Sql,
  userId: string,
  plan: string,
  source: string,
  reference: string | null,
  at: string,
): void {
  sql.run(
    "UPDATE users SET plan = ?, plan_source = ?, plan_reference = ?, plan_updated_at = ?, updated_at = ? WHERE id = ?",
    plan,
    source,
    reference,
    at,
    at,
    userId,
  );
}

export interface SessionRecord {
  token_hash: string;
  user_id: string;
  created_at: string;
  expires_at: string;
  last_seen_at: string;
}

export function insertSession(sql: Sql, session: SessionRecord): void {
  sql.run(
    "INSERT INTO sessions (token_hash, user_id, created_at, expires_at, last_seen_at) VALUES (?, ?, ?, ?, ?)",
    session.token_hash,
    session.user_id,
    session.created_at,
    session.expires_at,
    session.last_seen_at,
  );
}

export function findSession(sql: Sql, tokenHash: string): SessionRecord | null {
  const rows = sql.all<SessionRecord>("SELECT * FROM sessions WHERE token_hash = ?", tokenHash);
  return rows[0] ?? null;
}

export function touchSession(sql: Sql, tokenHash: string, at: string): void {
  sql.run("UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?", at, tokenHash);
}

export function deleteSession(sql: Sql, tokenHash: string): void {
  sql.run("DELETE FROM sessions WHERE token_hash = ?", tokenHash);
}

export function deleteExpiredSessions(sql: Sql, at: string): number {
  const before = sql.all<{ n: number }>("SELECT COUNT(*) AS n FROM sessions WHERE expires_at <= ?", at);
  sql.run("DELETE FROM sessions WHERE expires_at <= ?", at);
  return Number(before[0]?.n ?? 0);
}

export interface EntitlementGrant {
  id: string;
  user_id: string;
  plan: string;
  source: string;
  reference: string | null;
  starts_at: string;
  expires_at: string | null;
  created_at: string;
}

export function insertEntitlement(sql: Sql, grant: EntitlementGrant): void {
  sql.run(
    `INSERT INTO entitlements (id, user_id, plan, source, reference, starts_at, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    grant.id,
    grant.user_id,
    grant.plan,
    grant.source,
    grant.reference,
    grant.starts_at,
    grant.expires_at,
    grant.created_at,
  );
}

export function latestEntitlement(sql: Sql, userId: string): EntitlementGrant | null {
  const rows = sql.all<EntitlementGrant>(
    "SELECT * FROM entitlements WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 1",
    userId,
  );
  return rows[0] ?? null;
}

export interface PaymentEventRecord {
  id: string;
  provider: string;
  event_type: string;
  reference: string | null;
  user_id: string | null;
  payload_sha256: string;
  received_at: string;
}

/**
 * Record a payment event exactly once. Returns false when the event id was
 * already processed — the webhook/verify path must then do nothing at all.
 */
export function recordPaymentEventOnce(sql: Sql, event: PaymentEventRecord): boolean {
  const existing = sql.all<{ id: string }>("SELECT id FROM payment_events WHERE id = ?", event.id);
  if (existing.length > 0) return false;
  sql.run(
    "INSERT INTO payment_events (id, provider, event_type, reference, user_id, payload_sha256, received_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    event.id,
    event.provider,
    event.event_type,
    event.reference,
    event.user_id,
    event.payload_sha256,
    event.received_at,
  );
  return true;
}

export function hasPaymentReference(sql: Sql, reference: string): boolean {
  return sql.all<{ id: string }>("SELECT id FROM payment_events WHERE reference = ? AND event_type = 'grant'", reference).length > 0;
}

/**
 * Fixed-window counter. Returns the count AFTER incrementing, so the caller
 * compares against its own limit and the increment still happened (a rejected
 * request still costs a slot — that is what stops brute force).
 */
export function bumpRateLimit(sql: Sql, bucket: string, windowStart: number, at: string): number {
  const rows = sql.all<{ window_start: number; count: number }>("SELECT window_start, count FROM rate_limits WHERE bucket = ?", bucket);
  const existing = rows[0];
  if (!existing || existing.window_start !== windowStart) {
    sql.run(
      "INSERT INTO rate_limits (bucket, window_start, count, updated_at) VALUES (?, ?, 1, ?) ON CONFLICT(bucket) DO UPDATE SET window_start = excluded.window_start, count = 1, updated_at = excluded.updated_at",
      bucket,
      windowStart,
      at,
    );
    return 1;
  }
  sql.run("UPDATE rate_limits SET count = count + 1, updated_at = ? WHERE bucket = ?", at, bucket);
  return Number(existing.count) + 1;
}

export interface AnalyticsEventRecord {
  name: string;
  user_id?: string | null;
  anonymous_id?: string | null;
  props?: Record<string, unknown>;
  created_at: string;
}

export function insertAnalyticsEvent(sql: Sql, event: AnalyticsEventRecord): void {
  sql.run(
    "INSERT INTO analytics_events (name, user_id, anonymous_id, props_json, created_at) VALUES (?, ?, ?, ?, ?)",
    event.name,
    event.user_id ?? null,
    event.anonymous_id ?? null,
    event.props ? JSON.stringify(event.props) : null,
    event.created_at,
  );
}

export function analyticsCounts(sql: Sql, sinceIso: string): Array<{ name: string; n: number }> {
  return sql.all<{ name: string; n: number }>(
    "SELECT name, COUNT(*) AS n FROM analytics_events WHERE created_at >= ? GROUP BY name ORDER BY name",
    sinceIso,
  );
}

export function indexBuild(sql: Sql, buildId: string, userId: string, projectId: string, at: string): void {
  sql.run(
    "INSERT INTO build_index (build_id, user_id, project_id, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(build_id) DO NOTHING",
    buildId,
    userId,
    projectId,
    at,
  );
}

export function lookupBuildOwner(sql: Sql, buildId: string): { user_id: string; project_id: string } | null {
  const rows = sql.all<{ user_id: string; project_id: string }>("SELECT user_id, project_id FROM build_index WHERE build_id = ?", buildId);
  return rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// Workspace: projects, specs, messages, builds, artifacts, usage
// ---------------------------------------------------------------------------

export type ProjectStatus = "drafting" | "reviewing" | "building" | "ready" | "failed";

export interface ProjectRecord {
  id: string;
  user_id: string;
  name: string;
  description: string;
  status: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export function insertProject(sql: Sql, project: ProjectRecord): void {
  sql.run(
    `INSERT INTO projects (id, user_id, name, description, status, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NULL)`,
    project.id,
    project.user_id,
    project.name,
    project.description,
    project.status,
    project.created_at,
    project.updated_at,
  );
}

export function getProject(sql: Sql, userId: string, projectId: string): ProjectRecord | null {
  const rows = sql.all<ProjectRecord>(
    "SELECT * FROM projects WHERE id = ? AND user_id = ? AND deleted_at IS NULL",
    projectId,
    userId,
  );
  return rows[0] ?? null;
}

export function listProjects(sql: Sql, userId: string): ProjectRecord[] {
  return sql.all<ProjectRecord>(
    "SELECT * FROM projects WHERE user_id = ? AND deleted_at IS NULL ORDER BY updated_at DESC, id DESC",
    userId,
  );
}

export function countProjects(sql: Sql, userId: string): number {
  const rows = sql.all<{ n: number }>(
    "SELECT COUNT(*) AS n FROM projects WHERE user_id = ? AND deleted_at IS NULL",
    userId,
  );
  return Number(rows[0]?.n ?? 0);
}

export function updateProject(
  sql: Sql,
  userId: string,
  projectId: string,
  patch: { name?: string; description?: string; status?: string },
  at: string,
): void {
  const project = getProject(sql, userId, projectId);
  if (!project) return;
  sql.run(
    "UPDATE projects SET name = ?, description = ?, status = ?, updated_at = ? WHERE id = ? AND user_id = ?",
    patch.name ?? project.name,
    patch.description ?? project.description,
    patch.status ?? project.status,
    at,
    projectId,
    userId,
  );
}

export function softDeleteProject(sql: Sql, userId: string, projectId: string, at: string): void {
  sql.run("UPDATE projects SET deleted_at = ?, updated_at = ? WHERE id = ? AND user_id = ?", at, at, projectId, userId);
}

export interface SpecRevisionRecord {
  id: string;
  project_id: string;
  user_id: string;
  revision: number;
  spec_json: string;
  spec_sha256: string;
  plan_json: string;
  source: string;
  ai_model: string | null;
  ai_cost_usd: number;
  created_at: string;
}

export function nextRevision(sql: Sql, userId: string, projectId: string): number {
  const rows = sql.all<{ n: number | null }>(
    "SELECT MAX(revision) AS n FROM spec_revisions WHERE user_id = ? AND project_id = ?",
    userId,
    projectId,
  );
  return Number(rows[0]?.n ?? 0) + 1;
}

export function insertSpecRevision(sql: Sql, revision: SpecRevisionRecord): void {
  sql.run(
    `INSERT INTO spec_revisions (id, project_id, user_id, revision, spec_json, spec_sha256, plan_json, source, ai_model, ai_cost_usd, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    revision.id,
    revision.project_id,
    revision.user_id,
    revision.revision,
    revision.spec_json,
    revision.spec_sha256,
    revision.plan_json,
    revision.source,
    revision.ai_model,
    revision.ai_cost_usd,
    revision.created_at,
  );
}

export function latestSpec(sql: Sql, userId: string, projectId: string): SpecRevisionRecord | null {
  const rows = sql.all<SpecRevisionRecord>(
    "SELECT * FROM spec_revisions WHERE user_id = ? AND project_id = ? ORDER BY revision DESC LIMIT 1",
    userId,
    projectId,
  );
  return rows[0] ?? null;
}

export function getSpec(sql: Sql, userId: string, projectId: string, specId: string): SpecRevisionRecord | null {
  const rows = sql.all<SpecRevisionRecord>(
    "SELECT * FROM spec_revisions WHERE id = ? AND user_id = ? AND project_id = ?",
    specId,
    userId,
    projectId,
  );
  return rows[0] ?? null;
}

export interface MessageRecord {
  id: string;
  project_id: string;
  user_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  spec_id: string | null;
  created_at: string;
}

export function insertMessage(sql: Sql, message: MessageRecord): void {
  sql.run(
    "INSERT INTO messages (id, project_id, user_id, role, content, spec_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    message.id,
    message.project_id,
    message.user_id,
    message.role,
    message.content,
    message.spec_id,
    message.created_at,
  );
}

export function listMessages(sql: Sql, userId: string, projectId: string, limit = 50): MessageRecord[] {
  const bounded = Math.max(1, Math.min(200, Math.trunc(limit) || 50));
  const rows = sql.all<MessageRecord>(
    "SELECT * FROM messages WHERE user_id = ? AND project_id = ? ORDER BY created_at DESC, id DESC LIMIT ?",
    userId,
    projectId,
    bounded,
  );
  return rows.reverse();
}

export interface BuildRecord {
  id: string;
  project_id: string;
  user_id: string;
  spec_id: string;
  spec_sha256: string;
  ui_template: string;
  product_name: string;
  status: string;
  failure_state: string | null;
  failure_message: string | null;
  github_run_id: string | null;
  github_run_url: string | null;
  qa_passed: number | null;
  artifact_name: string | null;
  artifact_key: string | null;
  artifact_bytes: number | null;
  artifact_sha256: string | null;
  compile_seconds: number;
  test_seconds: number;
  ai_cost_usd: number;
  estimated_cost_usd: number;
  reused_from: string | null;
  request_id: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export const BUILD_STATES = ["QUEUED", "ASSEMBLING", "BUILDING", "TESTING", "PACKAGING", "READY", "FAILED"] as const;
export type BuildState = (typeof BUILD_STATES)[number];

export function isBuildState(value: unknown): value is BuildState {
  return typeof value === "string" && (BUILD_STATES as readonly string[]).includes(value);
}

export function isTerminalBuildState(value: string): boolean {
  return value === "READY" || value === "FAILED";
}

export function insertBuild(sql: Sql, build: BuildRecord): void {
  sql.run(
    `INSERT INTO builds (id, project_id, user_id, spec_id, spec_sha256, ui_template, product_name, status,
       failure_state, failure_message, github_run_id, github_run_url, qa_passed,
       artifact_name, artifact_key, artifact_bytes, artifact_sha256,
       compile_seconds, test_seconds, ai_cost_usd, estimated_cost_usd, reused_from, request_id,
       created_at, updated_at, completed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    build.id,
    build.project_id,
    build.user_id,
    build.spec_id,
    build.spec_sha256,
    build.ui_template,
    build.product_name,
    build.status,
    build.failure_state,
    build.failure_message,
    build.github_run_id,
    build.github_run_url,
    build.qa_passed,
    build.artifact_name,
    build.artifact_key,
    build.artifact_bytes,
    build.artifact_sha256,
    build.compile_seconds,
    build.test_seconds,
    build.ai_cost_usd,
    build.estimated_cost_usd,
    build.reused_from,
    build.request_id,
    build.created_at,
    build.updated_at,
    build.completed_at,
  );
}

export function getBuild(sql: Sql, userId: string, buildId: string): BuildRecord | null {
  const rows = sql.all<BuildRecord>("SELECT * FROM builds WHERE id = ? AND user_id = ?", buildId, userId);
  return rows[0] ?? null;
}

export function updateBuild(
  sql: Sql,
  userId: string,
  buildId: string,
  patch: Partial<Omit<BuildRecord, "id" | "user_id">>,
  at: string,
): BuildRecord | null {
  const current = getBuild(sql, userId, buildId);
  if (!current) return null;
  const next: BuildRecord = { ...current, ...patch, updated_at: at };
  sql.run(
    `UPDATE builds SET status = ?, failure_state = ?, failure_message = ?, github_run_id = ?, github_run_url = ?,
       qa_passed = ?, artifact_name = ?, artifact_key = ?, artifact_bytes = ?, artifact_sha256 = ?,
       compile_seconds = ?, test_seconds = ?, ai_cost_usd = ?, estimated_cost_usd = ?, completed_at = ?, updated_at = ?
     WHERE id = ? AND user_id = ?`,
    next.status,
    next.failure_state,
    next.failure_message,
    next.github_run_id,
    next.github_run_url,
    next.qa_passed,
    next.artifact_name,
    next.artifact_key,
    next.artifact_bytes,
    next.artifact_sha256,
    next.compile_seconds,
    next.test_seconds,
    next.ai_cost_usd,
    next.estimated_cost_usd,
    next.completed_at,
    at,
    buildId,
    userId,
  );
  return getBuild(sql, userId, buildId);
}

export function listBuilds(sql: Sql, userId: string, options: { projectId?: string; limit?: number } = {}): BuildRecord[] {
  const limit = Math.max(1, Math.min(100, Math.trunc(options.limit ?? 20) || 20));
  if (options.projectId) {
    return sql.all<BuildRecord>(
      "SELECT * FROM builds WHERE user_id = ? AND project_id = ? ORDER BY created_at DESC, id DESC LIMIT ?",
      userId,
      options.projectId,
      limit,
    );
  }
  return sql.all<BuildRecord>(
    "SELECT * FROM builds WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT ?",
    userId,
    limit,
  );
}

export function latestSuccessfulBuild(sql: Sql, userId: string, projectId: string): BuildRecord | null {
  const rows = sql.all<BuildRecord>(
    "SELECT * FROM builds WHERE user_id = ? AND project_id = ? AND status = 'READY' AND qa_passed = 1 ORDER BY completed_at DESC, id DESC LIMIT 1",
    userId,
    projectId,
  );
  return rows[0] ?? null;
}

/** An identical, still-downloadable build — reuse it instead of paying again. */
export function findReusableBuild(sql: Sql, userId: string, specSha256: string, uiTemplate: string): BuildRecord | null {
  const rows = sql.all<BuildRecord>(
    `SELECT * FROM builds
     WHERE user_id = ? AND spec_sha256 = ? AND ui_template = ? AND status = 'READY' AND qa_passed = 1
       AND artifact_key IS NOT NULL
     ORDER BY completed_at DESC, id DESC LIMIT 1`,
    userId,
    specSha256,
    uiTemplate,
  );
  return rows[0] ?? null;
}

export function countActiveBuilds(sql: Sql, userId: string): number {
  const rows = sql.all<{ n: number }>(
    "SELECT COUNT(*) AS n FROM builds WHERE user_id = ? AND status NOT IN ('READY', 'FAILED')",
    userId,
  );
  return Number(rows[0]?.n ?? 0);
}

export function countBuildsSince(sql: Sql, userId: string, sinceIso: string): number {
  const rows = sql.all<{ n: number }>(
    "SELECT COUNT(*) AS n FROM builds WHERE user_id = ? AND created_at >= ? AND reused_from IS NULL",
    userId,
    sinceIso,
  );
  return Number(rows[0]?.n ?? 0);
}

export interface ArtifactRecord {
  build_id: string;
  user_id: string;
  project_id: string;
  object_key: string;
  name: string;
  bytes: number;
  sha256: string;
  qa_passed: number;
  created_at: string;
}

export function insertArtifact(sql: Sql, artifact: ArtifactRecord): void {
  sql.run(
    `INSERT INTO artifacts (build_id, user_id, project_id, object_key, name, bytes, sha256, qa_passed, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(build_id) DO UPDATE SET object_key = excluded.object_key, bytes = excluded.bytes,
       sha256 = excluded.sha256, qa_passed = excluded.qa_passed`,
    artifact.build_id,
    artifact.user_id,
    artifact.project_id,
    artifact.object_key,
    artifact.name,
    artifact.bytes,
    artifact.sha256,
    artifact.qa_passed,
    artifact.created_at,
  );
}

export function getArtifact(sql: Sql, userId: string, buildId: string): ArtifactRecord | null {
  const rows = sql.all<ArtifactRecord>("SELECT * FROM artifacts WHERE build_id = ? AND user_id = ?", buildId, userId);
  return rows[0] ?? null;
}

export function totalArtifactBytes(sql: Sql, userId: string): number {
  const rows = sql.all<{ n: number | null }>("SELECT SUM(bytes) AS n FROM artifacts WHERE user_id = ?", userId);
  return Number(rows[0]?.n ?? 0);
}

export type UsageKind =
  | "ai.request"
  | "ai.tokens"
  | "ai.cost_usd"
  | "build.request"
  | "build.seconds"
  | "build.artifact_bytes"
  | "build.cost_usd";

export interface UsageEventRecord {
  user_id: string;
  kind: UsageKind;
  quantity: number;
  unit: string;
  cost_usd: number;
  project_id?: string | null;
  build_id?: string | null;
  detail?: Record<string, unknown>;
  created_at: string;
}

export function insertUsage(sql: Sql, event: UsageEventRecord): void {
  sql.run(
    `INSERT INTO usage_events (user_id, kind, quantity, unit, cost_usd, project_id, build_id, detail_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    event.user_id,
    event.kind,
    event.quantity,
    event.unit,
    event.cost_usd,
    event.project_id ?? null,
    event.build_id ?? null,
    event.detail ? JSON.stringify(event.detail) : null,
    event.created_at,
  );
}

export function sumUsage(sql: Sql, userId: string, kind: UsageKind, sinceIso: string): { quantity: number; cost: number } {
  const rows = sql.all<{ q: number | null; c: number | null }>(
    "SELECT SUM(quantity) AS q, SUM(cost_usd) AS c FROM usage_events WHERE user_id = ? AND kind = ? AND created_at >= ?",
    userId,
    kind,
    sinceIso,
  );
  return { quantity: Number(rows[0]?.q ?? 0), cost: Number(rows[0]?.c ?? 0) };
}

export interface UsageReport {
  sinceIso: string;
  aiRequests: number;
  aiTokens: number;
  aiCostUsd: number;
  buildRequests: number;
  buildSeconds: number;
  artifactBytes: number;
  estimatedCostUsd: number;
}

export function usageReport(sql: Sql, userId: string, sinceIso: string): UsageReport {
  const read = (kind: UsageKind) => sumUsage(sql, userId, kind, sinceIso);
  const aiRequests = read("ai.request");
  const aiTokens = read("ai.tokens");
  const aiCost = read("ai.cost_usd");
  const buildRequests = read("build.request");
  const buildSeconds = read("build.seconds");
  const artifactBytes = read("build.artifact_bytes");
  const buildCost = read("build.cost_usd");
  return {
    sinceIso,
    aiRequests: aiRequests.quantity,
    aiTokens: aiTokens.quantity,
    aiCostUsd: round6(aiCost.cost),
    buildRequests: buildRequests.quantity,
    buildSeconds: buildSeconds.quantity,
    artifactBytes: artifactBytes.quantity,
    estimatedCostUsd: round6(aiCost.cost + buildCost.cost),
  };
}

/** First instant of the current UTC month — the metering window. */
export function monthStartIso(now: Date = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0)).toISOString();
}

function round6(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
