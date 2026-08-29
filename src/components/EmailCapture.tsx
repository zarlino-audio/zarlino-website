import { useState } from 'react';
import { Mail, Check, AlertCircle, Loader2 } from 'lucide-react';

interface EmailCaptureProps {
  /** Product id — drives the product-specific list (see config/products.ts). */
  topic: string;
  cta: string;
  success: string;
  /** Placeholder for the text input. */
  placeholder?: string;
  /** Compact variant for sidebars/footers. */
  compact?: boolean;
}

/**
 * Product-relevant lead capture. Posts to /api/waitlist (Worker), which stores
 * the address under `waitlist:<topic>:<email>` in KV. When a real email
 * provider (Mailchimp/Buttondown/etc.) is wired up, swap the endpoint in
 * `src/index.ts` — the component itself needs no change.
 */
const EmailCapture = ({ topic, cta, success, placeholder = 'you@studio.com', compact = false }: EmailCaptureProps) => {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const em = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(em)) {
      setState('error');
      setError('Enter a valid email address.');
      return;
    }
    setState('loading');
    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: em, topic }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setState('error');
        setError(data.error || 'Could not sign up right now. Try again later.');
        return;
      }
      setState('ok');
      setEmail('');
    } catch {
      setState('error');
      setError('Network error. Please try again.');
    }
  };

  if (state === 'ok') {
    return (
      <div className={`flex items-start gap-2 font-['Inter'] text-[14px] text-[#86EFAC] ${compact ? '' : 'rounded-xl border border-[rgba(134,239,172,0.25)] bg-[rgba(134,239,172,0.05)] p-4'}`}>
        <Check size={16} className="mt-0.5 flex-shrink-0" />
        <span>{success}</span>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className={compact ? '' : 'rounded-xl border border-[rgba(0,212,255,0.18)] bg-[rgba(0,212,255,0.03)] p-5'}>
      <div className="flex items-start gap-3">
        <span className="flex items-center justify-center w-9 h-9 rounded-lg bg-[rgba(0,212,255,0.1)] flex-shrink-0">
          <Mail size={16} className="text-[#00D4FF]" />
        </span>
        <p className="font-['Inter'] text-[14px] text-[#CBD5E1] leading-[1.6]">{cta}</p>
      </div>
      <div className="mt-4 flex flex-col sm:flex-row gap-2">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={placeholder}
          aria-label="Email address"
          className="flex-1 min-w-0 rounded-lg border border-[rgba(255,255,255,0.12)] bg-[rgba(255,255,255,0.04)] px-4 py-2.5 font-['Inter'] text-[14px] text-white placeholder:text-[#475569] focus:outline-none focus:border-[#00D4FF]"
        />
        <button
          type="submit"
          disabled={state === 'loading'}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#00D4FF] text-[#050505] px-5 py-2.5 font-['Inter'] font-medium text-[14px] hover:bg-[#33DDFF] transition-colors disabled:opacity-60"
        >
          {state === 'loading' ? <Loader2 size={15} className="animate-spin" /> : null}
          {state === 'loading' ? 'Signing up…' : 'Notify Me'}
        </button>
      </div>
      {state === 'error' && (
        <p className="mt-2 flex items-center gap-1.5 font-['Inter'] text-[13px] text-[#F87171]">
          <AlertCircle size={14} /> {error}
        </p>
      )}
      <p className="mt-2 font-['Inter'] text-[12px] text-[#475569]">
        No spam. Only {topic} content and updates. Unsubscribe anytime.
      </p>
    </form>
  );
};

export default EmailCapture;
