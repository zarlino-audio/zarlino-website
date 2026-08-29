// DAW compatibility strip — static, no animation JS required.
const logos = [
  { name: 'Ableton', width: 100 },
  { name: 'Logic Pro', width: 90 },
  { name: 'FL Studio', width: 85 },
  { name: 'Cubase', width: 80 },
  { name: 'Pro Tools', width: 90 },
  { name: 'Reason', width: 75 },
];

const TrustedBy = () => {
  return (
    <div className="relative z-[1] bg-[#050505] border-t border-b border-[rgba(255,255,255,0.06)] py-8">
      <div className="max-w-[1000px] mx-auto px-6">
        <p className="font-['IBM_Plex_Mono'] text-[11px] uppercase tracking-[0.1em] text-[#64748B] text-center mb-5">
          Compatible with
        </p>
        <div className="flex items-center justify-center gap-8 md:gap-12 flex-wrap">
          {logos.map((logo) => (
            <div
              key={logo.name}
              className="logo-item opacity-[0.35] hover:opacity-70 transition-opacity duration-300 cursor-default"
              style={{ filter: 'grayscale(100%)' }}
            >
              <span
                className="font-['Space_Grotesk'] font-semibold text-[14px] text-white tracking-wide whitespace-nowrap"
                style={{ width: logo.width }}
              >
                {logo.name}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default TrustedBy;
