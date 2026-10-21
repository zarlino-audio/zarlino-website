/**
 * Durable Object adapters for the two customer stores.
 *
 * FactoryIdentity is one instance ("global"): accounts, sessions, plans,
 * payments, rate limits, analytics.
 *
 * FactoryWorkspace is one instance PER CUSTOMER, addressed as `user:<id>`. That
 * is the structural half of the isolation guarantee: the instance id is derived
 * from the authenticated session and from nothing else, so there is no request
 * that could even address another customer's storage.
 *
 * Each object speaks one internal protocol: POST a JSON envelope
 * `{ op, args }`, receive the operation's JSON result. Everything that can be
 * tested lives in `ops.ts`; this file only adapts the runtime.
 */

import { identityOp, workspaceOp, type OpResult } from "./ops";
import { applyIdentitySchema, applyWorkspaceSchema, type Sql, type SqlParam } from "./store";

interface SqlStorageCursor {
  toArray(): Record<string, unknown>[];
}

interface DoSqlStorage {
  exec(query: string, ...values: unknown[]): SqlStorageCursor;
}

interface DoStorage {
  sql: DoSqlStorage;
}

interface DoState {
  storage: DoStorage;
}

/** Adapter for the Durable Object SQLite surface this code uses. */
export function createDoSql(storage: DoSqlStorage): Sql {
  return {
    run(sql: string, ...params: SqlParam[]) {
      storage.exec(sql, ...params);
    },
    all<T = unknown>(sql: string, ...params: SqlParam[]): T[] {
      return storage.exec(sql, ...params).toArray() as T[];
    },
  };
}

async function handleEnvelope(
  request: Request,
  run: (op: string, args: Record<string, unknown>) => Promise<OpResult>,
): Promise<Response> {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, code: "METHOD_NOT_ALLOWED" }), {
      status: 405,
      headers: { "content-type": "application/json" },
    });
  }

  let op = "";
  let args: Record<string, unknown> = {};
  try {
    const body = (await request.json()) as { op?: unknown; args?: unknown };
    op = typeof body.op === "string" ? body.op : "";
    args = typeof body.args === "object" && body.args !== null ? (body.args as Record<string, unknown>) : {};
  } catch {
    return new Response(JSON.stringify({ ok: false, code: "INVALID_ENVELOPE" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  try {
    const result = await run(op, args);
    return new Response(JSON.stringify(result), { headers: { "content-type": "application/json" } });
  } catch {
    return new Response(JSON.stringify({ ok: false, code: "STORE_ERROR" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}

/** POST `{op, args}` -> operation result. Shared by the DO classes and tests. */
export function createStoreFetch(sql: Sql, kind: "identity" | "workspace"): (request: Request) => Promise<Response> {
  return (request) =>
    handleEnvelope(request, (op, args) => (kind === "identity" ? identityOp({ sql }, op, args) : workspaceOp({ sql }, op, args)));
}

export class FactoryIdentity {
  private readonly sql: Sql;
  private readonly handle: (request: Request) => Promise<Response>;

  constructor(state: DoState) {
    this.sql = createDoSql(state.storage.sql);
    applyIdentitySchema(this.sql);
    this.handle = createStoreFetch(this.sql, "identity");
  }

  async fetch(request: Request): Promise<Response> {
    return this.handle(request);
  }
}

export class FactoryWorkspace {
  private readonly sql: Sql;
  private readonly handle: (request: Request) => Promise<Response>;

  constructor(state: DoState) {
    this.sql = createDoSql(state.storage.sql);
    applyWorkspaceSchema(this.sql);
    this.handle = createStoreFetch(this.sql, "workspace");
  }

  async fetch(request: Request): Promise<Response> {
    return this.handle(request);
  }
}
