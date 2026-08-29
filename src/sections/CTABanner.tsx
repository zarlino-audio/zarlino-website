/**
 * CTA banner — pure CSS background (the previous autoplaying 4.9 MB
 * hero-demo.mp4 was removed; it cost a full extra download on the homepage
 * for a 15%-opacity backdrop).
 */
const CTABanner = () => {
  return (
    <section
      id="cta"
      className="relative z-[1] py-[100px] px-6 md:px-10 overflow-hidden"
      style={{
        background:
          'radial-gradient(ellipse at center, rgba(0,212,255,0.06) 0%, transparent 70%)',
      }}
    >
      <div className="relative max-w-[800px] mx-auto text-center">
        <h2
          className="za-reveal font-['Space_Grotesk'] font-semibold text-white"
          style={{
            fontSize: 'clamp(36px, 5vw, 64px)',
            lineHeight: 1.15,
            letterSpacing: '-0.02em',
          }}
        >
          Explore the Sound
        </h2>

        <p className="za-reveal za-d1 mt-4 font-['Inter'] text-[18px] text-[#94A3B8]">
          Discover the Zarlino plugin collection and elevate your productions.
        </p>

        <a
          href="#plugins"
          className="za-reveal za-d2 inline-block mt-8 bg-[#00D4FF] text-[#050505] rounded-[10px] px-10 py-4 font-['Inter'] font-medium text-[17px] hover:bg-[#33DDFF] hover:shadow-[0_0_40px_rgba(0,212,255,0.2)] transition-all duration-300"
        >
          Explore the Collection
        </a>
      </div>
    </section>
  );
};

export default CTABanner;
