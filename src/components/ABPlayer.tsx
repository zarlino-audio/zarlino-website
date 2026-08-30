import { useState } from 'react';
import { Play, Pause, Volume2, Info } from 'lucide-react';

export interface ABPreset {
  label: string;       // e.g. 'Vocal Soothe'
  source: string;      // honest source note (track + FL Studio demo project)
  disclosure: string;  // disclosed settings
  a: string;           // dry / original
  b: string;           // processed
}

/** Fire a lightweight `demo` conversion event (no-op if KV unbound). */
function trackDemo() {
  try {
    const body = JSON.stringify({ path: window.location.pathname, event: 'demo' });
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/track', new Blob([body], { type: 'application/json' }));
    } else {
      fetch('/api/track', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true });
    }
  } catch { /* best-effort */ }
}

/** Embedded A/B comparison player — up to 3 disclosed presets, each with
 *  real audio (untouched source A vs the plugin's own processing B). */
const ABPlayer = ({ plugin, presets }: { plugin: string; presets: ABPreset[] }) => {
  const [active, setActive] = useState(0);
  const demo = presets[active] ?? presets[0];

  return (
    <div className="rounded-2xl border border-[rgba(0,212,255,0.2)] bg-[rgba(0,212,255,0.03)] p-6 md:p-8">
      <div className="flex items-center gap-3">
        <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-[rgba(0,212,255,0.12)]">
          <Volume2 size={18} className="text-[#00D4FF]" />
        </span>
        <div>
          <h3 className="font-['Space_Grotesk'] font-semibold text-white text-[18px]">
            Hear {plugin} — A/B
          </h3>
          <p className="font-['Inter'] text-[13px] text-[#64748B]">
            Real audio, before &amp; after. Presets are disclosed — no hidden processing.
          </p>
        </div>
      </div>

      {/* Preset selector (up to 3) */}
      {presets.length > 1 && (
        <div className="mt-5">
          <p className="font-['Inter'] text-[11px] uppercase tracking-[0.12em] text-[#64748B] mb-2">
            Choose a preset to audition
          </p>
          <div className="flex flex-wrap gap-2">
            {presets.map((p, i) => (
              <button
                key={p.label}
                type="button"
                onClick={() => setActive(i)}
                aria-pressed={i === active}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 font-['Inter'] text-[12px] transition-colors ${
                  i === active
                    ? 'border-[rgba(0,212,255,0.6)] bg-[rgba(0,212,255,0.1)] text-[#00D4FF]'
                    : 'border-[rgba(255,255,255,0.12)] text-[#94A3B8] hover:text-white'
                }`}
              >
                <Play size={11} /> {p.label}
              </button>
            ))}
          </div>
          <p className="font-['Inter'] text-[11px] text-[#475569] mt-1.5">{demo.source}</p>
        </div>
      )}

      {/* A / B players */}
      <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-xl border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] p-4">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-2 font-['IBM_Plex_Mono'] text-[11px] uppercase tracking-[0.1em] text-[#94A3B8]">
              <Play size={12} /> A — Original
            </span>
            <span className="font-['Inter'] text-[11px] text-[#475569]">preset: {demo.label}</span>
          </div>
          <audio controls preload="none" src={demo.a} onPlay={trackDemo} className="mt-3 w-full h-10" />
        </div>
        <div className="rounded-xl border border-[rgba(0,212,255,0.25)] bg-[rgba(0,212,255,0.04)] p-4">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-2 font-['IBM_Plex_Mono'] text-[11px] uppercase tracking-[0.1em] text-[#00D4FF]">
              <Pause size={12} /> B — {plugin}: “{demo.label}”
            </span>
          </div>
          <audio controls preload="none" src={demo.b} onPlay={trackDemo} className="mt-3 w-full h-10" />
        </div>
      </div>

      {/* Disclosed preset */}
      <div className="mt-4 flex items-start gap-2 rounded-lg border border-[rgba(251,191,36,0.2)] bg-[rgba(251,191,36,0.04)] px-4 py-3">
        <Info size={14} className="mt-0.5 flex-shrink-0 text-[#FBBF24]" />
        <p className="font-['Inter'] text-[12px] text-[#94A3B8] leading-[1.7]">
          <span className="text-[#FBBF24] font-medium">Disclosed preset — {demo.label}: </span>
          {demo.disclosure}
        </p>
      </div>
    </div>
  );
};

export default ABPlayer;
