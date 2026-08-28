import { useState } from 'react';
import {
  Users,
  Loader2,
  BadgeCheck,
  XCircle,
  Copy,
  Check,
  Link2,
  MousePointerClick,
  Banknote,
  RefreshCw,
  AlertTriangle,
  Trash2,
} from 'lucide-react';

export type AffApplication = {
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

export type Affiliate = {
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

export type AffReport = {
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

type Props = {
  report: AffReport;
  loading?: boolean;
  error?: string;
  busyId?: string;
  onDecide?: (id: string, action: 'approve' | 'reject') => void;
  onRemove?: (code: string) => void;
  onCopy?: (text: string) => void;
};

const Stat = ({ label, value, sub, accent = 'text-[#00D4FF]' }: { label: string; value: string | number; sub?: string; accent?: string }) => (
  <div className="rounded-xl border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] p-4">
    <div className="font-['Inter'] text-[12px] text-[#64748B] uppercase tracking-[0.08em]">{label}</div>
    <div className={`mt-1.5 font-['Space_Grotesk'] font-semibold text-[24px] ${accent}`}>{value}</div>
    {sub && <div className="mt-0.5 font-['Inter'] text-[12px] text-[#475569]">{sub}</div>}
  </div>
);

/** Full affiliate-program report: summary stats, pending applications with
 *  approve/reject, and the approved-affiliate table with referral links. */
const AffiliateReportView = ({ report, loading, error, busyId, onDecide, onRemove, onCopy }: Props) => {
  const [copied, setCopied] = useState('');

  const copy = (text: string, key: string) => {
    if (onCopy) onCopy(text);
    else {
      try {
        void navigator.clipboard.writeText(text);
      } catch {
        /* clipboard unavailable */
      }
    }
    setCopied(key);
    window.setTimeout(() => setCopied(''), 1600);
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 font-['Inter'] text-[14px] text-[#94A3B8] py-6">
        <Loader2 size={15} className="animate-spin text-[#00D4FF]" /> Loading affiliate report…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-start gap-2 rounded-xl border border-[rgba(252,165,165,0.25)] bg-[rgba(252,165,165,0.06)] p-4 font-['Inter'] text-[13px] text-[#FCA5A5] leading-[1.6]">
        <AlertTriangle size={15} className="mt-0.5 flex-shrink-0" /> {error}
      </div>
    );
  }

  if (!report || !report.enabled) {
    return (
      <p className="font-['Inter'] text-[14px] text-[#64748B] py-4">
        Affiliate program is not enabled — the Worker has no KV namespace bound.
      </p>
    );
  }

  const s = report.stats;
  const pending = report.applications.filter((a) => a.status === 'pending');
  const approved = report.applications.filter((a) => a.status === 'approved');
  const rejected = report.applications.filter((a) => a.status === 'rejected');

  return (
    <div className="flex flex-col gap-6">
      {/* Summary stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Applications" value={s.totalApplications} sub={`${s.pending} pending · ${s.approved} approved · ${s.rejected} rejected`} accent="text-[#00D4FF]" />
        <Stat label="Referral clicks" value={s.clicks} sub={`${s.conversionRate.toFixed(1)}% conversion`} accent="text-[#FBBF24]" />
        <Stat label="Referred revenue" value={`$${s.referredRevenue.toFixed(2)}`} sub={`${s.conversions} sales`} accent="text-[#86EFAC]" />
        <Stat label="Est. commission" value={`$${s.estimatedCommission.toFixed(2)}`} sub={`${Math.round(report.commissionRate * 100)}% rate`} accent="text-[#F472B6]" />
      </div>

      {/* Pending applications */}
      <section>
        <h3 className="font-['Space_Grotesk'] font-semibold text-white text-[15px] flex items-center gap-2">
          <Users size={15} className="text-[#FBBF24]" /> Pending applications
          <span className="font-['Inter'] text-[12px] text-[#64748B] font-normal">({pending.length})</span>
        </h3>
        {pending.length === 0 ? (
          <p className="mt-3 font-['Inter'] text-[14px] text-[#64748B]">No pending applications.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {pending.map((a) => (
              <li key={a.id} className="rounded-xl border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] p-4">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div>
                    <div className="font-['Inter'] text-[14px] text-white font-medium">{a.name}</div>
                    <div className="mt-0.5 font-['Inter'] text-[12px] text-[#94A3B8]">
                      {a.email} · {a.platform || 'no platform'}
                    </div>
                    {a.audience && (
                      <div className="mt-1.5 font-['Inter'] text-[12px] text-[#64748B] leading-[1.6]">
                        <span className="text-[#475569]">Audience:</span> {a.audience}
                      </div>
                    )}
                    {a.notes && (
                      <div className="mt-1 font-['Inter'] text-[12px] text-[#64748B] leading-[1.6]">
                        <span className="text-[#475569]">Notes:</span> {a.notes}
                      </div>
                    )}
                    <div className="mt-1.5 font-['Inter'] text-[11px] text-[#475569]">
                      Applied {new Date(a.createdAt).toLocaleString()}
                    </div>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <button
                      type="button"
                      disabled={busyId === a.id}
                      onClick={() => onDecide?.(a.id, 'approve')}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[#86EFAC] text-[#052e16] px-3 py-2 font-['Inter'] text-[12px] font-medium hover:bg-[#A7F3D0] disabled:opacity-60 transition-colors"
                    >
                      {busyId === a.id ? <Loader2 size={13} className="animate-spin" /> : <BadgeCheck size={13} />} Approve
                    </button>
                    <button
                      type="button"
                      disabled={busyId === a.id}
                      onClick={() => onDecide?.(a.id, 'reject')}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[rgba(252,165,165,0.4)] text-[#FCA5A5] px-3 py-2 font-['Inter'] text-[12px] font-medium hover:bg-[rgba(252,165,165,0.08)] disabled:opacity-60 transition-colors"
                    >
                      <XCircle size={13} /> Reject
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Approved affiliates */}
      <section>
        <h3 className="font-['Space_Grotesk'] font-semibold text-white text-[15px] flex items-center gap-2">
          <BadgeCheck size={15} className="text-[#86EFAC]" /> Approved affiliates
          <span className="font-['Inter'] text-[12px] text-[#64748B] font-normal">({report.affiliates.length})</span>
        </h3>
        {report.affiliates.length === 0 ? (
          <p className="mt-3 font-['Inter'] text-[14px] text-[#64748B]">No approved affiliates yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-xl border border-[rgba(255,255,255,0.08)]">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-[rgba(255,255,255,0.08)]">
                  <th className="px-4 py-2.5 font-['Inter'] text-[11px] uppercase tracking-[0.08em] text-[#64748B]">Affiliate</th>
                  <th className="px-4 py-2.5 font-['Inter'] text-[11px] uppercase tracking-[0.08em] text-[#64748B]">Referral link</th>
                  <th className="px-4 py-2.5 font-['Inter'] text-[11px] uppercase tracking-[0.08em] text-[#64748B]">Clicks</th>
                  <th className="px-4 py-2.5 font-['Inter'] text-[11px] uppercase tracking-[0.08em] text-[#64748B]">Sales</th>
                  <th className="px-4 py-2.5 font-['Inter'] text-[11px] uppercase tracking-[0.08em] text-[#64748B]">Revenue</th>
                  <th className="px-4 py-2.5 font-['Inter'] text-[11px] uppercase tracking-[0.08em] text-[#64748B]">Approved</th>
                  <th className="px-4 py-2.5 font-['Inter'] text-[11px] uppercase tracking-[0.08em] text-[#64748B]">Manage</th>
                </tr>
              </thead>
              <tbody>
                {report.affiliates.map((af) => {
                  const url = `${report.referralBase}${af.code}`;
                  const copiedKey = `link:${af.code}`;
                  return (
                    <tr key={af.code} className="border-b border-[rgba(255,255,255,0.05)] last:border-b-0">
                      <td className="px-4 py-3">
                        <div className="font-['Inter'] text-[13px] text-white">{af.name}</div>
                        <div className="font-['Inter'] text-[11px] text-[#64748B]">{af.email} · {af.platform}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center gap-1.5 font-mono font-['IBM_Plex_Mono'] text-[12px] text-[#00D4FF]">
                            <Link2 size={11} /> {url}
                          </span>
                          <button
                            type="button"
                            onClick={() => copy(url, copiedKey)}
                            className="inline-flex items-center gap-1 rounded-md border border-[rgba(255,255,255,0.15)] px-2 py-1 font-['Inter'] text-[11px] text-[#94A3B8] hover:text-white transition-colors"
                          >
                            {copied === copiedKey ? <Check size={11} className="text-[#86EFAC]" /> : <Copy size={11} />}
                            {copied === copiedKey ? 'Copied' : 'Copy'}
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-['Inter'] text-[13px] text-[#94A3B8]">{af.clicks}</td>
                      <td className="px-4 py-3 font-['Inter'] text-[13px] text-[#94A3B8]">{af.conversions}</td>
                      <td className="px-4 py-3 font-['Inter'] text-[13px] text-[#86EFAC]">${af.revenue.toFixed(2)}</td>
                      <td className="px-4 py-3 font-['Inter'] text-[12px] text-[#64748B]">{new Date(af.approvedAt).toLocaleDateString()}</td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          disabled={busyId === `rm:${af.code}`}
                          onClick={() => onRemove?.(af.code)}
                          className="inline-flex items-center gap-1 rounded-md border border-[rgba(252,165,165,0.35)] px-2 py-1 font-['Inter'] text-[11px] text-[#FCA5A5] hover:bg-[rgba(252,165,165,0.08)] disabled:opacity-60 transition-colors"
                        >
                          {busyId === `rm:${af.code}` ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />} Remove
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Tally of non-pending applications */}
      {(approved.length > 0 || rejected.length > 0) && (
        <p className="font-['Inter'] text-[12px] text-[#475569]">
          {approved.length} approved · {rejected.length} rejected · generated {new Date(report.generatedAt).toLocaleString()}
        </p>
      )}
    </div>
  );
};

export default AffiliateReportView;
