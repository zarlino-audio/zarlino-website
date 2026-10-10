import { useState } from 'react';
import { KeyRound, Copy, Check, AlertCircle, Loader2 } from 'lucide-react';

type LicenseState = 'idle' | 'loading' | 'success' | 'error';

interface LicenseFormProps {
  /** Plugin key used by the Worker (`/api/license`): 'ztame' | 'zscorch'. */
  plugin: string;
}

/**
 * Perpetual-license request form.
 *
 * Posts `{ email, plugin }` to the Worker's `/api/license` endpoint, which returns
 * a signed, base64-encoded license blob. The user pastes that blob into the
 * plugin's license dialog. The form never handles keys client-side — signing is
 * server-side only.
 */
const LicenseForm = ({ plugin }: LicenseFormProps) => {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<LicenseState>('idle');
  const [error, setError] = useState('');
  const [licenseKey, setLicenseKey] = useState('');
  const [copied, setCopied] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (state === 'loading') return;

    setState('loading');
    setError('');

    try {
      const res = await fetch('/api/license', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, plugin }),
      });

      const data = await res.json();

      if (!res.ok) {
        setState('error');
        setError(data.error || 'Could not issue a license right now. Try again later.');
        return;
      }

      setLicenseKey(data.licenseKey || '');
      setState('success');
    } catch {
      setState('error');
      setError('Network error. Please try again, or email support@zarlinoaudio.com.');
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(licenseKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API can be unavailable (older browsers / permissions).
      // The textarea is selectable, so the user can still copy manually.
      setCopied(false);
    }
  };

  const inputClass =
    "w-full rounded-lg bg-[#050505] border border-[rgba(255,255,255,0.12)] px-4 py-3 font-['Inter'] text-[15px] text-white placeholder:text-[#475569] focus:outline-none focus:border-[#00D4FF] transition-colors";

  if (state === 'success') {
    return (
      <div className="max-w-[650px] rounded-xl border border-[rgba(0,212,255,0.25)] bg-[rgba(0,212,255,0.04)] p-6">
        <div className="flex items-center gap-2 font-['Space_Grotesk'] font-semibold text-white text-[16px]">
          <Check size={18} className="text-[#00D4FF]" />
          Your perpetual license key
        </div>
        <p className="mt-2 font-['Inter'] text-[14px] text-[#94A3B8] leading-[1.7]">
          Paste this key into the plugin's license dialog, then restart your DAW if it asks you to.
        </p>
        <textarea
          readOnly
          value={licenseKey}
          rows={4}
          onFocus={(e) => e.currentTarget.select()}
          className="mt-4 w-full rounded-lg bg-[#050505] border border-[rgba(255,255,255,0.12)] px-4 py-3 font-['IBM_Plex_Mono'] text-[12px] text-[#CBD5E1] focus:outline-none focus:border-[#00D4FF] break-all resize-none"
          aria-label="License key"
        />
        <button
          type="button"
          onClick={handleCopy}
          className="mt-3 inline-flex items-center gap-2 rounded-lg bg-[#00D4FF] text-[#050505] px-5 py-2.5 font-['Inter'] font-medium text-[14px] hover:bg-[#33DDFF] transition-colors"
        >
          {copied ? <Check size={15} /> : <Copy size={15} />}
          {copied ? 'Copied' : 'Copy key'}
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-[650px]">
      <label
        htmlFor={`license-email-${plugin}`}
        className="block font-['Inter'] text-[13px] text-[#94A3B8] mb-2"
      >
        Email address — the key is issued to this address
      </label>
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          id={`license-email-${plugin}`}
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@studio.com"
          className={inputClass}
        />
        <button
          type="submit"
          disabled={state === 'loading'}
          className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-[#00D4FF] text-[#050505] px-7 py-3 font-['Inter'] font-medium text-[15px] hover:bg-[#33DDFF] disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          {state === 'loading' ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Requesting…
            </>
          ) : (
            <>
              <KeyRound size={16} />
              Get license key
            </>
          )}
        </button>
      </div>

      {state === 'error' && (
        <div
          role="alert"
          className="mt-3 flex items-start gap-2 rounded-lg border border-[rgba(248,113,113,0.3)] bg-[rgba(248,113,113,0.06)] px-4 py-3"
        >
          <AlertCircle size={16} className="mt-0.5 shrink-0 text-[#F87171]" />
          <p className="font-['Inter'] text-[14px] text-[#FCA5A5] leading-[1.6]">{error}</p>
        </div>
      )}
    </form>
  );
};

export default LicenseForm;
