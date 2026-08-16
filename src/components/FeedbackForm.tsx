import { useState } from 'react';
import { Bug, Lightbulb, MessagesSquare, Check, AlertCircle, Loader2 } from 'lucide-react';

type FeedbackState = 'idle' | 'loading' | 'success' | 'error';

const categories = [
  {
    id: 'bug',
    label: 'Bug report',
    hint: 'Something crashed, glitched, or behaved unexpectedly.',
    icon: Bug,
  },
  {
    id: 'suggestion',
    label: 'Feature suggestion',
    hint: 'An idea or improvement you would like to see.',
    icon: Lightbulb,
  },
  {
    id: 'other',
    label: 'Other',
    hint: 'Feedback, praise, or anything else.',
    icon: MessagesSquare,
  },
] as const;

const FeedbackForm = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [category, setCategory] = useState<'bug' | 'suggestion' | 'other'>('bug');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [state, setState] = useState<FeedbackState>('idle');
  const [error, setError] = useState('');
  const [issueUrl, setIssueUrl] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (state === 'loading') return;

    setState('loading');
    setError('');

    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, category, subject, message }),
      });

      const data = await res.json();

      if (!res.ok) {
        setState('error');
        setError(data.error || 'Could not submit your report right now. Try again later.');
        return;
      }

      setIssueUrl(data.url || '');
      setState('success');
    } catch {
      setState('error');
      setError('Network error. Please try again, or email support@zarlinoaudio.com.');
    }
  };

  const inputClass =
    'w-full rounded-lg bg-[#050505] border border-[rgba(255,255,255,0.12)] px-4 py-3 font-[\'Inter\'] text-[15px] text-white placeholder:text-[#475569] focus:outline-none focus:border-[#00D4FF] transition-colors';

  return (
    <div className="rounded-2xl border border-[rgba(0,212,255,0.25)] bg-[rgba(0,212,255,0.04)] p-6 md:p-8">
      {state === 'success' ? (
        <div className="text-center py-6">
          <span className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-[rgba(134,239,172,0.12)]">
            <Check size={22} className="text-[#86EFAC]" />
          </span>
          <h3 className="mt-4 font-['Space_Grotesk'] font-semibold text-white text-[20px]">
            Thanks — report submitted
          </h3>
          <p className="mt-2 font-['Inter'] text-[14px] text-[#94A3B8] leading-[1.7] max-w-[480px] mx-auto">
            The Zarlino team will review your {category === 'bug' ? 'bug report' : category === 'suggestion' ? 'suggestion' : 'feedback'}.
            {issueUrl ? (
              <>
                {' '}
                You can track it at{' '}
                <a
                  href={issueUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#00D4FF] hover:underline"
                >
                  this public thread
                </a>
                .
              </>
            ) : (
              ' If you left an email, we may follow up for details.'
            )}
          </p>
          <button
            type="button"
            onClick={() => {
              setState('idle');
              setName('');
              setEmail('');
              setCategory('bug');
              setSubject('');
              setMessage('');
            }}
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-white text-[#050505] px-6 py-3 font-['Inter'] font-medium text-[14px] hover:bg-[#00D4FF] transition-colors duration-300"
          >
            Submit another report
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          {/* Category */}
          <div>
            <span className="font-['Inter'] font-medium text-[14px] text-white">
              What is this about?
            </span>
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
              {categories.map((c) => {
                const Icon = c.icon;
                const active = category === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setCategory(c.id)}
                    className={`flex flex-col items-start gap-2 rounded-xl border p-4 text-left transition-all duration-300 ${
                      active
                        ? 'border-[#00D4FF] bg-[rgba(0,212,255,0.08)]'
                        : 'border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.03)] hover:border-[rgba(255,255,255,0.2)]'
                    }`}
                  >
                    <Icon size={18} className={active ? 'text-[#00D4FF]' : 'text-[#64748B]'} />
                    <span className="font-['Inter'] font-medium text-[14px] text-white">
                      {c.label}
                    </span>
                    <span className="font-['Inter'] text-[12px] text-[#64748B] leading-[1.5]">
                      {c.hint}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Name + Email */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="fb-name" className="block font-['Inter'] text-[13px] text-[#94A3B8] mb-2">
                Your name <span className="text-[#475569]">(optional)</span>
              </label>
              <input
                id="fb-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jane Engineer"
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="fb-email" className="block font-['Inter'] text-[13px] text-[#94A3B8] mb-2">
                Email <span className="text-[#475569]">(optional, for follow-up)</span>
              </label>
              <input
                id="fb-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className={inputClass}
              />
            </div>
          </div>

          {/* Subject */}
          <div>
            <label htmlFor="fb-subject" className="block font-['Inter'] text-[13px] text-[#94A3B8] mb-2">
              Subject
            </label>
            <input
              id="fb-subject"
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. CPU spike when oversampling is set to 4x"
              className={inputClass}
            />
          </div>

          {/* Message */}
          <div>
            <label htmlFor="fb-message" className="block font-['Inter'] text-[13px] text-[#94A3B8] mb-2">
              Details
            </label>
            <textarea
              id="fb-message"
              required
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={7}
              placeholder={
                category === 'bug'
                  ? 'For bugs: what were you doing, what did you expect, and what actually happened? Include your DAW, OS, and plugin version (e.g. 1.0.0) if relevant.'
                  : 'Tell us what you would like ZTame (or Zarlino Audio) to do better, or share an idea for a new feature.'
              }
              className={`${inputClass} resize-y min-h-[140px]`}
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
              'Submit Feedback'
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

export default FeedbackForm;
