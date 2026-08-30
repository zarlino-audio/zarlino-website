import { useEffect, useState } from 'react';
import {
  Link2, Copy, Check, MousePointerClick, ShoppingCart, Banknote,
  TrendingUp, Loader2, AlertCircle, Hash, RefreshCw,
} from 'lucide-react';

export type AffiliateStatus = {
  ok: boolean;
  error?: string;
  affiliate?: {
    code: string;
    name: string;
    platform: string;
    approvedAt: string;
    clicks: number;
    conversions: number;
    revenue: number;
  };
  commissionRate: number;
  referralBase: string;
  referralLink: string;
};

type Props = {
  /** Optional referral code pre-filled via ?code=JANE1, passed from the page. */
  initialCode?: string;
};

const inputClass =
  "w-full rounded-lg bg-[#050505] border border-[rgba(255,255,255,0.12)] px-4 py-3 font-['Inter'] text-[15px] text-white placeholder:text-[#475569] focus:outline-none focus:border-[#00D4FF] transition-colors";

const Stat = ({
  icon: Icon, label, value, sub, accent = 'text-[#00D4FF]',
}: {
  icon: typeof MousePointerClick;
  label: string;
  value: string | number;
  sub?: string;
  accent?: string;
}) => (
  <div className="rounded-xl border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] p-4">
    <div className="flex items-center gap-2">
      <Icon size={14} className={accent} />
      <span className="font-['Inter'] text-[11px] uppercase tracking-[0.08em] text-[#64748B]">{label}</span>
    </div>
    <div className={`mt-1.5 font-['Space_Grotesk'] font-semibold text-[26px] ${accent}`}>{value}</div>
    {sub && <div className="mt-0.5 font-['Inter'] text-[12px] text-[#475569]">{sub}</div>}
  </div>
);

const AffiliateDashboard = ({ initialCode = '' }: Props) => {
  const [code, setCode] = useState(initialCode.toUpperCase().trim());
  const [status, setStatus] = useState<AffiliateStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const lookUp = async (c: string) => {
    const look = c.toUpperCase().trim();
    if (!look) {
      setError('Enter your affiliate referral code.');
      setStatus(null);
      return;
    }
    setLoading(true);
    setError('');
    setStatus(null);
    try {
      const res = await fetch(`/api/affiliates/status?code=${encodeURIComponent(look)}`);
      const data = (await res.json()) as AffiliateStatus;
      if (!res.ok) {
        setError(data.error || 'Could not load your affiliate status. Try again later.');
        setStatus(null);
        return;
      }
      setStatus(data);
      if (data.ok && data.affiliate) setCode(data.affiliate.code);
    } catch {
      setError('Network error. Please try again, or email support@zarlinoaudio.com.');
      setStatus(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initialCode) void lookUp(initialCode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCode]);

  const copyLink = async () => {
    const link = status?.referralLink;
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      /* clipboard unavailable */
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  const affiliate = status?.affiliate;
  const conversionRate =
    affiliate && affiliate.clicks > 0
      ? ((affiliate.conversions / affiliate.clicks) * 100).toFixed(1)
      : '0.0';
  const commission = affiliate
    ? Math.round(affiliate.revenue * (status?.commissionRate ?? 0.25) * 100) / 100
    : 0;

  return (
    <div className="flex flex-col gap-6">
      {/* Code entry */}
      <div className="rounded-2xl border border-[rgba(0,212,255,0.25)] bg-[rgba(0,212,255,0.04)] p-6 md:p-8">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center justify-center w-11 h-11 rounded-xl bg-[rgba(0,212,255,0.12)]">
            <TrendingUp size={20} className="text-[#00D4FF]" />
          </span>
          <div>
            <h2 className="font-['Space_Grotesk'] font-semibold text-white text-[18px]">Your affiliate dashboard</h2>
            <p className="font-['Inter'] text-[13px] text-[#64748B]">
              Enter your referral code to see your sales and commission.
            </p>
          </div>
        </div>

        <form
          className="mt-6 flex flex-col sm:flex-row gap-3"
          onSubmit={(e) => { e.preventDefault(); void lookUp(code); }}
        >
          <div className="flex-1">
            <label htmlFor="aff-dash-code" className="sr-only">Referral code</label>
            <div className="relative">
              <Hash size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#64748B]" />
              <input
                id="aff-dash-code"
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="e.g. JANE1KXHQ"
                autoComplete="off"
                spellCheck={false}
                className={`${inputClass} pl-10 font-['IBM_Plex_Mono'] uppercase tracking-[0.06em]`}
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#00D4FF] text-[#050505] px-6 py-3 font-['Inter'] font-medium text-[14px] hover:bg-[#33DDFF] disabled:opacity-60 transition-colors duration-300"
          >
            {loading ? (
              <>
                <Loader2 size={15} className="animate-spin" /> Loading…
              </>
            ) : (
              'View dashboard'
            )}
          </button>
        </form>

        {error && (
          <p className="mt-4 flex items-start gap-2 font-['Inter'] text-[13px] text-[#FCA5A5]">
            <AlertCircle size={15} className="mt-0.5 flex-shrink-0" /> {error}
          </p>
        )}
      </div>

      {status && affiliate && (
        <>
          {/* Referral link */}
          <div className="rounded-xl border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] p-4">
            <div className="flex items-center gap-2">
              <Link2 size={15} className="text-[#00D4FF]" />
              <span className="font-['Inter'] text-[13px] text-white font-medium">Your referral link</span>
            </div>
            <div className="mt-3 flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <code className="flex-1 w-full px-3 py-2 rounded-lg bg-[#050505] border border-[rgba(255,255,255,0.12)] font-['IBM_Plex_Mono'] text-[13px] text-[#00D4FF] break-all">
                {status.referralLink}
              </code>
              <button
                type="button"
                onClick={() => void copyLink()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[rgba(255,255,255,0.15)] px-4 py-2 font-['Inter'] text-[13px] text-[#94A3B8] hover:text-white hover:border-[rgba(255,255,255,0.3)] transition-colors"
              >
                {copied ? (
                  <>
                    <Check size={14} className="text-[#86EFAC]" /> Copied
                  </>
                ) : (
                  <>
                    <Copy size={14} /> Copy link
                  </>
                )}
              </button>
            </div>
            <p className="mt-3 font-['Inter'] text-[12px] text-[#64748B] leading-[1.6]">
              Share this link with your audience. Every visitor who clicks it is
              tracked, so you earn on the sales it drives.
            </p>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat
              icon={MousePointerClick}
              label="Clicks"
              value={affiliate.clicks}
              sub="people who visited via your link"
              accent="text-[#00D4FF]"
            />
            <Stat
              icon={ShoppingCart}
              label="Sales"
              value={affiliate.conversions}
              sub={`${conversionRate}% conversion rate`}
              accent="text-[#FBBF24]"
            />
            <Stat
              icon={Banknote}
              label="Referred revenue"
              value={`$${affiliate.revenue.toFixed(2)}`}
              sub="total value of referred sales"
              accent="text-[#86EFAC]"
            />
            <Stat
              icon={TrendingUp}
              label="Est. commission"
              value={`$${commission.toFixed(2)}`}
              sub={`${Math.round((status?.commissionRate ?? 0.25) * 100)}% of referred sales`}
              accent="text-[#F472B6]"
            />
          </div>

          {/* Footer / refresh */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-xl border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] p-4">
            <p className="font-['Inter'] text-[13px] text-[#64748B]">
              Approved {new Date(affiliate.approvedAt).toLocaleDateString()} · Platform:{' '}
              <span className="text-[#94A3B8]">{affiliate.platform || '—'}</span>
            </p>
            <button
              type="button"
              onClick={() => void lookUp(code)}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[rgba(255,255,255,0.15)] px-4 py-2 font-['Inter'] text-[13px] text-[#94A3B8] hover:text-white hover:border-[rgba(255,255,255,0.3)] disabled:opacity-60 transition-colors"
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              Refresh
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default AffiliateDashboard;
