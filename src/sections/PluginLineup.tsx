import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

const plugins: {
  id: string;
  name: string;
  category: string;
  description: string;
  price: number;
  image: string;
  badge: string;
  priceLabel: string;
}[] = [
  {
    id: 'ztame',
    name: 'ZTame',
    category: 'Resonance Suppressor',
    description:
      'High-resolution FFT-based automatic resonance suppressor with per-peak dynamic notch filtering, selectivity gating, split-band operation, and solo monitoring.',
    price: 750,
    image: '/images/ztame-ui.png',
    badge: 'Public Beta',
    priceLabel: '₵750',
  },
  {
    id: 'zscorch',
    name: 'ZScorch',
    category: 'Harmonic Processor',
    description:
      'Adaptive harmonic processor with multiband saturation across six topologies — Tube, Tape, Germanium, Transistor, Diode, and Wavefold — driven by Lift, Character, and Mix macros.',
    price: 1200,
    image: '/images/zscorch-ui.jpg',
    badge: 'Public Beta',
    priceLabel: '₵1,200',
  },
];

const PluginLineup = () => {
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const ctx = gsap.context(() => {
      const header = section.querySelectorAll('.section-header');
      gsap.from(header, {
        y: 30,
        opacity: 0,
        duration: 0.8,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: section,
          start: 'top 75%',
          toggleActions: 'play none none none',
        },
      });

      const cards = section.querySelectorAll('.plugin-card');
      gsap.from(cards, {
        y: 60,
        opacity: 0,
        duration: 0.9,
        stagger: 0.12,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: section,
          start: 'top 75%',
          toggleActions: 'play none none none',
        },
      });
    }, section);

    return () => ctx.revert();
  }, []);

  return (
    <section
      ref={sectionRef}
      id="plugins"
      className="relative z-[1] bg-[#050505] py-[140px] px-6 md:px-10"
    >
      <div className="max-w-[1200px] mx-auto">
        {/* Header */}
        <div className="section-header">
          <span className="font-['IBM_Plex_Mono'] text-[12px] uppercase tracking-[0.1em] text-[#00D4FF]">
            THE COLLECTION
          </span>
          <h2
            className="mt-3 font-['Space_Grotesk'] font-semibold text-white"
            style={{
              fontSize: 'clamp(36px, 4vw, 52px)',
              lineHeight: 1.15,
              letterSpacing: '-0.02em',
            }}
          >
            Complete Toolkit
          </h2>
        </div>

        {/* Grid */}
        <div className="mt-16 grid grid-cols-1 md:grid-cols-2 gap-6">
          {plugins.map((plugin) => (
            <div
              key={plugin.id}
              className="plugin-card group bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.06)] rounded-2xl overflow-hidden hover:-translate-y-1.5 hover:shadow-[0_20px_60px_rgba(0,0,0,0.4)] hover:border-[rgba(255,255,255,0.1)] transition-all duration-[400ms] ease-out"
            >
              {/* Image (or branded placeholder when no screenshot exists) */}
              <div className="aspect-[16/10] overflow-hidden relative">
                {plugin.image ? (
                  <img
                    src={plugin.image}
                    alt={plugin.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[rgba(0,212,255,0.14)] via-[rgba(0,212,255,0.05)] to-transparent">
                    <span className="font-['Space_Grotesk'] font-semibold text-[34px] tracking-tight text-white/25">
                      {plugin.name}
                    </span>
                  </div>
                )}
              </div>

              {/* Content */}
              <div className="p-7">
              <div className="flex items-center gap-2">
                <h3 className="font-['Space_Grotesk'] font-semibold text-[20px] text-white">
                  {plugin.name}
                </h3>
                <span className="font-['IBM_Plex_Mono'] text-[10px] uppercase tracking-[0.1em] text-[#FBBF24] border border-[rgba(251,191,36,0.35)] rounded-full px-2 py-0.5">
                  {plugin.badge}
                </span>
              </div>
                <p className="font-['IBM_Plex_Mono'] text-[11px] uppercase text-[#64748B] mt-1">
                  {plugin.category}
                </p>
                <p className="font-['Inter'] text-[14px] text-[#94A3B8] mt-3 line-clamp-2">
                  {plugin.description}
                </p>

                <div className="mt-5 flex items-center justify-between">
                  <span className="font-['Space_Grotesk'] font-semibold text-[18px] text-white">
                    {plugin.priceLabel}
                  </span>
                  <div className="flex items-center gap-4">
                    <a
                      href={`/plugins/${plugin.id}`}
                      className="font-['Inter'] font-medium text-[14px] text-[#94A3B8] hover:text-white transition-colors duration-300"
                    >
                      Learn More
                    </a>
                    <a
                      href={`/plugins/${plugin.id}#download`}
                      className="font-['Inter'] font-medium text-[14px] text-[#00D4FF] hover:underline transition-all"
                    >
                      {plugin.id === 'ztame' ? 'Get Free License' : 'Download Trial'}
                    </a>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default PluginLineup;
