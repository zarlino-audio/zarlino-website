// DAW compatibility strip — only hosts that genuinely run our Windows VST3.
// Logic Pro (AU) and Pro Tools (AAX) are intentionally omitted so the strip
// never implies support we do not ship.
import { SUPPORTED_DAWS } from '../config/products';

const TrustedBy = () => {
  return (
    <div className="relative z-[1] bg-[#050505] border-t border-b border-[rgba(255,255,255,0.06)] py-8">
      <div className="max-w-[1000px] mx-auto px-6">
        <p className="font-['IBM_Plex_Mono'] text-[11px] uppercase tracking-[0.1em] text-[#64748B] text-center mb-3">
          Currently available for Windows as VST3
        </p>
        <p className="font-['IBM_Plex_Mono'] text-[11px] uppercase tracking-[0.1em] text-[#334155] text-center mb-5">
          Compatible hosts
        </p>
        <div className="flex items-center justify-center gap-8 md:gap-12 flex-wrap">
          {SUPPORTED_DAWS.map((name) => (
            <div
              key={name}
              className="opacity-[0.4] hover:opacity-75 transition-opacity duration-300 cursor-default"
              style={{ filter: 'grayscale(100%)' }}
            >
              <span className="font-['Space_Grotesk'] font-semibold text-[14px] text-white tracking-wide whitespace-nowrap">
                {name}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default TrustedBy;
