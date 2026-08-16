import { useState } from 'react';
import { KeyRound, Check, Copy, AlertCircle, Loader2 } from 'lucide-react';

type LicenseState = 'idle' | 'loading' | 'success' | 'error';

const LicenseForm = () => {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<LicenseState>('idle');
  const [licenseKey, setLicenseKey] = useState('');
  const [message, setMessage] = useState('');
  const [copied, setCopied] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (state === 'loading') return;

    setState('loading');
    setMessage('');

    try {
      const res = await fetch('/api/license', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();

      if (!res.ok) {
        setState('error');
        setMessage(data.error || 'Could not generate a license right now. Try again later.');
        return;
      }

      setLicenseKey(data.licenseKey);
      setState('success');
    } catch {
      setState('error');
      setMessage('Network error. Please try again.');
    }
  };

  const copyKey = async () => {
    try {
      await navigator.clipboard.writeText(licenseKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div className="rounded-2xl border border-[rgba(0,212,255,0.25)] bg-[rgba(0,212,255,0.04)] p-6 md:p-8">
      <div className="flex items-center gap-3">
        <span className="flex items-center justify-center w-10 h-10 rounded-full bg-[rgba(0,212,255,0.15)]">
          <KeyRound size={18} className="text-[#00D4FF]" />
        </span>
        <div>
          <h3 className="font-['Space_Grotesk'] font-semibold text-white text-[20px]">
            Get Your Free License
          </h3>
          <p className="font-['Inter'] text-[13px] text-[#94A3B8]">
            Free until August 21, 2026 — your key is perpetual.
          </p>
        </div>
      </div>

      {state === 'success' ? (
        <div className="mt-6">
          <div className="flex items-start gap-2 font-['Inter'] text-[14px] text-[#86EFAC]">
            <Check size={16} className="mt-0.5 flex-shrink-0" />
            <span>License generated! Paste this key into ZTame's license dialog.</span>
          </div>

          <div className="mt-4 flex items-center gap-2">
            <code className="flex-1 break-all rounded-lg bg-[#050505] border border-[rgba(255,255,255,0.1)] px-4 py-3 font-['IBM_Plex_Mono'] text-[12px] leading-[1.6] text-[#00D4FF] select-all">
              {licenseKey}
            </code>
            <button
              type="button"
              onClick={copyKey}
              className="flex items-center gap-2 rounded-lg bg-white text-[#050505] px-4 py-3 font-['Inter'] font-medium text-[13px] hover:bg-[#00D4FF] transition-colors duration-300"
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>

          <p className="mt-3 font-['Inter'] text-[13px] text-[#64748B]">
            Also sent to <span className="text-[#94A3B8]">{email}</span> — check your inbox. Need it again? Email{' '}
            <a href="mailto:support@zarlinoaudio.com" className="text-[#00D4FF] hover:underline">
              support@zarlinoaudio.com
            </a>
            .
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="mt-6 flex flex-col sm:flex-row gap-3">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="flex-1 rounded-lg bg-[#050505] border border-[rgba(255,255,255,0.12)] px-4 py-3 font-['Inter'] text-[15px] text-white placeholder:text-[#475569] focus:outline-none focus:border-[#00D4FF] transition-colors"
          />
          <button
            type="submit"
            disabled={state === 'loading'}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#00D4FF] text-[#050505] px-6 py-3 font-['Inter'] font-medium text-[15px] hover:bg-[#33DDFF] disabled:opacity-60 transition-colors duration-300"
          >
            {state === 'loading' ? (
              <>
                <Loader2 size={16} className="animate-spin" /> Generating…
              </>
            ) : (
              'Get Free License'
            )}
          </button>
        </form>
      )}

      {state === 'error' && (
        <p className="mt-4 flex items-start gap-2 font-['Inter'] text-[13px] text-[#FCA5A5]">
          <AlertCircle size={15} className="mt-0.5 flex-shrink-0" />
          {message}
        </p>
      )}
    </div>
  );
};

export default LicenseForm;
