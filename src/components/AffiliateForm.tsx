import { useState } from 'react';
import { AlertCircle, Loader2, Award } from 'lucide-react';

type EnrolState = 'idle' | 'loading' | 'success' | 'error';

const AffiliateForm = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [platform, setPlatform] = useState('');
  const [audience, setAudience] = useState('');
  const [notes, setNotes] = useState('');
  const [state, setState] = useState<EnrolState>('idle');
  const [error, setError] = useState('');
  const [applicationId, setApplicationId] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (state === 'loading') return;

    setState('loading');
    setError('');

    try {
      const res = await fetch('/api/affiliates/enrol', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, platform, audience, notes }),
      });

      const data = await res.json();

      if (!res.ok) {
        setState('error');
        setError(data.error || 'Could not submit your application right now. Try again later.');
        return;
      }

      setApplicationId(typeof data.id === 'string' ? data.id : '');
      setState('success');
    } catch {
      setState('error');
      setError('Network error. Please try again, or email support@zarlinoaudio.com.');
    }
  };

  const inputClass =
    "w-full rounded-lg bg-[#050505] border border-[rgba(255,255,255,0.12)] px-4 py-3 font-['Inter'] text-[15px] text-white placeholder:text-[#475569] focus:outline-none focus:border-[#00D4FF] transition-colors";

  const reset = () => {
    setState('idle');
    setName('');
    setEmail('');
    setPlatform('');
    setAudience('');
    setNotes('');
    setError('');
    setApplicationId('');
  };

  return (
    <div className="rounded-2xl border border-[rgba(0,212,255,0.25)] bg-[rgba(0,212,255,0.04)] p-6 md:p-8">
      {state === 'success' ? (
        <div className="text-center py-6">
          <span className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-[rgba(134,239,172,0.12)]">
            <Award size={22} className="text-[#00D4FF]" />
          </span>
          <h3 className="mt-4 font-['Space_Grotesk'] font-semibold text-white text-[20px]">
            Application received
          </h3>
          <p className="mt-2 font-['Inter'] text-[14px] text-[#94A3B8] leading-[1.7] max-w-[480px] mx-auto">
            Thanks, {name.trim().split(' ')[0] || 'friend'}. Your application is now{' '}
            <span className="text-[#FBBF24] font-medium">pending review</span>. We review every
            application before issuing a referral code. If approved, we will email{' '}
            <span className="text-white">{email}</span> with your unique referral link and code.
          </p>
          <button
            type="button"
            onClick={reset}
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-white text-[#050505] px-6 py-3 font-['Inter'] font-medium text-[14px] hover:bg-[#00D4FF] transition-colors duration-300"
          >
            Submit another application
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div>
            <span className="font-['Inter'] font-medium text-[14px] text-white">
              Apply to become an affiliate
            </span>
            <p className="mt-1 font-['Inter'] text-[13px] text-[#64748B] leading-[1.6]">
              25% commission on every sale you refer. No cost to join.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="aff-name" className="block font-['Inter'] text-[13px] text-[#94A3B8] mb-2">
                Full name <span className="text-[#00D4FF]">*</span>
              </label>
              <input
                id="aff-name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jane Engineer"
                autoComplete="name"
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="aff-email" className="block font-['Inter'] text-[13px] text-[#94A3B8] mb-2">
                Email address <span className="text-[#00D4FF]">*</span>
              </label>
              <input
                id="aff-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <label htmlFor="aff-platform" className="block font-['Inter'] text-[13px] text-[#94A3B8] mb-2">
              Where will you share? <span className="text-[#475569]">(YouTube, blog, newsletter…)</span>
            </label>
            <input
              id="aff-platform"
              type="text"
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
              placeholder="e.g. YouTube channel, mixing blog"
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="aff-audience" className="block font-['Inter'] text-[13px] text-[#94A3B8] mb-2">
              Your audience <span className="text-[#475569]">(roughly how big?)</span>
            </label>
            <input
              id="aff-audience"
              type="text"
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
              placeholder="e.g. 1.2k YouTube subs, 800 newsletter readers"
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="aff-notes" className="block font-['Inter'] text-[13px] text-[#94A3B8] mb-2">
              Anything else? <span className="text-[#475569]">(optional)</span>
            </label>
            <textarea
              id="aff-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              placeholder="Mention your content, how you cover mixing/mastering tools, or anything the team should consider."
              className={`${inputClass} resize-y min-h-[100px]`}
            />
          </div>

          <button
            type="submit"
            disabled={state === 'loading'}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#00D4FF] text-[#050505] px-6 py-3.5 font-['Inter'] font-medium text-[15px] hover:bg-[#33DDFF] disabled:opacity-60 transition-colors duration-300"
          >
            {state === 'loading' ? (
              <>
                <Loader2 size={16} className="animate-spin" /> Submitting…
              </>
            ) : (
              'Submit application'
            )}
          </button>

          {state === 'error' && (
            <p className="flex items-start gap-2 font-['Inter'] text-[13px] text-[#FCA5A5]">
              <AlertCircle size={15} className="mt-0.5 flex-shrink-0" />
              {error}
            </p>
          )}
        </form>
      )}
    </div>
  );
};

export default AffiliateForm;
