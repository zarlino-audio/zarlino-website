import ABPlayer from '../components/ABPlayer';
import { ZTAME_PRESETS } from '../config/demos';

/**
 * Homepage "Hear the Difference" — real A/B audio, up to 3 disclosed presets
 * (no hidden processing). Anchored from the hero CTA (#hear-the-difference).
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
            Real audio. Three presets.
            <br className="hidden md:block" /> No hidden processing.
          </h2>
          <p className="za-reveal mt-4 font-['Inter'] text-[16px] text-[#94A3B8] leading-[1.7] max-w-[620px] mx-auto">
            A/B through ZTame&rsquo;s flagship presets on real recordings — then
            hear ZScorch for controlled harmonic character.
          </p>
        </div>

        <div className="za-reveal">
          <ABPlayer plugin="ZTame" presets={ZTAME_PRESETS} />
        </div>

        <div className="za-reveal mt-6 text-center">
          <a
            href="/plugins/zscorch#hear-the-difference"
            className="inline-flex items-center gap-2 font-['Inter'] font-medium text-[15px] text-[#00D4FF] hover:text-white transition-colors duration-300"
          >
            Hear ZScorch too &rarr;
          </a>
        </div>
      </div>
    </section>
  );
};

export default HearTheDifference;
