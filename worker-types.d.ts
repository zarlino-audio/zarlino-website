/**
 * Minimal ambient types for Cloudflare Workers bindings used by src/index.ts.
 * The site is built with `astro build` (esbuild — no typecheck), so this
 * exists for editor/tsc hygiene. Install @cloudflare/workers-types if you
 * want the full official types instead.
 */

interface KVNamespaceListKey {
  name: string;
  expiration?: number;
  metadata?: unknown;
}

interface KVNamespaceListOptions {
  prefix?: string;
  limit?: number;
  cursor?: string;
}

interface KVNamespaceListResult {
  keys: KVNamespaceListKey[];
  list_complete: boolean;
  cursor?: string;
}

declare class KVNamespace {
  get(key: string, type?: 'text'): Promise<string | null>;
  get(key: string, type: 'json'): Promise<unknown>;
  get(key: string, type: 'arrayBuffer'): Promise<ArrayBuffer | null>;
  get(key: string, type: 'stream'): Promise<ReadableStream | null>;
  put(key: string, value: string | ArrayBuffer | ReadableStream | ArrayBufferView, options?: unknown): Promise<void>;
  delete(key: string): Promise<void>;
  list(options?: KVNamespaceListOptions): Promise<KVNamespaceListResult>;
}

declare class Fetcher {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}
