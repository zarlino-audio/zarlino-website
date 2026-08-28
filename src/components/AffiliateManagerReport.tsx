import { useCallback, useEffect, useState } from 'react';
import { KeyRound, Loader2, Lock, AlertTriangle, LogOut, RefreshCw } from 'lucide-react';
import AffiliateReportView, { type AffReport } from './AffiliateReportView';

const TOKEN_KEY = 'zarlino_aff_manager_token';

/** Acquisition-manager report page: gate on the admin token, then show the
 *  full affiliate program report (applications, approve/reject, referral
 *  links, clicks/conversions/revenue). This is the link managers use to
 *  report on the program. */
const AffiliateManagerReport = () => {
  const [token, setToken] = useState('');
  const [storedToken, setStoredToken] = useState<string | null>(null);
  const [report, setReport] = useState<AffReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');

  const loadReport = useCallback(async (t: string) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/affiliates/report?token=${encodeURIComponent(t)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load affiliate report');
      setReport(data as AffReport);
      localStorage.setItem(TOKEN_KEY, t);
      setStoredToken(t);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load affiliate report');
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setStoredToken(localStorage.getItem(TOKEN_KEY));
  }, []);

  useEffect(() => {
    if (storedToken && !report && !loading) void loadReport(storedToken);
  }, [storedToken, report, loading, loadReport]);

  const decide = async (id: string, action: 'approve' | 'reject') => {
    if (!storedToken) return;
    setBusyId(id);
    setError('');
    try {
      const res = await fetch(`/api/affiliates/${action}?token=${encodeURIComponent(storedToken)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Failed to ${action} application`);
      await loadReport(storedToken);
    } catch (e) {
      setError(e instanceof Error ? e.message : `Failed to ${action} application`);
    } finally {
      setBusyId('');
    }
  };

  const removeAffiliate = async (code: string) => {
    if (!storedToken) return;
    setBusyId(`rm:${code}`);
    setError('');
    try {
      const res = await fetch(`/api/affiliates/remove?token=${encodeURIComponent(storedToken)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to remove affiliate');
      await loadReport(storedToken);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to remove affiliate');
    } finally {
      setBusyId('');
    }
  };

  const logout = () => {
    localStorage.removeItem(TOKEN_KEY);
    setStoredToken(null);
    setReport(null);
    setToken('');
    setError('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!token.trim()) return;
    void loadReport(token.trim());
  };

  if (!storedToken || !report) {
    return (
      <div className="rounded-2xl border border-[rgba(0,212,255,0.25)] bg-[rgba(0,212,255,0.04)] p-8 max-w-[440px] mx-auto">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center justify-center w-11 h-11 rounded-xl bg-[rgba(0,212,255,0.12)]">
            <Lock size={20} className="text-[#00D4FF]" />
          </span>
          <div>
            <h2 className="font-['Space_Grotesk'] font-semibold text-white text-[18px]">Affiliate manager report</h2>
            <p className="font-['Inter'] text-[13px] text-[#64748B]">Private · authorized access only</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-3">
          <label htmlFor="aff-manager-token" className="font-['Inter'] text-[13px] text-[#94A3B8]">
            Access token
          </label>
          <input
            id="aff-manager-token"
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Paste your access token"
            autoComplete="off"
            className="w-full rounded-lg bg-[#050505] border border-[rgba(255,255,255,0.12)] px-4 py-3 font-['Inter'] text-[15px] text-white placeholder:text-[#475569] focus:outline-none focus:border-[#00D4FF] transition-colors"
          />
          {error && (
            <p className="flex items-center gap-2 font-['Inter'] text-[13px] text-[#FCA5A5]">
              <AlertTriangle size={14} /> {error}
            </p>
          )}
          <button
            type="submit"
            disabled={loading || !token.trim()}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#00D4FF] text-[#050505] px-6 py-3 font-['Inter'] font-medium text-[14px] hover:bg-[#33DDFF] disabled:opacity-60 transition-colors duration-300"
          >
            {loading ? (
              <>
                <Loader2 size={15} className="animate-spin" /> Loading…
              </>
            ) : (
              <>
                <KeyRound size={15} /> View report
              </>
            )}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-['Space_Grotesk'] font-semibold text-white text-[20px]">Affiliate program report</h1>
          <p className="mt-1 font-['Inter'] text-[13px] text-[#64748B]">
            Generated {new Date(report.generatedAt).toLocaleString()} · {report.commissionRate * 100}% commission
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => storedToken && void loadReport(storedToken)}
            className="inline-flex items-center gap-2 rounded-lg border border-[rgba(255,255,255,0.15)] px-4 py-2 font-['Inter'] text-[13px] text-[#94A3B8] hover:text-white hover:border-[rgba(255,255,255,0.3)] transition-colors"
          >
            <RefreshCw size={14} /> Refresh
          </button>
          <button
            type="button"
            onClick={logout}
            className="inline-flex items-center gap-2 rounded-lg border border-[rgba(255,255,255,0.15)] px-4 py-2 font-['Inter'] text-[13px] text-[#94A3B8] hover:text-white hover:border-[rgba(255,255,255,0.3)] transition-colors"
          >
            <LogOut size={14} /> Lock
          </button>
        </div>
      </div>

      {error && (
        <p className="flex items-center gap-2 rounded-xl border border-[rgba(252,165,165,0.25)] bg-[rgba(252,165,165,0.06)] p-4 font-['Inter'] text-[13px] text-[#FCA5A5]">
          <AlertTriangle size={14} /> {error}
        </p>
      )}

      <AffiliateReportView report={report} loading={loading} error={error} busyId={busyId} onDecide={decide} onRemove={removeAffiliate} />
    </div>
  );
};

export default AffiliateManagerReport;
