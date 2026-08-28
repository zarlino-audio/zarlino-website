import { useCallback, useEffect, useState } from 'react';
import {
  Lock,
  ShieldCheck,
  Bug,
  Activity,
  Rocket,
  BarChart3,
  ExternalLink,
  Loader2,
  KeyRound,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Server,
  FileText,
  LogOut,
  Users,
  RefreshCw,
} from 'lucide-react';
import AffiliateReportView from './AffiliateReportView';

type Stats = {
  generatedAt: string;
  feedback: {
    available: boolean;
    open: number;
    closed: number;
    total: number;
    recent: Array<{
      number: number;
      title: string;
      state: string;
      labels: string[];
      url: string;
      createdAt: string;
    }>;
  };
  site: Array<{ path: string; status: number | null; ok: boolean | null }>;
  deploy: {
    available: boolean;
    runs: Array<{
      name: string;
      status: string;
      conclusion: string | null;
      branch: string;
      createdAt: string;
      url: string;
    }>;
  };
  counters: {
    enabled: boolean;
    views?: { total: number; today: number };
    licenses?: { total: number; today: number };
  };
  links: {
    cloudflare: string;
    feedbackRepo: string;
    sitemap: string;
  };
};

type AffApplication = {
  id: string;
  name: string;
  email: string;
  platform: string;
  audience: string;
  notes: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  code?: string;
};

type Affiliate = {
  code: string;
  appId: string;
  name: string;
  email: string;
  platform: string;
  approvedAt: string;
  clicks: number;
  conversions: number;
  revenue: number;
};

type AffReport = {
  enabled: boolean;
  generatedAt: string;
  commissionRate: number;
  referralBase: string;
  stats: {
    totalApplications: number;
    pending: number;
    approved: number;
    rejected: number;
    clicks: number;
    conversions: number;
    referredRevenue: number;
    estimatedCommission: number;
    conversionRate: number;
  };
  applications: AffApplication[];
  affiliates: Affiliate[];
};

const TOKEN_KEY = 'zarlino_admin_token';

/** Live Executive OS console (Cloudflare Workers). First visit forces founder
 *  username/password setup, then signs in. */
const EXEC_OS_URL = 'https://zarlino-executive-os.zarlino001.workers.dev';

const fetchStats = async (token: string): Promise<Stats> => {
  const res = await fetch(`/api/admin/stats?token=${encodeURIComponent(token)}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to load stats');
  return data as Stats;
};

const fetchAffiliateReport = async (token: string): Promise<AffReport> => {
  const res = await fetch(`/api/affiliates/report?token=${encodeURIComponent(token)}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to load affiliate report');
  return data as AffReport;
};

/** Probe a page from the browser — a real check against the Cloudflare edge. */
const probePage = async (path: string): Promise<{ status: number; ok: boolean }> => {
  try {
    const r = await fetch(path, { method: 'HEAD', cache: 'no-store' });
    return { status: r.status, ok: r.status < 400 };
  } catch {
    return { status: 0, ok: false };
  }
};

const StatCard = ({
  icon: Icon,
  label,
  value,
  sub,
  accent = 'text-[#00D4FF]',
}: {
  icon: typeof Activity;
  label: string;
  value: string | number;
  sub?: string;
  accent?: string;
}) => (
  <div className="rounded-2xl border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.03)] p-5">
    <div className="flex items-center gap-2 font-['Inter'] text-[12px] uppercase tracking-[0.08em] text-[#64748B]">
      <Icon size={14} className={accent} />
      {label}
    </div>
    <div className="mt-2 font-['Space_Grotesk'] font-semibold text-[28px] text-white leading-none">
      {value}
    </div>
    {sub && <div className="mt-1 font-['Inter'] text-[12px] text-[#64748B]">{sub}</div>}
  </div>
);

const SectionCard = ({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: typeof Activity;
  children: React.ReactNode;
}) => (
  <section className="rounded-2xl border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.02)] p-6">
    <h2 className="flex items-center gap-2 font-['Space_Grotesk'] font-semibold text-white text-[16px]">
      <Icon size={16} className="text-[#00D4FF]" />
      {title}
    </h2>
    <div className="mt-4">{children}</div>
  </section>
);

const AdminDashboard = () => {
  const [token, setToken] = useState('');
  const [storedToken, setStoredToken] = useState<string | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [aff, setAff] = useState<AffReport | null>(null);
  const [affLoading, setAffLoading] = useState(false);
  const [affError, setAffError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [copied, setCopied] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setStoredToken(localStorage.getItem(TOKEN_KEY));
  }, []);

  const loadAffiliate = useCallback(async (t: string) => {
    setAffLoading(true);
    setAffError('');
    try {
      setAff(await fetchAffiliateReport(t));
    } catch (e) {
      setAffError(e instanceof Error ? e.message : 'Failed to load affiliate report');
      setAff(null);
    } finally {
      setAffLoading(false);
    }
  }, []);

  const decideAffiliate = async (id: string, action: 'approve' | 'reject') => {
    if (!storedToken) return;
    setBusyId(id);
    setAffError('');
    try {
      const res = await fetch(`/api/affiliates/${action}?token=${encodeURIComponent(storedToken)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Failed to ${action} application`);
      await loadAffiliate(storedToken);
    } catch (e) {
      setAffError(e instanceof Error ? e.message : `Failed to ${action} application`);
    } finally {
      setBusyId('');
    }
  };

  const removeAffiliate = async (code: string) => {
    if (!storedToken) return;
    setBusyId(`rm:${code}`);
    setAffError('');
    try {
      const res = await fetch(`/api/affiliates/remove?token=${encodeURIComponent(storedToken)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to remove affiliate');
      await loadAffiliate(storedToken);
    } catch (e) {
      setAffError(e instanceof Error ? e.message : 'Failed to remove affiliate');
    } finally {
      setBusyId('');
    }
  };

  const load = useCallback(async (t: string) => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchStats(t);
      // Probe each page from the browser (HEAD to the edge). Keep the
      // placeholder while probes run so the UI doesn't flash "unhealthy".
      setStats({ ...data, site: data.site.map((p) => ({ ...p, status: null, ok: null })) });
      localStorage.setItem(TOKEN_KEY, t);
      setStoredToken(t);
      const probed = await Promise.all(
        data.site.map(async (p) => ({ ...p, ...(await probePage(p.path)) })),
      );
      setStats((prev) => (prev ? { ...prev, site: probed } : prev));
      await loadAffiliate(t);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load stats');
      setStats(null);
    } finally {
      setLoading(false);
    }
  }, [loadAffiliate]);

  // Auto-login if a token is already stored.
  useEffect(() => {
    if (storedToken && !stats && !loading) {
      load(storedToken);
    }
  }, [storedToken, stats, loading, load]);

  const logout = () => {
    localStorage.removeItem(TOKEN_KEY);
    setStoredToken(null);
    setStats(null);
    setToken('');
    setError('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!token.trim()) return;
    load(token.trim());
  };

  if (!storedToken || !stats) {
    return (
      <div className="rounded-2xl border border-[rgba(255,255,255,0.12)] bg-[rgba(255,255,255,0.03)] p-8 max-w-[440px] mx-auto">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center justify-center w-11 h-11 rounded-xl bg-[rgba(0,212,255,0.12)]">
            <Lock size={20} className="text-[#00D4FF]" />
          </span>
          <div>
            <h2 className="font-['Space_Grotesk'] font-semibold text-white text-[18px]">
              Zarlino Admin
            </h2>
            <p className="font-['Inter'] text-[13px] text-[#64748B]">
              Private dashboard · authorized access only
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-3">
          <label htmlFor="admin-token" className="font-['Inter'] text-[13px] text-[#94A3B8]">
            Access token
          </label>
          <input
            id="admin-token"
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Paste your admin token"
            autoComplete="off"
            className="w-full rounded-lg bg-[#050505] border border-[rgba(255,255,255,0.12)] px-4 py-3 font-['Inter'] text-[15px] text-white placeholder:text-[#475569] focus:outline-none focus:border-[#00D4FF] transition-colors"
          />
          {error && (
            <p className="flex items-center gap-2 font-['Inter'] text-[13px] text-[#FCA5A5]">
              <AlertTriangle size={14} />
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={loading || !token.trim()}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#00D4FF] text-[#050505] px-6 py-3 font-['Inter'] font-medium text-[14px] hover:bg-[#33DDFF] disabled:opacity-60 transition-colors duration-300"
          >
            {loading ? (
              <>
                <Loader2 size={15} className="animate-spin" /> Verifying…
              </>
            ) : (
              <>
                <KeyRound size={15} /> Unlock dashboard
              </>
            )}
          </button>
        </form>
      </div>
    );
  }

  const { feedback, site, deploy, counters, links } = stats;
  const healthy = site.filter((p) => p.ok).length;
  const checked = site.filter((p) => p.ok !== null).length;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center justify-center w-11 h-11 rounded-xl bg-[rgba(134,239,172,0.12)]">
            <ShieldCheck size={20} className="text-[#86EFAC]" />
          </span>
          <div>
            <h1 className="font-['Space_Grotesk'] font-semibold text-white text-[20px]">
              Zarlino Audio — Admin
            </h1>
            <p className="font-['Inter'] text-[13px] text-[#64748B]">
              Generated {new Date(stats.generatedAt).toLocaleString()}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={logout}
          className="inline-flex items-center gap-2 rounded-lg border border-[rgba(255,255,255,0.15)] px-4 py-2 font-['Inter'] text-[13px] text-[#94A3B8] hover:text-white hover:border-[rgba(255,255,255,0.3)] transition-colors"
        >
          <LogOut size={14} /> Log out
        </button>
      </div>

      {/* Stat row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Bug} label="Open issues" value={feedback.available ? feedback.open : '—'} sub={feedback.available ? `${feedback.total} total · ${feedback.closed} closed` : 'Unavailable'} accent="text-[#FCA5A5]" />
        <StatCard icon={Server} label="Pages healthy" value={checked === site.length ? healthy : '…'} sub={checked === site.length ? `${site.length} monitored` : `checking ${checked}/${site.length}`} accent="text-[#86EFAC]" />
        <StatCard icon={BarChart3} label="Page views" value={counters.enabled ? counters.views?.total ?? 0 : '—'} sub={counters.enabled ? `${counters.views?.today ?? 0} today` : 'KV not connected'} />
        <StatCard icon={FileText} label="Licenses issued" value={counters.enabled ? counters.licenses?.total ?? 0 : '—'} sub={counters.enabled ? `${counters.licenses?.today ?? 0} today` : 'KV not connected'} />
      </div>

      {/* Affiliate program */}
      <SectionCard title="Affiliate program" icon={Users}>
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <p className="font-['Inter'] text-[13px] text-[#64748B]">
            Applications, referral links, clicks, conversions &amp; commission.
          </p>
          <a
            href="/affiliate-report"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border border-[rgba(0,212,255,0.35)] px-3 py-1.5 font-['Inter'] text-[12px] text-[#00D4FF] hover:bg-[rgba(0,212,255,0.08)] transition-colors"
          >
            <RefreshCw size={12} /> Manager report page
          </a>
        </div>
        {affLoading ? (
          <p className="font-['Inter'] text-[14px] text-[#94A3B8]">Loading affiliate report…</p>
        ) : aff ? (
          <AffiliateReportView report={aff} busyId={busyId} onDecide={decideAffiliate} onRemove={removeAffiliate} error={affError} />
        ) : (
          <p className="font-['Inter'] text-[14px] text-[#64748B]">
            {affError || 'Affiliate report unavailable.'}
          </p>
        )}
      </SectionCard>

      {/* Feedback */}
      <SectionCard title="Bug reports & feedback" icon={Bug}>
        {feedback.available ? (
          <ul className="flex flex-col gap-3">
            {feedback.recent.length === 0 && (
              <li className="font-['Inter'] text-[14px] text-[#64748B]">No issues yet.</li>
            )}
            {feedback.recent.map((issue) => (
              <li key={issue.number} className="rounded-xl border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <a
                      href={issue.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-['Inter'] text-[14px] text-white hover:text-[#00D4FF] transition-colors"
                    >
                      #{issue.number} — {issue.title}
                    </a>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      {issue.state === 'open' ? (
                        <span className="inline-flex items-center gap-1 font-['Inter'] text-[11px] text-[#86EFAC] bg-[rgba(134,239,172,0.1)] rounded-full px-2 py-0.5">
                          <XCircle size={11} /> open
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 font-['Inter'] text-[11px] text-[#94A3B8] bg-[rgba(255,255,255,0.08)] rounded-full px-2 py-0.5">
                          <CheckCircle2 size={11} /> closed
                        </span>
                      )}
                      {issue.labels.map((label) => (
                        <span key={label} className="inline-flex items-center gap-1 font-['Inter'] text-[11px] text-[#FBBF24] bg-[rgba(251,191,36,0.1)] rounded-full px-2 py-0.5">
                          <Bug size={10} /> {label}
                        </span>
                      ))}
                      <span className="font-['Inter'] text-[11px] text-[#475569]">
                        {new Date(issue.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  <ExternalLink size={14} className="text-[#475569] flex-shrink-0 mt-1" />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="font-['Inter'] text-[14px] text-[#64748B]">
            Feedback repo not reachable from the Worker.
          </p>
        )}
      </SectionCard>

      {/* Site health */}
      <SectionCard title="Site health" icon={Activity}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {site.map((page) => (
            <div key={page.path} className="flex items-center justify-between rounded-xl border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] px-4 py-3">
              <span className="font-['Inter'] text-[13px] text-[#94A3B8] font-mono">{page.path}</span>
              <span className={`inline-flex items-center gap-1.5 font-['Inter'] text-[12px] ${page.ok === null ? 'text-[#94A3B8]' : page.ok ? 'text-[#86EFAC]' : 'text-[#FCA5A5]'}`}>
                {page.ok === null ? <Loader2 size={13} className="animate-spin" /> : page.ok ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
                {page.ok === null ? 'checking…' : page.status === 0 ? 'no response' : `${page.status}`}
              </span>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* Deploy status */}
      <SectionCard title="Deployments" icon={Rocket}>
        {deploy.available ? (
          <ul className="flex flex-col gap-3">
            {deploy.runs.map((run, i) => (
              <li key={i} className="flex items-center justify-between rounded-xl border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] px-4 py-3">
                <div>
                  <a href={run.url} target="_blank" rel="noopener noreferrer" className="font-['Inter'] text-[14px] text-white hover:text-[#00D4FF] transition-colors">
                    {run.name}
                  </a>
                  <div className="mt-0.5 font-['Inter'] text-[12px] text-[#64748B]">
                    {run.branch} · {new Date(run.createdAt).toLocaleString()}
                  </div>
                </div>
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-['Inter'] text-[11px] ${
                  run.conclusion === 'success'
                    ? 'text-[#86EFAC] bg-[rgba(134,239,172,0.1)]'
                    : run.status === 'in_progress'
                      ? 'text-[#FBBF24] bg-[rgba(251,191,36,0.1)]'
                      : 'text-[#FCA5A5] bg-[rgba(252,165,165,0.1)]'
                }`}>
                  {run.status === 'completed' ? run.conclusion : run.status}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="font-['Inter'] text-[14px] text-[#64748B]">
            Deploy runs are unavailable — the website repo is private and the Worker needs a{' '}
            <code className="text-[#00D4FF]">GITHUB_TOKEN</code> secret with repo scope to read them.
          </p>
        )}
      </SectionCard>

      {/* Quick links */}
      <SectionCard title="Quick links" icon={ExternalLink}>
        <div className="flex flex-wrap gap-3">
          <a href={links.cloudflare} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-[rgba(255,255,255,0.15)] px-4 py-2.5 font-['Inter'] text-[13px] text-[#94A3B8] hover:text-white hover:border-[rgba(255,255,255,0.3)] transition-colors">
            <Server size={14} className="text-[#FBBF24]" /> Cloudflare dashboard
          </a>
          <a href={links.feedbackRepo} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-[rgba(255,255,255,0.15)] px-4 py-2.5 font-['Inter'] text-[13px] text-[#94A3B8] hover:text-white hover:border-[rgba(255,255,255,0.3)] transition-colors">
            <Bug size={14} className="text-[#FCA5A5]" /> Feedback repo issues
          </a>
          <a href={links.sitemap} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-[rgba(255,255,255,0.15)] px-4 py-2.5 font-['Inter'] text-[13px] text-[#94A3B8] hover:text-white hover:border-[rgba(255,255,255,0.3)] transition-colors">
            <FileText size={14} className="text-[#00D4FF]" /> Sitemap
          </a>
        </div>
      </SectionCard>

      {!counters.enabled && (
        <p className="flex items-start gap-2 rounded-xl border border-[rgba(251,191,36,0.25)] bg-[rgba(251,191,36,0.05)] p-4 font-['Inter'] text-[13px] text-[#FBBF24] leading-[1.6]">
          <AlertTriangle size={15} className="mt-0.5 flex-shrink-0" />
          <span>
            Page-view and license counters are disabled because no Cloudflare KV namespace is bound yet.
            To enable them, create a KV namespace in the Cloudflare dashboard and add its ID under{' '}
            <code className="text-white">[[kv_namespaces]]</code> in <code className="text-white">wrangler.toml</code>.
          </span>
        </p>
      )}
    </div>
  );
};

export default AdminDashboard;
