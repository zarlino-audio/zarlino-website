import { SUPPORTED_DAWS, FUTURE_PLATFORMS, WAITLIST } from '../config/products';
import EmailCapture from './EmailCapture';

interface CompatibilitySectionProps {
  platform: string;
  format: string;
  /** e.g. "Windows 10 22H2 or later (64-bit)" */
  osNote?: string;
  /** Renders the "future platforms" waitlist block (Mac / AU / AAX). */
  showFuture?: boolean;
}

/**
 * Honest compatibility block. Only shows what we actually ship (Windows VST3)
 * and the DAWs that genuinely run it. Future-platform waitlist renders only
 * when configured (see config/products.ts -> FUTURE_PLATFORMS/WAITLIST).
 */
const CompatibilitySection = ({ platform, format, osNote, showFuture = true }: CompatibilitySectionProps) => {
  return (
    <section className="mt-12">
      <h2 className="font-['Space_Grotesk'] font-semibold text-[28px] text-white mb-4">
        Compatibility
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Current platform */}
        <div className="rounded-xl border border-[rgba(0,212,255,0.18)] bg-[rgba(0,212,255,0.03)] p-6">
          <p className="font-['IBM_Plex_Mono'] text-[11px] uppercase tracking-[0.1em] text-[#00D4FF]">
            Currently available
          </p>
          <p className="mt-2 font-['Space_Grotesk'] font-semibold text-[20px] text-white">
            {platform} · {format}
          </p>
          {osNote && <p className="mt-1 font-['Inter'] text-[13px] text-[#64748B]">{osNote}</p>}
          <p className="mt-4 font-['IBM_Plex_Mono'] text-[11px] uppercase tracking-[0.1em] text-[#64748B]">
            Compatible hosts
          </p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {SUPPORTED_DAWS.map((daw) => (
              <li
                key={daw}
                className="rounded-md border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.03)] px-3 py-1 font-['Inter'] text-[13px] text-[#94A3B8]"
              >
                {daw}
              </li>
            ))}
          </ul>
        </div>

        {/* Future platforms */}
        {showFuture && (
          <div className="rounded-xl border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.02)] p-6">
            <p className="font-['IBM_Plex_Mono'] text-[11px] uppercase tracking-[0.1em] text-[#64748B]">
              Future platforms
            </p>
            <p className="mt-2 font-['Inter'] text-[14px] text-[#94A3B8] leading-[1.7]">
              {FUTURE_PLATFORMS.note}
            </p>
            {WAITLIST.enabled && (
              <div className="mt-4">
                <EmailCapture
                  topic="Future platforms"
                  cta="Be notified when Mac / AU / AAX is available."
                  success={WAITLIST.success}
                  compact
                />
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
};

export default CompatibilitySection;
