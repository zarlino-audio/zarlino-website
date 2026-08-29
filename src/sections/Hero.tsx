import { Play } from 'lucide-react';

/**
 * Homepage hero. Entrance animation is pure CSS (`.za-reveal` + stagger
 * classes in index.css) — no GSAP, no JS timeline, no flash of hidden content.
 */
const Hero = () => {
  return (
    <section className="relative min-h-[100dvh] flex items-center z-[1]">
      {/* Hero Content */}
      <div className="px-[8vw] py-20 max-w-[700px]">
        <span className="za-reveal za-d1 inline-block font-['IBM_Plex_Mono'] text-[12px] uppercase tracking-[0.12em] text-[#00D4FF]">
          AUDIO PLUGINS
        </span>

        <h1
          className="za-reveal za-d2 mt-4 font-['Space_Grotesk'] font-semibold text-white"
          style={{
            fontSize: 'clamp(52px, 7vw, 84px)',
            lineHeight: 1.05,
            letterSpacing: '-0.03em',
            textShadow: '0 2px 30px rgba(0,0,0,0.9)',
          }}
        >
          Shape Sound
          <br />
          Without Limits
        </h1>

        <p
          className="za-reveal za-d3 mt-6 font-['Inter'] text-[18px] leading-[1.6] text-[#94A3B8] max-w-[480px]"
          style={{ textShadow: '0 2px 20px rgba(0,0,0,0.8)' }}
        >
          Professional-grade audio processing plugins for mixing, mastering, and
          sound design. Built for engineers who demand precision.
        </p>

        <div className="za-reveal za-d4 mt-8 flex items-center gap-6 flex-wrap">
          <a
            href="#plugins"
            className="inline-flex items-center bg-white text-[#050505] rounded-lg px-8 py-[14px] font-['Inter'] font-medium text-[16px] hover:bg-[#00D4FF] transition-all duration-300"
          >
            Explore Plugins
          </a>

          <a
            href="#showcase"
            className="inline-flex items-center gap-2 font-['Inter'] text-[16px] text-[#94A3B8] hover:text-white transition-colors duration-300 group"
          >
            <span className="flex items-center justify-center w-9 h-9 rounded-full border border-[rgba(255,255,255,0.2)] group-hover:border-white transition-colors">
              <Play size={14} fill="currentColor" />
            </span>
            Watch Demo
          </a>
        </div>
      </div>
    </section>
  );
};

export default Hero;
