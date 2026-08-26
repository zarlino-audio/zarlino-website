import { useState } from 'react';
import { Check, AlertCircle, Loader2, Megaphone } from 'lucide-react';

type FormState = 'idle' | 'loading' | 'success' | 'error';

const AffiliateEnrolForm = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [platform, setPlatform] = useState('');
  const [audience, setAudience] = useState('');
  const [notes, setNotes] = useState('');
  const [state, setState] = useState<FormState>('idle');
  const [error, setError] = useState('');

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
        setError(data.error || 'Could not send your application right now. Try again later.');
        return;
      }

      setState('success');
    } catch {
      setState('error');
      setError('Network error. Please try again, or email support@zarlinoaudio.com.');
    }
  };

  const inputClass =
    "w-full rounded-lg bg-[#050505] border border-[rgba(255,255,255,0.12)] px-4 py-3 font-['Inter'] text-[15px] text-white placeholder:text-[#475569] focus:outline-none focus:border-[#00D4FF] transition-colors";

  const reset = () => {
    setName('');
    setEmail('');
    setPlatform('');
    setAudience('');
    setNotes('');
  };

  return (
    <div className="rounded-2xl border border-[rgba(0,212,255,0.25)] bg-[rgba(0,212,255,0.04)] p-6 md:p-8">
      {state === 'success' ? (
        <div className="text-center py-6">
          <span className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-[rgba(134,239,172,0.12)]">
            <Check size={22} className="text-[#86EFAC]" />
          </span>
          <h3 className="mt-4 font-['Space_Grotesk'] font-semibold text-white text-[20px]">
            Application received
          </h3>
          <p className="mt-2 font-['Inter'] text-[14px] text-[#94A3B8] leading-[1.7] max-w-[480px] mx-auto">
            Thanks for your interest in the Zarlino Affiliate Program. We review every
            application and will be in touch soon with next steps.
          </p>
          <button
            type="button"
            onClick={() => {
              setState('idle');
              reset();
            }}
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-white text-[#050505] px-6 py-3 font-['Inter'] font-medium text-[14px] hover:bg-[#00D4FF] transition-colors duration-300"
          >
            Submit another application
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          {/* Intro */}
          <div className="flex items-start gap-3">
            <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-[rgba(0,212,255,0.12)] shrink-0">
              <Megaphone size={18} className="text-[#00D4FF]" />
            </span>
            <p className="font-['Inter'] text-[14px] text-[#94A3B8] leading-[1.7]">
              Tell us a little about yourself and your audience. Applications are free and
              reviewed by the Zarlino team.
            </p>
          </div>

          {/* Name */}
          <div>
            <label htmlFor="aff-name" className="block font-['Inter'] text-[13px] text-[#94A3B8] mb-2">
              Name <span className="text-[#00D4FF]">*</span>
            </label>
            <input
              id="aff-name"
              type="text"
              value={name}
              maxLength={120}
              onChange={(e) => setName(e.target.value)}
              placeholder="Alex Rivers"
              required
              className={inputClass}
            />
          </div>

          {/* Email */}
          <div>
            <label htmlFor="aff-email" className="block font-['Inter'] text-[13px] text-[#94A3B8] mb-2">
              Email <span className="text-[#00D4FF]">*</span>
            </label>
            <input
              id="aff-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              className={inputClass}
            />
          </div>

          {/* Platform */}
          <div>
            <label htmlFor="aff-platform" className="block font-['Inter'] text-[13px] text-[#94A3B8] mb-2">
              Where do you create? <span className="text-[#475569]">(optional)</span>
            </label>
            <input
              id="aff-platform"
              type="text"
              value={platform}
              maxLength={80}
              onChange={(e) => setPlatform(e.target.value)}
              placeholder="e.g. YouTube, blog, Discord community"
              className={inputClass}
            />
          </div>

          {/* Audience */}
          <div>
            <label htmlFor="aff-audience" className="block font-['Inter'] text-[13px] text-[#94A3B8] mb-2">
              Describe your audience <span className="text-[#475569]">(optional)</span>
            </label>
            <input
              id="aff-audience"
              type="text"
              value={audience}
              maxLength={200}
              onChange={(e) => setAudience(e.target.value)}
              placeholder="e.g. ~5k mixing engineers, mostly home-studio producers"
              className={inputClass}
            />
          </div>

          {/* Notes */}
          <div>
            <label htmlFor="aff-notes" className="block font-['Inter'] text-[13px] text-[#94A3B8] mb-2">
              Anything else? <span className="text-[#475569]">(optional)</span>
            </label>
            <textarea
              id="aff-notes"
              value={notes}
              maxLength={500}
              onChange={(e) => setNotes(e.target.value)}
              rows={5}
              placeholder="Links to your content, reach, or why you want to join."
              className={`${inputClass} resize-y min-h-[110px]`}
            />
          </div>

          <button
            type="submit"
            disabled={state === 'loading'}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#00D4FF] text-[#050505] px-6 py-3.5 font-['Inter'] font-medium text-[15px] hover:bg-[#33DDFF] disabled:opacity-60 transition-colors duration-300"
          >
            {state === 'loading' ? (
              <>
                <Loader2 size={16} className="animate-spin" /> Sending…
              </>
            ) : (
              'Apply for the affiliate program'
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

export default AffiliateEnrolForm;
