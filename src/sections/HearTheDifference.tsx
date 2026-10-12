import ABPlayer from '../components/ABPlayer';

/**
 * Homepage "Hear the Difference" — real A/B audio streamed from the verified
 * release (nothing hardcoded, nothing hidden). Anchored from the hero CTA
 * (#hear-the-difference).
 */
const HearTheDifference = () => {
  return (
    <section
      id="hear-the-difference"
      className="relative z-[1] bg-[#050505] py-[120px] px-6 md:px-10"
    >
      <div className="max-w-[900px] mx-auto">
        <div className="text-center mb-10">
          <span className="za-reveal font-['IBM_Plex_Mono'] text-[12px] uppercase tracking-[0.1em] text-[#00D4FF]">
            HEAR THE DIFFERENCE
          </span>
          <h2
            className="za-reveal mt-3 font-['Space_Grotesk'] font-semibold text-white"
            style={{
              fontSize: 'clamp(32px, 4vw, 48px)',
              lineHeight: 1.15,
              letterSpacing: '-0.02em',
            }}
          >
            Real audio from the verified release.
            <br className="hidden md:block" /> No hidden processing.
          </h2>
          <p className="za-reveal mt-4 font-['Inter'] text-[16px] text-[#94A3B8] leading-[1.7] max-w-[620px] mx-auto">
            Five loops and four one-shots, A/B&rsquo;d through ZTame. The untouched source and
            ZTame&rsquo;s own output are level-matched, so you hear processing — not volume.
          </p>
        </div>

        <div className="za-reveal">
          <ABPlayer plugin="ZTame" />
        </div>

        <div className="za-reveal mt-6 text-center">
          <a
            href="/plugins/zscorch/"
            className="inline-flex items-center gap-2 font-['Inter'] font-medium text-[15px] text-[#00D4FF] hover:text-white transition-colors duration-300"
          >
            Explore ZScorch &rarr;
          </a>
        </div>
      </div>
    </section>
  );
};

export default HearTheDifference;
