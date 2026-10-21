/**
 * The project workspace: describe → review the plan → refine → choose an
 * interface → build → watch the build → download.
 *
 * Build state is polled from the server. A card only says READY when the server
 * says READY and the quality gate passed; a FAILED build shows a translated
 * reason and never a download link.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ApiFailure,
  BUILD_STATE_LABEL,
  factoryApi,
  formatBytes,
  formatDate,
  type BuildPlanView,
  type BuildView,
  type EntitlementView,
  type PlanPreview,
  type ProjectSummary,
} from "./api";
import InterfacePreview from "./InterfacePreview";

interface ProjectData {
  project: ProjectSummary;
  spec: { id: string; revision: number; sha256: string; source: string; createdAt: string } | null;
  plan: BuildPlanView | null;
  builds: Array<BuildView & { failureExplanation?: BuildView["failure"] }>;
  messages: Array<{ role: string; content: string; at: string }>;
  templates: PlanPreview[] | null;
  entitlement: EntitlementView;
}

export default function FactoryProject({ projectId: providedId }: { projectId?: string }) {
  const projectId = providedId && providedId.length > 0 ? providedId : new URLSearchParams(typeof window === "undefined" ? "" : window.location.search).get("id") ?? "";
  const [data, setData] = useState<ProjectData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [unsupported, setUnsupported] = useState<{ message: string; alternative: string | null } | null>(null);
  const [template, setTemplate] = useState<string | null>(null);
  const [activeBuild, setActiveBuild] = useState<BuildView | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);

  const load = useCallback(async () => {
    try {
      const next = await factoryApi.project(projectId);
      setData(next);
      if (!template && next.templates?.[1]) setTemplate("standard");
    } catch (failure) {
      setError(failure instanceof ApiFailure ? failure.message : "Could not load this project.");
    }
  }, [projectId, template]);

  useEffect(() => {
    void load();
  }, [load]);

  // Poll while a build is in flight. The server decides when it is done.
  useEffect(() => {
    if (!activeBuild || activeBuild.status === "READY" || activeBuild.status === "FAILED") return;
    const timer = window.setInterval(async () => {
      try {
        const next = await factoryApi.buildStatus(activeBuild.buildId);
        setActiveBuild(next.build);
        if (next.build.status === "READY" || next.build.status === "FAILED") {
          window.clearInterval(timer);
          await load();
        }
      } catch {
        /* transient; the next tick retries */
      }
    }, 4000);
    pollRef.current = timer;
    return () => window.clearInterval(timer);
  }, [activeBuild, load]);

  const interpret = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!description.trim()) return;
    setBusy(true);
    setError(null);
    setUnsupported(null);
    setNotice(null);
    try {
      const result = await factoryApi.interpret(projectId, description);
      if (result.unsupported) {
        setUnsupported(result.unsupported);
      } else if (result.ok) {
        setDescription("");
        if (result.interpretation) setNotice(result.interpretation.summary);
      } else {
        setError(result.error?.message ?? "That design could not be validated.");
      }
      await load();
    } catch (failure) {
      if (failure instanceof ApiFailure) {
        if (failure.code === "NOT_ENOUGH_CREDITS" || failure.code === "AI_ALLOWANCE" || failure.code === "TOKEN_ALLOWANCE") {
          setNotice(failure.message);
        } else {
          setError(failure.message);
        }
      } else {
        setError("Could not reach the assistant. Try again.");
      }
    } finally {
      setBusy(false);
    }
  };

  const build = async () => {
    if (!template) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await factoryApi.build(projectId, template);
      setActiveBuild(result.build);
      if (result.reused) setNotice("This exact design was already built — we reused it, so no build was spent.");
      await load();
    } catch (failure) {
      if (failure instanceof ApiFailure && (failure.code === "BUILD_ALLOWANCE" || failure.code === "CONCURRENT_BUILDS")) {
        setNotice(failure.message);
      } else {
        setError(failure instanceof ApiFailure ? failure.message : "Could not start the build.");
      }
    } finally {
      setBusy(false);
    }
  };

  if (error && !data) {
    return <p className="rounded-xl border border-[rgba(248,113,113,0.3)] px-4 py-3 font-['Inter'] text-[13px] text-[#FCA5A5]">{error}</p>;
  }
  if (!data) return <p className="font-['Inter'] text-[14px] text-[#94A3B8]">Loading…</p>;

  const latest = activeBuild ?? data.builds[0] ?? null;
  const canBuild = Boolean(data.plan) && Boolean(template);
  const buildsLeft = Math.max(0, data.entitlement.builds.limit - data.entitlement.builds.used);

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <a href="/factory/" className="font-['Inter'] text-[12px] text-[#64748B] hover:text-white">
            ← Your plugins
          </a>
          <h1 className="mt-2 font-['Space_Grotesk'] text-[26px] font-semibold text-white">
            {data.plan?.title ?? data.project.name}
          </h1>
          <p className="mt-1 font-['Inter'] text-[13px] text-[#94A3B8]">
            {data.spec ? `Design revision ${data.spec.revision} · ${data.entitlement.planName} plan · ${buildsLeft} build${buildsLeft === 1 ? "" : "s"} left this month` : `${data.entitlement.planName} plan · ${buildsLeft} build${buildsLeft === 1 ? "" : "s"} left this month`}
          </p>
        </div>
        {latest?.status === "READY" && latest.downloadUrl ? (
          <a
            href={latest.downloadUrl}
            className="rounded-lg bg-white px-4 py-2 font-['Inter'] text-[13px] font-medium text-[#0B0B0D]"
          >
            Download VST3
          </a>
        ) : null}
      </header>

      {unsupported ? (
        <div className="rounded-xl border border-[rgba(251,191,36,0.3)] bg-[rgba(251,191,36,0.08)] px-4 py-3">
          <p className="font-['Inter'] text-[13px] text-[#FDE68A]">{unsupported.message}</p>
          {unsupported.alternative ? (
            <p className="mt-1 font-['Inter'] text-[12px] text-[#FCD34D]">Closest we can build: {unsupported.alternative}</p>
          ) : null}
        </div>
      ) : null}
      {notice ? (
        <p className="rounded-xl border border-[rgba(148,163,184,0.3)] bg-[rgba(148,163,184,0.08)] px-4 py-3 font-['Inter'] text-[13px] text-[#CBD5E1]">{notice}</p>
      ) : null}
      {error ? (
        <p className="rounded-xl border border-[rgba(248,113,113,0.3)] bg-[rgba(248,113,113,0.08)] px-4 py-3 font-['Inter'] text-[13px] text-[#FCA5A5]">{error}</p>
      ) : null}

      {/* 1. describe / refine ------------------------------------------------ */}
      <section>
        <h2 className="font-['Space_Grotesk'] text-[17px] font-semibold text-white">
          {data.spec ? "Refine the sound" : "Describe the processor"}
        </h2>
        <form onSubmit={interpret} className="mt-3">
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={4}
            maxLength={2000}
            placeholder={
              data.spec
                ? "Make the compression gentler. / Remove the saturation. / Give me only four controls. / Put Mix last."
                : "A warm, punchy vocal compressor with a gentle saturation stage and one Warmth knob. Four controls at most."
            }
            className="w-full rounded-xl border border-[rgba(255,255,255,0.12)] bg-[#07080A] px-4 py-3 font-['Inter'] text-[14px] leading-[1.7] text-white outline-none focus:border-[rgba(255,255,255,0.3)]"
          />
          <div className="mt-2 flex items-center justify-between">
            <span className="font-['Inter'] text-[11px] text-[#64748B]">{description.length} / 2000</span>
            <button
              type="submit"
              disabled={busy || description.trim().length === 0}
              className="rounded-lg bg-[#4C9AFF] px-4 py-2 font-['Inter'] text-[13px] font-medium text-[#05070A] disabled:opacity-50"
            >
              {busy ? "Thinking…" : data.spec ? "Refine design" : "Interpret"}
            </button>
          </div>
        </form>
        <p className="mt-2 font-['Inter'] text-[11px] text-[#64748B]">
          Refining is free of build cost — you only spend a build when you press Build.
        </p>
      </section>

      {/* 2. the plan --------------------------------------------------------- */}
      {data.plan ? (
        <section>
          <h2 className="font-['Space_Grotesk'] text-[17px] font-semibold text-white">What Zarlino will build</h2>
          <p className="mt-2 font-['Inter'] text-[14px] leading-[1.8] text-[#CBD5E1]">{data.plan.summary}</p>

          <ol className="mt-4 space-y-2">
            {data.plan.chain.map((stage, index) => (
              <li key={stage.instanceId} className="rounded-xl border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.02)] px-4 py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-['Inter'] text-[13px] text-white">
                    {index + 1}. {stage.moduleName}
                  </span>
                  <span className="font-['Inter'] text-[11px] text-[#64748B]">{stage.role}</span>
                </div>
                <p className="mt-1 font-['Inter'] text-[12px] text-[#94A3B8]">{stage.description}</p>
              </li>
            ))}
          </ol>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-[rgba(255,255,255,0.1)] p-4">
              <p className="font-['Inter'] text-[11px] uppercase tracking-[0.14em] text-[#64748B]">Controls</p>
              <ul className="mt-2 space-y-1 font-['Inter'] text-[12px] text-[#CBD5E1]">
                {data.plan.macros.map((macro) => (
                  <li key={macro.id} className="text-[#FDE68A]">
                    {macro.name} (macro) → {macro.drives.join(", ")}
                  </li>
                ))}
                {data.plan.parameters.map((parameter) => (
                  <li key={parameter.id}>
                    {parameter.name}
                    {parameter.unit ? ` (${parameter.unit})` : ""} · {parameter.target}
                    {parameter.drivenByMacro ? " · macro-driven" : ""}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl border border-[rgba(255,255,255,0.1)] p-4">
              <p className="font-['Inter'] text-[11px] uppercase tracking-[0.14em] text-[#64748B]">Details</p>
              <ul className="mt-2 space-y-1 font-['Inter'] text-[12px] text-[#CBD5E1]">
                <li>Channel: {data.plan.channels}</li>
                <li>Category: {data.plan.category}</li>
                <li>Latency: {data.plan.latencySamples} samples ({data.plan.latencyMsAt48k} ms at 48 kHz)</li>
                {data.plan.notes.map((note) => (
                  <li key={note} className="text-[#94A3B8]">
                    {note}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      ) : null}

      {/* 3. interface -------------------------------------------------------- */}
      {data.templates ? (
        <section>
          <h2 className="font-['Space_Grotesk'] text-[17px] font-semibold text-white">Choose the interface</h2>
          <p className="mt-1 font-['Inter'] text-[12px] text-[#64748B]">
            Three hand-built Zarlino interfaces. The plugin's window is drawn from the one you pick — same audio on all three.
          </p>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            {data.templates.map((preview) => (
              <InterfacePreview
                key={preview.template}
                preview={preview}
                accentColor={data.plan?.accentColor}
                selected={template === preview.template}
                onSelect={() => setTemplate(preview.template)}
                compact
              />
            ))}
          </div>
        </section>
      ) : null}

      {/* 4. build ------------------------------------------------------------ */}
      {data.plan ? (
        <section className="rounded-2xl border border-[rgba(255,255,255,0.12)] bg-[rgba(255,255,255,0.03)] p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="font-['Space_Grotesk'] text-[17px] font-semibold text-white">Build the Windows VST3</h2>
              <p className="mt-1 font-['Inter'] text-[12px] text-[#94A3B8]">
                Uses one build{template ? ` · interface: ${template}` : ""} · {buildsLeft} left this month
              </p>
            </div>
            <button
              type="button"
              onClick={build}
              disabled={busy || !canBuild}
              className="rounded-lg bg-white px-5 py-2.5 font-['Inter'] text-[13px] font-medium text-[#0B0B0D] disabled:opacity-50"
            >
              {busy ? "Starting…" : "Authorise and build"}
            </button>
          </div>

          {latest ? <BuildCard build={latest} /> : null}
        </section>
      ) : null}

      {/* 5. history ---------------------------------------------------------- */}
      <section>
        <h2 className="font-['Space_Grotesk'] text-[17px] font-semibold text-white">History</h2>
        {data.builds.length === 0 ? (
          <p className="mt-2 font-['Inter'] text-[12px] text-[#64748B]">No builds yet.</p>
        ) : (
          <table className="mt-3 w-full border-collapse font-['Inter'] text-[12px]">
            <thead>
              <tr className="text-left text-[#64748B]">
                <th className="pb-2 font-normal">Build</th>
                <th className="pb-2 font-normal">State</th>
                <th className="pb-2 font-normal">Interface</th>
                <th className="pb-2 font-normal">Created</th>
                <th className="pb-2 font-normal">Artifact</th>
              </tr>
            </thead>
            <tbody className="text-[#CBD5E1]">
              {data.builds.map((row) => (
                <tr key={row.buildId} className="border-t border-[rgba(255,255,255,0.08)]">
                  <td className="py-2 pr-3 font-mono text-[11px] text-[#94A3B8]">{row.buildId.slice(0, 18)}…</td>
                  <td className="py-2 pr-3">
                    <span className={row.status === "READY" ? "text-[#86EFAC]" : row.status === "FAILED" ? "text-[#FCA5A5]" : "text-[#FCD34D]"}>
                      {BUILD_STATE_LABEL[row.status] ?? row.status}
                    </span>
                  </td>
                  <td className="py-2 pr-3">{row.uiTemplate}</td>
                  <td className="py-2 pr-3">{formatDate(row.createdAt)}</td>
                  <td className="py-2">
                    {row.downloadUrl ? (
                      <a href={row.downloadUrl} className="text-[#93C5FD] underline">
                        {formatBytes(row.artifact?.bytes ?? null)}
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function BuildCard({ build }: { build: BuildView }) {
  const steps = ["QUEUED", "ASSEMBLING", "BUILDING", "TESTING", "PACKAGING", "READY"];
  const index = steps.indexOf(build.status);
  const failed = build.status === "FAILED";

  return (
    <div className="mt-4 rounded-xl border border-[rgba(255,255,255,0.1)] bg-[#07080A] p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-['Inter'] text-[13px] text-white">{BUILD_STATE_LABEL[build.status] ?? build.status}</span>
        <span className="font-mono text-[11px] text-[#64748B]">{build.buildId}</span>
      </div>

      {!failed ? (
        <ol className="mt-3 flex items-center gap-1">
          {steps.slice(0, 6).map((step, position) => (
            <li key={step} className="flex-1">
              <div className={`h-1 rounded-full ${position <= index ? "bg-[#4C9AFF]" : "bg-[rgba(255,255,255,0.1)]"}`} />
              <span className="mt-1 block font-['Inter'] text-[9px] uppercase tracking-[0.1em] text-[#475569]">{step}</span>
            </li>
          ))}
        </ol>
      ) : null}

      {failed && build.failure ? (
        <div className="mt-3 rounded-lg border border-[rgba(248,113,113,0.3)] bg-[rgba(248,113,113,0.08)] px-3 py-2">
          <p className="font-['Inter'] text-[12px] font-medium text-[#FCA5A5]">{build.failure.title}</p>
          <p className="mt-1 font-['Inter'] text-[12px] text-[#FECACA]">{build.failure.message}</p>
          <p className="mt-1 font-['Inter'] text-[11px] text-[#FCA5A5]">{build.failure.action}</p>
        </div>
      ) : null}

      {build.status === "READY" && build.downloadUrl ? (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <a href={build.downloadUrl} className="rounded-lg bg-white px-4 py-2 font-['Inter'] text-[12px] font-medium text-[#0B0B0D]">
            Download {build.artifact?.name}
          </a>
          <span className="font-['Inter'] text-[11px] text-[#64748B]">
            {formatBytes(build.artifact?.bytes ?? null)} · QA passed
            {build.artifact?.sha256 ? ` · sha256 ${build.artifact.sha256.slice(0, 12)}…` : ""}
          </span>
        </div>
      ) : null}

      {!failed && build.status !== "READY" ? (
        <p className="mt-3 font-['Inter'] text-[11px] text-[#64748B]">
          A typical build takes 8–15 minutes. You can close this page — the build keeps running.
        </p>
      ) : null}
    </div>
  );
}
