/**
 * Client for the build orchestrator (the Executive OS factory gateway).
 *
 * The customer application never talks to GitHub and never holds a GitHub
 * token: it asks the orchestrator to dispatch a build, and asks it for the
 * status of one. Both calls carry the factory gateway secret.
 */

export interface RemoteBuildArtifact {
  name: string;
  bytes: number | null;
  sha256: string | null;
  key: string | null;
}

export interface RemoteBuild {
  buildId: string;
  productName: string;
  productVersion: string;
  uiTemplate: string;
  status: string;
  failureState: string | null;
  qaPassed: boolean;
  artifact: RemoteBuildArtifact | null;
  timings: { compileSeconds: number; testSeconds: number };
  cost: { aiCostUsd: number; estimatedVariableCostUsd: number };
  githubRunUrl: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface DispatchBuildInput {
  buildId: string;
  requestId: string;
  accountId: string;
  productId: string;
  productName: string;
  productVersion: string;
  uiTemplate: string;
  spec: unknown;
  specSha256: string;
}

export type DispatchOutcome =
  | { ok: true; build: RemoteBuild }
  | { ok: false; code: string; message: string; build?: RemoteBuild | null };

export type StatusOutcome = { ok: true; build: RemoteBuild; syncSource: string } | { ok: false; code: string; message: string };

export interface BuildService {
  dispatch(input: DispatchBuildInput): Promise<DispatchOutcome>;
  status(buildId: string): Promise<StatusOutcome>;
}

function jsonHeaders(secret: string): Record<string, string> {
  return { "content-type": "application/json", "x-factory-gateway": secret };
}

export function createOsBuildService(options: { baseUrl: string; secret: string; fetchImpl?: typeof fetch }): BuildService {
  const base = options.baseUrl.replace(/\/$/, "");
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    async dispatch(input) {
      let response: Response;
      try {
        response = await fetchImpl(`${base}/api/factory/builds`, {
          method: "POST",
          headers: jsonHeaders(options.secret),
          body: JSON.stringify(input),
        });
      } catch {
        return { ok: false, code: "BUILD_SERVICE_UNREACHABLE", message: "The build service is unreachable." };
      }
      const body = (await response.json().catch(() => null)) as
        | { ok?: boolean; build?: RemoteBuild | null; code?: string; message?: string }
        | null;
      if (!body) return { ok: false, code: "BUILD_SERVICE_BAD_RESPONSE", message: "The build service returned an unreadable response." };
      if (response.status === 202 && body.ok && body.build) return { ok: true, build: body.build };
      return {
        ok: false,
        code: body.code ?? "BUILD_DISPATCH_FAILED",
        message: body.message ?? "The build could not be started.",
        build: body.build ?? null,
      };
    },

    async status(buildId) {
      let response: Response;
      try {
        response = await fetchImpl(`${base}/api/factory/builds/${encodeURIComponent(buildId)}`, {
          method: "GET",
          headers: { "x-factory-gateway": options.secret },
        });
      } catch {
        return { ok: false, code: "BUILD_SERVICE_UNREACHABLE", message: "The build service is unreachable." };
      }
      const body = (await response.json().catch(() => null)) as
        | { ok?: boolean; build?: RemoteBuild; syncSource?: string; error?: string }
        | null;
      if (response.ok && body?.ok && body.build) {
        return { ok: true, build: body.build, syncSource: body.syncSource ?? "pending" };
      }
      return { ok: false, code: "BUILD_NOT_FOUND", message: body?.error ?? "Build not found." };
    },
  };
}
