import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Info, Loader2, Pause, Play, Volume2 } from 'lucide-react';

/**
 * Release-driven A/B comparison player.
 *
 * Every clip is served from the VERIFIED release (R2, via the website Worker):
 * A = the untouched source, B = ZTame's own processing of that same source,
 * both encoded from the release's level-matched masters (loudness is matched so
 * you hear processing, not volume). One <audio> element drives both sides —
 * switching A/B keeps your exact position and play state, so the comparison is
 * synchronized by construction. No audio path or preset is hardcoded here; the
 * list comes from /api/release/ztame (publish pointer + manifest).
 */

type Side = 'A' | 'B';

const RELEASE_API = '/api/release/ztame';
const RELEASE_BASE = '/releases/ztame/latest';

interface WebFile {
  file?: string;
  bytes?: number;
  kbps?: number;
}
interface ReleaseExample {
  id: string;
  title: string;
  kind: string;
  reference?: { origin?: string };
  render?: { measurements?: { durationSec?: number; loudnessMatch?: { matchedDeltaLu?: number } } };
  web?: { dryMp3?: WebFile; wetMp3?: WebFile };
}
interface ReleaseInfo {
  version?: string;
  commit?: string;
  audioExamples?: ReleaseExample[];
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

function clock(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const ABPlayer = ({ plugin }: { plugin: string }) => {
  const [examples, setExamples] = useState<ReleaseExample[] | null>(null);
  const [release, setRelease] = useState<{ version?: string; commit?: string }>({});
  const [loadError, setLoadError] = useState(false);
  const [active, setActive] = useState(0);
  const [side, setSide] = useState<Side>('A');
  const [playing, setPlaying] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(0);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const resumeRef = useRef<{ time: number; play: boolean } | null>(null);
  const beaconRef = useRef(false);

  // The release is the ONLY source of demo content. If it cannot be loaded we
  // say so — we never fall back to a stale, manually managed audio file.
  useEffect(() => {
    const ac = new AbortController();
    fetch(RELEASE_API, { signal: ac.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status))))
      .then((data: ReleaseInfo) => {
        const list = (data.audioExamples ?? []).filter((e) => e.web?.dryMp3?.file && e.web?.wetMp3?.file);
        if (!list.length) {
          setLoadError(true);
          return;
        }
        setRelease({ version: data.version, commit: data.commit });
        setExamples(list);
      })
      .catch(() => {
        if (!ac.signal.aborted) setLoadError(true);
      });
    return () => ac.abort();
  }, []);

  const ex = examples?.[active] ?? null;
  const file = side === 'A' ? ex?.web?.dryMp3?.file : ex?.web?.wetMp3?.file;
  const src = file ? `${RELEASE_BASE}/audio/web/${file}` : null;

  // Swap the single element's source, then restore position + play state on
  // `loadedmetadata` — the listener is registered before the swap so the load
  // can never race past it.
  useEffect(() => {
    const el = audioRef.current;
    if (!el || !src) return;
    const st = resumeRef.current ?? { time: 0, play: false };
    resumeRef.current = null;
    el.src = src;
    el.load();
    const onMeta = () => {
      try {
        el.currentTime = st.time > 0 ? st.time : 0;
      } catch { /* ignore */ }
      if (st.play) void el.play().catch(() => undefined);
    };
    el.addEventListener('loadedmetadata', onMeta, { once: true });
    return () => el.removeEventListener('loadedmetadata', onMeta);
  }, [src]);

  const toggle = () => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) {
      if (!beaconRef.current) {
        beaconRef.current = true;
        trackDemo();
      }
      void el.play().catch(() => undefined);
    } else {
      el.pause();
    }
  };

  const swap = (next: Side) => {
    if (next === side) return;
    const el = audioRef.current;
    resumeRef.current = el ? { time: el.currentTime || 0, play: !el.paused } : null;
    setSide(next);
  };

  const seek = (v: number) => {
    const el = audioRef.current;
    if (!el) return;
    el.currentTime = v;
    setPos(v);
  };

  const choose = (i: number) => {
    if (i === active) return;
    const el = audioRef.current;
    resumeRef.current = el ? { time: 0, play: !el.paused } : null;
    setActive(i);
  };

  if (loadError) {
    return (
      <div className="rounded-2xl border border-[rgba(251,191,36,0.25)] bg-[rgba(251,191,36,0.04)] p-6 md:p-8 text-center">
        <AlertTriangle size={18} className="mx-auto text-[#FBBF24]" />
        <h3 className="mt-3 font-['Space_Grotesk'] font-semibold text-white text-[18px]">
          Demo audio is temporarily unavailable
        </h3>
        <p className="mt-2 font-['Inter'] text-[13px] text-[#94A3B8] leading-[1.7] max-w-[520px] mx-auto">
          The verified release could not be loaded. Every demo clip on this page is served from that
          release — rather than play a stale file, we would rather tell you. Please try again shortly,
          or grab the 14-day trial and hear {plugin} in your own session.
        </p>
      </div>
    );
  }

  if (!examples) {
    return (
      <div className="rounded-2xl border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] p-6 md:p-8">
        <div className="flex items-center gap-3 text-[#64748B]">
          <Loader2 size={16} className="animate-spin" />
          <p className="font-['Inter'] text-[13px]">Loading verified release audio…</p>
        </div>
      </div>
    );
  }

  const match = ex?.render?.measurements?.loudnessMatch?.matchedDeltaLu;

  return (
    <div className="rounded-2xl border border-[rgba(0,212,255,0.2)] bg-[rgba(0,212,255,0.03)] p-6 md:p-8">
      <audio
        ref={audioRef}
        preload="auto"
        className="hidden"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={(e) => {
          setPlaying(false);
          e.currentTarget.currentTime = 0;
          setPos(0);
        }}
        onTimeUpdate={(e) => setPos(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDur(e.currentTarget.duration || 0)}
        onWaiting={() => setBuffering(true)}
        onPlaying={() => setBuffering(false)}
        onCanPlay={() => setBuffering(false)}
        onError={() => setBuffering(false)}
      />

      <div className="flex items-center gap-3">
        <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-[rgba(0,212,255,0.12)]">
          <Volume2 size={18} className="text-[#00D4FF]" />
        </span>
        <div>
          <h3 className="font-['Space_Grotesk'] font-semibold text-white text-[18px]">
            Hear {plugin} — A/B
          </h3>
          <p className="font-['Inter'] text-[13px] text-[#64748B]">
            Real audio from the verified {release.version} release. A/B keeps your exact position.
          </p>
        </div>
      </div>

      {/* Example selector — release material, nothing hardcoded */}
      <div className="mt-5">
        <p className="font-['Inter'] text-[11px] uppercase tracking-[0.12em] text-[#64748B] mb-2">
          Choose a passage to audition
        </p>
        <div className="flex flex-wrap gap-2">
          {examples.map((p, i) => (
            <button
              key={p.id}
              type="button"
              onClick={() => choose(i)}
              aria-pressed={i === active}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 font-['Inter'] text-[12px] transition-colors ${
                i === active
                  ? 'border-[rgba(0,212,255,0.6)] bg-[rgba(0,212,255,0.1)] text-[#00D4FF]'
                  : 'border-[rgba(255,255,255,0.12)] text-[#94A3B8] hover:text-white'
              }`}
            >
              {p.kind === 'oneshot' ? '▸' : '⟳'} {p.title}
            </button>
          ))}
        </div>
        {ex?.reference?.origin && (
          <p className="font-['Inter'] text-[11px] text-[#475569] mt-1.5">Source: {ex.reference.origin}</p>
        )}
      </div>

      {/* Transport — one element, two sides */}
      <div className="mt-5 rounded-xl border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] p-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={toggle}
            aria-label={playing ? 'Pause' : 'Play'}
            className="inline-flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-[#00D4FF] text-black hover:opacity-90 transition-opacity"
          >
            {playing ? <Pause size={18} /> : <Play size={18} />}
          </button>
          <div className="flex-1">
            <input
              type="range"
              min={0}
              max={Math.max(dur, 0.001)}
              step={0.01}
              value={Math.min(pos, dur)}
              onChange={(e) => seek(Number(e.target.value))}
              aria-label="Seek within the clip"
              className="w-full accent-[#00D4FF]"
            />
            <div className="mt-1 flex justify-between font-['IBM_Plex_Mono'] text-[11px] text-[#64748B]">
              <span>{clock(pos)}</span>
              <span>{clock(dur)}</span>
            </div>
          </div>
          {buffering && <Loader2 size={16} className="animate-spin text-[#64748B]" />}
        </div>

        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => swap('A')}
            aria-pressed={side === 'A'}
            className={`rounded-lg border px-4 py-3 text-left transition-colors ${
              side === 'A'
                ? 'border-[rgba(0,212,255,0.6)] bg-[rgba(0,212,255,0.08)]'
                : 'border-[rgba(255,255,255,0.1)] hover:border-[rgba(255,255,255,0.2)]'
            }`}
          >
            <span className="font-['IBM_Plex_Mono'] text-[11px] uppercase tracking-[0.1em] text-[#94A3B8]">
              A — Original
            </span>
            <span className="mt-1 block font-['Inter'] text-[12px] text-[#64748B]">untouched source</span>
          </button>
          <button
            type="button"
            onClick={() => swap('B')}
            aria-pressed={side === 'B'}
            className={`rounded-lg border px-4 py-3 text-left transition-colors ${
              side === 'B'
                ? 'border-[rgba(0,212,255,0.6)] bg-[rgba(0,212,255,0.08)]'
                : 'border-[rgba(255,255,255,0.1)] hover:border-[rgba(255,255,255,0.2)]'
            }`}
          >
            <span className="font-['IBM_Plex_Mono'] text-[11px] uppercase tracking-[0.1em] text-[#00D4FF]">
              B — {plugin}
            </span>
            <span className="mt-1 block font-['Inter'] text-[12px] text-[#64748B]">
              ZTame output, same passage
            </span>
          </button>
        </div>

        <p className="mt-2 font-['Inter'] text-[11px] text-[#475569]">
          Switching sides keeps your exact position in the clip — no restart, no seek drift. Both sides are
          level-matched, so you hear processing, not volume.
        </p>
      </div>

      {/* Disclosure — everything that was done to the audio */}
      <div className="mt-4 flex items-start gap-2 rounded-lg border border-[rgba(251,191,36,0.2)] bg-[rgba(251,191,36,0.04)] px-4 py-3">
        <Info size={14} className="mt-0.5 flex-shrink-0 text-[#FBBF24]" />
        <p className="font-['Inter'] text-[12px] text-[#94A3B8] leading-[1.7]">
          <span className="text-[#FBBF24] font-medium">Disclosed comparison — {ex?.title}: </span>
          both files come from the same render of the same source in release {release.version}
          {release.commit ? ` (${release.commit.slice(0, 8)})` : ''}. The untouched source and ZTame&rsquo;s output
          are presented at the same loudness (level match Δ {typeof match === 'number' ? Math.abs(match).toFixed(1) : '0.0'} LU),
          so no volume jump can flatter the plugin. Nothing else was applied.
        </p>
      </div>
    </div>
  );
};

export default ABPlayer;
