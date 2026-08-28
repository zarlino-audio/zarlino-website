import { useEffect, useState } from 'react';
import { Loader2, CheckCircle2, XCircle, Copy, Check, AlertTriangle, KeyRound, ShoppingBag } from 'lucide-react';
import { useCartStore } from '../store/cartStore';

type VerifyResult = {
  ok: boolean;
  status?: string;
  reference?: string;
  email?: string;
  amount?: number;
  currency?: string;
  licenses?: Array<{ licenseKey: string; plugin: string; pluginName: string }>;
  alreadyIssued?: boolean;
  message?: string;
  error?: string;
};

type State = 'verifying' | 'success' | 'error';

const CheckoutResult = () => {
  const [state, setState] = useState<State>('verifying');
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [copied, setCopied] = useState('');
  const clearCart = useCartStore((s) => s.clearCart);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const reference = params.get('reference') || params.get('trxref') || '';
    if (!reference) {
      setState('error');
      setResult({ ok: false, message: 'No payment reference found.' });
      return;
    }

    (async () => {
      try {
        const res = await fetch(`/api/paystack/verify?reference=${encodeURIComponent(reference)}`);
        const data = (await res.json()) as VerifyResult;
        if (data.ok && data.status === 'success') {
          setResult(data);
          setState('success');
          clearCart();
        } else {
          setResult({ ...data, ok: false });
          setState('error');
        }
      } catch {
        setState('error');
        setResult({ ok: false, message: 'Could not verify your payment. Check your email for your licenses or contact support.' });
      }
    })();
  }, [clearCart]);

  const copyKey = async (key: string, id: string) => {
    try {
      await navigator.clipboard.writeText(key);
      setCopied(id);
      setTimeout(() => setCopied(''), 2000);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div className="max-w-[720px] mx-auto">
      {state === 'verifying' && (
        <div className="rounded-2xl border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.03)] p-10 text-center">
          <Loader2 size={32} className="animate-spin text-[#00D4FF] mx-auto" />
          <h1 className="mt-4 font-['Space_Grotesk'] font-semibold text-white text-[22px]">Verifying your payment…</h1>
          <p className="mt-2 font-['Inter'] text-[14px] text-[#94A3B8]">Confirming your transaction with Paystack. This takes a few seconds.</p>
        </div>
      )}

      {state === 'success' && result && (
        <div className="rounded-2xl border border-[rgba(134,239,172,0.3)] bg-[rgba(134,239,172,0.05)] p-8">
          <span className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-[rgba(134,239,172,0.15)]">
            <CheckCircle2 size={28} className="text-[#86EFAC]" />
          </span>
          <h1 className="mt-4 font-['Space_Grotesk'] font-semibold text-white text-[26px]">Payment confirmed — welcome to Zarlino!</h1>
          <p className="mt-2 font-['Inter'] text-[14px] text-[#94A3B8] leading-[1.7]">
            {result.alreadyIssued
              ? 'Your licenses were issued earlier — they are shown below for convenience.'
              : `Your licenses are ready. We charged ${result.currency === 'GHS' ? '₵' + (result.amount ?? 0).toLocaleString() : '$' + (result.amount ?? 0).toFixed(2)} ${result.currency === 'GHS' ? '' : result.currency ?? 'USD'} to the email on file. Paste a key into the matching plugin's license dialog.`}
          </p>

          <div className="mt-6 flex flex-col gap-4">
            {(result.licenses ?? []).length === 0 && (
              <p className="font-['Inter'] text-[13px] text-[#FBBF24]">
                No license keys were returned. If you don't receive them by email, contact{' '}
                <a href="mailto:support@zarlinoaudio.com" className="text-[#00D4FF] hover:underline">support@zarlinoaudio.com</a>{' '}
                with reference <code className="text-white">{result.reference}</code>.
              </p>
            )}
            {(result.licenses ?? []).map((lic) => (
              <div key={lic.plugin} className="rounded-xl border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.03)] p-5">
                <div className="flex items-center gap-2 font-['Space_Grotesk'] font-semibold text-white text-[16px]">
                  <KeyRound size={16} className="text-[#00D4FF]" /> {lic.pluginName} license
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <code className="flex-1 break-all rounded-lg bg-[#050505] border border-[rgba(255,255,255,0.1)] px-4 py-3 font-['IBM_Plex_Mono'] text-[12px] leading-[1.6] text-[#00D4FF] select-all">
                    {lic.licenseKey}
                  </code>
                  <button
                    type="button"
                    onClick={() => copyKey(lic.licenseKey, lic.plugin)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-white text-[#050505] px-4 py-3 font-['Inter'] font-medium text-[13px] hover:bg-[#00D4FF] transition-colors duration-300"
                  >
                    {copied === lic.plugin ? <Check size={14} /> : <Copy size={14} />}
                    {copied === lic.plugin ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 flex flex-col sm:flex-row gap-3">
            <a
              href="/plugins/ztame"
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#00D4FF] text-[#050505] px-6 py-3 font-['Inter'] font-medium text-[14px] hover:bg-[#33DDFF] transition-colors duration-300"
            >
              <ShoppingBag size={14} /> Get the plugins
            </a>
            <a
              href="/"
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-[rgba(255,255,255,0.15)] px-6 py-3 font-['Inter'] text-[14px] text-[#94A3B8] hover:text-white hover:border-[rgba(255,255,255,0.3)] transition-colors"
            >
              Back to home
            </a>
          </div>
        </div>
      )}

      {state === 'error' && (
        <div className="rounded-2xl border border-[rgba(252,165,165,0.3)] bg-[rgba(252,165,165,0.05)] p-8">
          <span className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-[rgba(252,165,165,0.15)]">
            <XCircle size={28} className="text-[#FCA5A5]" />
          </span>
          <h1 className="mt-4 font-['Space_Grotesk'] font-semibold text-white text-[24px]">Payment not confirmed yet</h1>
          <p className="mt-2 font-['Inter'] text-[14px] text-[#94A3B8] leading-[1.7]">
            <AlertTriangle size={14} className="inline -mt-0.5 mr-1 text-[#FBBF24]" />
            {result?.message || result?.error || 'Your payment could not be verified.'} If you were charged, your licenses will be emailed to you — or contact{' '}
            <a href="mailto:support@zarlinoaudio.com" className="text-[#00D4FF] hover:underline">support@zarlinoaudio.com</a>{' '}
            with the payment reference.
          </p>
          <div className="mt-6 flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#00D4FF] text-[#050505] px-6 py-3 font-['Inter'] font-medium text-[14px] hover:bg-[#33DDFF] transition-colors duration-300"
            >
              Try verifying again
            </button>
            <a
              href="/"
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-[rgba(255,255,255,0.15)] px-6 py-3 font-['Inter'] text-[14px] text-[#94A3B8] hover:text-white hover:border-[rgba(255,255,255,0.3)] transition-colors"
            >
              Back to home
            </a>
          </div>
        </div>
      )}
    </div>
  );
};

export default CheckoutResult;
