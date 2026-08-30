import { useState } from 'react';
import { Play, Pause, Volume2, Info, Disc3 } from 'lucide-react';

export interface ABPreset {
  label: string;       // e.g. 'Vocal Soothe'
  disclosure: string;  // disclosed settings
  a: string;           // dry / original
  b: string;           // processed
}

export interface ABSource {
  id: string;
  name: string;        // e.g. 'KARRA — Lead Vocal'
  meta: string;        // e.g. 'FL Studio demo project stem'
  presets: ABPreset[];
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

/** Embedded A/B comparison player — real audio sources, the plugin's own
 *  processing (B) vs the untouched source (A). Users can pick which source
 *  to audition the plugin through. Presets are fully disclosed. */
const ABPlayer = ({ plugin, sources }: { plugin: string; sources: ABSource[] }) => {
  const [sourceIdx, setSourceIdx] = useState(0);
  const [presetIdx, setPresetIdx] = useState(0);

  const source = sources[sourceIdx];
  const presets = source.presets;
  const demo = presets[presetIdx] ?? presets[0];

  const pickSource = (i: number) => {
    setSourceIdx(i);
    setPresetIdx(0);
  };

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
            Real audio sources, before &amp; after. Presets are disclosed — no hidden processing.
          </p>
        </div>
      </div>

      {/* Source selector */}
      {sources.length > 1 && (
        <div className="mt-5">
          <p className="font-['Inter'] text-[11px] uppercase tracking-[0.12em] text-[#64748B] mb-2">
            Choose a source to audition
          </p>
          <div className="flex flex-wrap gap-2">
            {sources.map((s, i) => (
              <button
                key={s.id}
                type="button"
                onClick={() => pickSource(i)}
                aria-pressed={i === sourceIdx}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 font-['Inter'] text-[12px] transition-colors ${
                  i === sourceIdx
                    ? 'border-[rgba(0,212,255,0.6)] bg-[rgba(0,212,255,0.1)] text-[#00D4FF]'
                    : 'border-[rgba(255,255,255,0.12)] text-[#94A3B8] hover:text-white'
                }`}
              >
                <Disc3 size={12} /> {s.name}
              </button>
            ))}
          </div>
          <p className="font-['Inter'] text-[11px] text-[#475569] mt-1.5">{source.meta}</p>
        </div>
      )}

      {/* Preset selector */}
      {presets.length > 1 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {presets.map((p, i) => (
            <button
              key={p.label}
              type="button"
              onClick={() => setPresetIdx(i)}
              aria-pressed={i === presetIdx}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 font-['Inter'] text-[12px] transition-colors ${
                i === presetIdx
                  ? 'border-[rgba(0,212,255,0.6)] bg-[rgba(0,212,255,0.1)] text-[#00D4FF]'
                  : 'border-[rgba(255,255,255,0.12)] text-[#94A3B8] hover:text-white'
              }`}
            >
              <Play size={11} /> {p.label}
            </button>
          ))}
        </div>
      )}

      {/* A / B players */}
      <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-xl border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] p-4">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-2 font-['IBM_Plex_Mono'] text-[11px] uppercase tracking-[0.1em] text-[#94A3B8]">
              <Play size={12} /> A — Original
            </span>
            <span className="font-['Inter'] text-[11px] text-[#475569]">source: {source.name}</span>
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
