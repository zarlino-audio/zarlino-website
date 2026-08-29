import { useState } from 'react';
import { Play, Pause, Volume2, Info } from 'lucide-react';

export interface ABDemo {
  preset: string;
  disclosure: string;
  a: string; // dry / original
  b: string; // processed
}

/** Embedded A/B comparison player — the plugin's own audio, dry (A) vs
 *  processed (B), with the exact preset disclosed under each pair. */
const ABPlayer = ({ plugin, demos }: { plugin: string; demos: ABDemo[] }) => {
  const [active, setActive] = useState(0);
  const demo = demos[active];

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
            Same source, before &amp; after. Presets are disclosed — no hidden processing.
          </p>
        </div>
      </div>

      {/* Preset selector */}
      {demos.length > 1 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {demos.map((d, i) => (
            <button
              key={d.preset}
              type="button"
              onClick={() => setActive(i)}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 font-['Inter'] text-[12px] transition-colors ${
                i === active
                  ? 'border-[rgba(0,212,255,0.6)] bg-[rgba(0,212,255,0.1)] text-[#00D4FF]'
                  : 'border-[rgba(255,255,255,0.12)] text-[#94A3B8] hover:text-white'
              }`}
            >
              <Play size={11} /> {d.preset}
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
            <span className="font-['Inter'] text-[11px] text-[#475569]">source: {demo.preset}</span>
          </div>
          <audio controls preload="none" src={demo.a} className="mt-3 w-full h-10" />
        </div>
        <div className="rounded-xl border border-[rgba(0,212,255,0.25)] bg-[rgba(0,212,255,0.04)] p-4">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-2 font-['IBM_Plex_Mono'] text-[11px] uppercase tracking-[0.1em] text-[#00D4FF]">
              <Pause size={12} /> B — {plugin}: “{demo.preset}”
            </span>
          </div>
          <audio controls preload="none" src={demo.b} className="mt-3 w-full h-10" />
        </div>
      </div>

      {/* Disclosed preset */}
      <div className="mt-4 flex items-start gap-2 rounded-lg border border-[rgba(251,191,36,0.2)] bg-[rgba(251,191,36,0.04)] px-4 py-3">
        <Info size={14} className="mt-0.5 flex-shrink-0 text-[#FBBF24]" />
        <p className="font-['Inter'] text-[12px] text-[#94A3B8] leading-[1.7]">
          <span className="text-[#FBBF24] font-medium">Disclosed preset — {demo.preset}: </span>
          {demo.disclosure}
        </p>
      </div>
    </div>
  );
};

export default ABPlayer;
