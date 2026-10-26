/**
 * Test harness: the two customer stores on node:sqlite.
 *
 * The production stores are Durable Objects with SQLite; this adapter gives the
 * exact same SQL surface locally so the store code, the migrations and every
 * isolation rule run unchanged in tests.
 */

import { DatabaseSync } from "node:sqlite";
import { applyIdentitySchema, applyWorkspaceSchema, type Sql, type SqlParam } from "../../src/factory/store";
import { createStoreFetch } from "../../src/factory/durable";

interface NodeStatement {
  run(...params: SqlParam[]): unknown;
  all(...params: SqlParam[]): unknown[];
}

interface NodeDatabase {
  exec(sql: string): void;
  prepare(sql: string): NodeStatement;
}

export function createNodeSql(db: NodeDatabase): Sql {
  return {
    run(sql, ...params) {
      if (params.length === 0) {
        db.exec(sql);
        return;
      }
      db.prepare(sql).run(...params);
    },
    all<T = unknown>(sql: string, ...params: SqlParam[]): T[] {
      return db.prepare(sql).all(...params) as T[];
    },
  };
}

export interface TestStore {
  db: DatabaseSync;
  sql: Sql;
}

export function makeIdentity(): TestStore {
  const db = new DatabaseSync(":memory:");
  const sql = createNodeSql(db as unknown as NodeDatabase);
  applyIdentitySchema(sql);
  return { db, sql };
}

export function makeWorkspace(): TestStore {
  const db = new DatabaseSync(":memory:");
  const sql = createNodeSql(db as unknown as NodeDatabase);
  applyWorkspaceSchema(sql);
  return { db, sql };
}

/**
 * A Durable Object namespace backed by node:sqlite, speaking the same internal
 * envelope the real objects speak. Two kinds:
 *   - identity: one instance ("global")
 *   - workspace: one instance per customer id ("user:<id>"), created on demand
 */
export function makeNamespace(kind: "identity" | "workspace", onInstance?: (name: string, sql: Sql) => void) {
  const instances = new Map<string, TestStore>();
  // One handler per instance, created when the instance is created: a real
  // Durable Object builds its handler in the constructor and keeps it for the
  // life of the instance, so in-memory state (rate-limit windows) must too.
  const handles = new Map<string, (request: Request) => Promise<Response>>();
  return {
    instances,
    namespace: {
      idFromName(name: string) {
        return name;
      },
      get(id: unknown) {
        const name = String(id);
        const key = kind === "identity" ? "global" : name;
        let store = instances.get(key);
        if (!store) {
          store = kind === "identity" ? makeIdentity() : makeWorkspace();
          instances.set(key, store);
          onInstance?.(name, store.sql);
        }
        let handle = handles.get(key);
        if (!handle) {
          handle = createStoreFetch(store.sql, kind);
          handles.set(key, handle);
        }
        const fn = handle;
        return { fetch: (request: Request) => fn(request) };
      },
    },
  };
}
