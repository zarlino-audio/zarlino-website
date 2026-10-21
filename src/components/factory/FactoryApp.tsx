/**
 * The customer application: sign up / sign in, then the project dashboard.
 *
 * Everything shown here is read back from the API. The build state on a project
 * card is the state the server reports, not something the page remembers.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiFailure, BUILD_STATE_LABEL, factoryApi, formatDate, formatMoney, type Account, type EntitlementView, type ProjectSummary } from "./api";

type Plans = Awaited<ReturnType<typeof factoryApi.overview>>["plans"]["plans"];

export default function FactoryApp() {
  const [account, setAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshSession = useCallback(async () => {
    try {
      setAccount(await factoryApi.session());
    } catch {
      setError("Could not reach Zarlino. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  if (loading) {
    return <p className="font-['Inter'] text-[14px] text-[#94A3B8]">Loading…</p>;
  }

  if (!account) {
    return <AuthPanel onSignedIn={(next) => setAccount(next)} error={error} />;
  }

  return <Dashboard account={account} onSignedOut={() => setAccount(null)} />;
}

// ---------------------------------------------------------------------------

function AuthPanel({ onSignedIn, error }: { onSignedIn: (account: Account) => void; error: string | null }) {
  const [mode, setMode] = useState<"signup" | "login">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setLocalError(null);
    try {
      const result = mode === "signup" ? await factoryApi.signup(email, password, displayName) : await factoryApi.login(email, password);
      onSignedIn(result.account);
    } catch (failure) {
      setLocalError(failure instanceof ApiFailure ? failure.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-8 md:grid-cols-[1.1fr_1fr] items-start">
      <div>
        <p className="font-['Inter'] text-[12px] uppercase tracking-[0.18em] text-[#64748B]">Zarlino Plugin Factory</p>
        <h2 className="mt-3 font-['Space_Grotesk'] text-[28px] font-semibold leading-[1.2] text-white">
          Describe a processor. Get a real Windows VST3.
        </h2>
        <p className="mt-3 font-['Inter'] text-[14px] leading-[1.8] text-[#94A3B8]">
          Tell us the sound you want in plain English. Zarlino turns it into a strict, validated design built only from
          its own certified DSP modules, shows you exactly what will be built, and compiles a signed-off VST3 in the
          cloud — no code, no compiler, no plugin maths.
        </p>
        <ul className="mt-5 space-y-2 font-['Inter'] text-[13px] text-[#CBD5E1]">
          <li>• Three professional interfaces: Minimal, Standard, Advanced</li>
          <li>• Refine the design as many times as you like before you build</li>
          <li>• Every download passed an automated audio and stability check</li>
        </ul>
        <p className="mt-5 font-['Inter'] text-[12px] text-[#64748B]">
          Free plan available. No card required to build your first plugin.
        </p>
      </div>

      <form onSubmit={submit} className="rounded-2xl border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.03)] p-6">
        <div className="mb-5 flex gap-2">
          {(["signup", "login"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setMode(value)}
              className={[
                "flex-1 rounded-lg px-3 py-2 font-['Inter'] text-[13px] transition-colors",
                mode === value ? "bg-white text-[#0B0B0D]" : "bg-[rgba(255,255,255,0.06)] text-[#94A3B8]",
              ].join(" ")}
            >
              {value === "signup" ? "Create account" : "Sign in"}
            </button>
          ))}
        </div>

        {mode === "signup" ? (
          <label className="mb-3 block">
            <span className="mb-1 block font-['Inter'] text-[12px] text-[#94A3B8]">Your name (optional)</span>
            <input
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              autoComplete="name"
              className="w-full rounded-lg border border-[rgba(255,255,255,0.12)] bg-[#07080A] px-3 py-2 font-['Inter'] text-[14px] text-white outline-none focus:border-[rgba(255,255,255,0.3)]"
            />
          </label>
        ) : null}

        <label className="mb-3 block">
          <span className="mb-1 block font-['Inter'] text-[12px] text-[#94A3B8]">Email</span>
          <input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            className="w-full rounded-lg border border-[rgba(255,255,255,0.12)] bg-[#07080A] px-3 py-2 font-['Inter'] text-[14px] text-white outline-none focus:border-[rgba(255,255,255,0.3)]"
          />
        </label>

        <label className="mb-4 block">
          <span className="mb-1 block font-['Inter'] text-[12px] text-[#94A3B8]">Password</span>
          <input
            type="password"
            required
            minLength={10}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            className="w-full rounded-lg border border-[rgba(255,255,255,0.12)] bg-[#07080A] px-3 py-2 font-['Inter'] text-[14px] text-white outline-none focus:border-[rgba(255,255,255,0.3)]"
          />
          {mode === "signup" ? <span className="mt-1 block font-['Inter'] text-[11px] text-[#64748B]">At least 10 characters.</span> : null}
        </label>

        {localError ?? error ? (
          <p className="mb-3 rounded-lg border border-[rgba(248,113,113,0.3)] bg-[rgba(248,113,113,0.08)] px-3 py-2 font-['Inter'] text-[12px] text-[#FCA5A5]">
            {localError ?? error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-white px-4 py-2.5 font-['Inter'] text-[14px] font-medium text-[#0B0B0D] transition-opacity disabled:opacity-60"
        >
          {busy ? "Working…" : mode === "signup" ? "Create my account" : "Sign in"}
        </button>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Dashboard({ account, onSignedOut }: { account: Account; onSignedOut: () => void }) {
  const [entitlement, setEntitlement] = useState<EntitlementView | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [plans, setPlans] = useState<Plans>([]);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const overview = await factoryApi.overview();
      setEntitlement(overview.entitlement);
      setProjects(overview.projects);
      setPlans(overview.plans.plans);
    } catch (failure) {
      if (failure instanceof ApiFailure && failure.status === 401) onSignedOut();
      else setError("Could not load your projects. Refresh to try again.");
    }
  }, [onSignedOut]);

  useEffect(() => {
    void load();
  }, [load]);

  const createProject = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const created = await factoryApi.createProject(newName.trim() || "Untitled plugin");
      window.location.href = `/factory/project/?id=${encodeURIComponent(created.project.id)}`;
    } catch (failure) {
      if (failure instanceof ApiFailure && failure.status === 402) {
        setNotice(failure.message);
      } else {
        setError(failure instanceof ApiFailure ? failure.message : "Could not create the project.");
      }
    } finally {
      setBusy(false);
    }
  };

  const upgrade = async () => {
    setBusy(true);
    setError(null);
    try {
      const checkout = await factoryApi.checkout("pro");
      window.location.href = checkout.authorizationUrl;
    } catch (failure) {
      setError(failure instanceof ApiFailure ? failure.message : "Could not start checkout.");
      setBusy(false);
    }
  };

  const signOut = async () => {
    await factoryApi.logout().catch(() => undefined);
    onSignedOut();
  };

  const plan = useMemo(() => plans.find((candidate) => candidate.id === account.plan), [plans, account.plan]);

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-['Inter'] text-[12px] uppercase tracking-[0.18em] text-[#64748B]">Your workspace</p>
          <h2 className="mt-2 font-['Space_Grotesk'] text-[26px] font-semibold text-white">
            {account.plan === "pro" ? "Pro" : "Free"} plan
          </h2>
          <p className="mt-1 font-['Inter'] text-[13px] text-[#94A3B8]">{account.email}</p>
        </div>
        <div className="flex gap-2">
          {account.plan !== "pro" ? (
            <button
              type="button"
              onClick={upgrade}
              disabled={busy}
              className="rounded-lg bg-white px-4 py-2 font-['Inter'] text-[13px] font-medium text-[#0B0B0D] disabled:opacity-60"
            >
              Upgrade to Pro
            </button>
          ) : null}
          <button type="button" onClick={signOut} className="rounded-lg border border-[rgba(255,255,255,0.14)] px-4 py-2 font-['Inter'] text-[13px] text-[#CBD5E1]">
            Sign out
          </button>
        </div>
      </header>

      {entitlement ? (
        <section className="grid gap-3 sm:grid-cols-3">
          <Stat label="Builds this month" used={entitlement.builds.used} limit={entitlement.builds.limit} />
          <Stat label="Assistant requests" used={entitlement.aiRequests.used} limit={entitlement.aiRequests.limit} />
          <Stat label="Projects" used={entitlement.projects.used} limit={entitlement.projects.limit} />
        </section>
      ) : null}

      {notice ? (
        <p className="rounded-xl border border-[rgba(251,191,36,0.3)] bg-[rgba(251,191,36,0.08)] px-4 py-3 font-['Inter'] text-[13px] text-[#FDE68A]">
          {notice}{" "}
          <button type="button" onClick={upgrade} className="underline">
            Upgrade to Pro
          </button>
        </p>
      ) : null}
      {error ? (
        <p className="rounded-xl border border-[rgba(248,113,113,0.3)] bg-[rgba(248,113,113,0.08)] px-4 py-3 font-['Inter'] text-[13px] text-[#FCA5A5]">{error}</p>
      ) : null}

      <section>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h3 className="font-['Space_Grotesk'] text-[19px] font-semibold text-white">Your plugins</h3>
          <form onSubmit={createProject} className="flex gap-2">
            <input
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="Name a new processor"
              className="w-[220px] rounded-lg border border-[rgba(255,255,255,0.12)] bg-[#07080A] px-3 py-2 font-['Inter'] text-[13px] text-white outline-none focus:border-[rgba(255,255,255,0.3)]"
            />
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-[#4C9AFF] px-4 py-2 font-['Inter'] text-[13px] font-medium text-[#05070A] disabled:opacity-60"
            >
              New plugin
            </button>
          </form>
        </div>

        {projects.length === 0 ? (
          <p className="mt-6 rounded-xl border border-dashed border-[rgba(255,255,255,0.12)] px-5 py-8 text-center font-['Inter'] text-[13px] text-[#64748B]">
            Nothing here yet. Name your first processor above and describe the sound you want.
          </p>
        ) : (
          <ul className="mt-5 space-y-3">
            {projects.map((project) => (
              <li key={project.id}>
                <a
                  href={`/factory/project/?id=${encodeURIComponent(project.id)}`}
                  className="block rounded-xl border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.02)] p-4 transition-colors hover:border-[rgba(255,255,255,0.24)]"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-['Space_Grotesk'] text-[15px] font-semibold text-white">
                      {project.productName ?? project.name}
                    </span>
                    <span className="font-['Inter'] text-[11px] text-[#64748B]">created {formatDate(project.createdAt)}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-['Inter'] text-[12px] text-[#94A3B8]">
                    <span>{project.buildState ? BUILD_STATE_LABEL[project.buildState] ?? project.buildState : "No build yet"}</span>
                    {project.uiTemplate ? <span>Interface: {project.uiTemplate}</span> : null}
                    {project.latestReadyBuildId ? <span className="text-[#86EFAC]">Download available</span> : null}
                  </div>
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="font-['Space_Grotesk'] text-[19px] font-semibold text-white">Plans</h3>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {plans.map((candidate) => {
            const current = candidate.id === account.plan;
            return (
              <div
                key={candidate.id}
                className={[
                  "rounded-2xl border p-5",
                  current ? "border-[rgba(255,255,255,0.35)] bg-[rgba(255,255,255,0.05)]" : "border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.02)]",
                ].join(" ")}
              >
                <div className="flex items-baseline justify-between">
                  <span className="font-['Space_Grotesk'] text-[16px] font-semibold text-white">{candidate.name}</span>
                  <span className="font-['Inter'] text-[14px] text-[#CBD5E1]">
                    {candidate.price ? `${formatMoney(candidate.price.amountMinor, candidate.price.currency)}/${candidate.price.interval}` : "Free"}
                  </span>
                </div>
                <p className="mt-2 font-['Inter'] text-[12px] leading-[1.7] text-[#94A3B8]">{candidate.tagline}</p>
                <ul className="mt-3 space-y-1 font-['Inter'] text-[12px] text-[#CBD5E1]">
                  {candidate.features.map((feature) => (
                    <li key={feature}>• {feature}</li>
                  ))}
                </ul>
                {current ? (
                  <p className="mt-4 font-['Inter'] text-[11px] uppercase tracking-[0.14em] text-[#64748B]">Current plan</p>
                ) : candidate.id === "pro" ? (
                  <button
                    type="button"
                    onClick={upgrade}
                    disabled={busy}
                    className="mt-4 w-full rounded-lg bg-white px-4 py-2 font-['Inter'] text-[13px] font-medium text-[#0B0B0D] disabled:opacity-60"
                  >
                    Upgrade to Pro
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
        <p className="mt-3 font-['Inter'] text-[11px] text-[#64748B]">
          {plan ? "The audio quality is identical on both plans. Plans differ in capacity and in commercial rights." : ""}
        </p>
      </section>
    </div>
  );
}

function Stat({ label, used, limit }: { label: string; used: number; limit: number }) {
  const ratio = limit > 0 ? Math.min(1, used / limit) : 0;
  return (
    <div className="rounded-xl border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.02)] p-4">
      <p className="font-['Inter'] text-[11px] uppercase tracking-[0.14em] text-[#64748B]">{label}</p>
      <p className="mt-1 font-['Space_Grotesk'] text-[20px] font-semibold text-white">
        {used}
        <span className="font-['Inter'] text-[12px] font-normal text-[#64748B]"> / {limit}</span>
      </p>
      <div className="mt-2 h-1 rounded-full bg-[rgba(255,255,255,0.08)]">
        <div className="h-1 rounded-full bg-[#4C9AFF]" style={{ width: `${ratio * 100}%` }} />
      </div>
    </div>
  );
}
