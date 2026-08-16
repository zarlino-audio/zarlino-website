import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useCartStore } from '../store/cartStore';

gsap.registerPlugin(ScrollTrigger);

const plugins = [
  {
    id: 'ztame',
    name: 'ZTame',
    category: 'Resonance Suppressor',
    description:
      'High-resolution FFT-based automatic resonance suppressor with per-peak dynamic notch filtering, selectivity gating, split-band operation, and solo monitoring.',
    price: 109,
    image: '/images/plugin-card-4.jpg',
  },
];

const PluginLineup = () => {
  const sectionRef = useRef<HTMLDivElement>(null);
  const addItem = useCartStore((s) => s.addItem);

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

  const handleAddToCart = (plugin: (typeof plugins)[0]) => {
    addItem({
      id: plugin.id,
      name: plugin.name,
      price: plugin.price,
      image: plugin.image,
      category: plugin.category,
    });
  };

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
              {/* Image */}
              <div className="aspect-[16/10] overflow-hidden">
                <img
                  src={plugin.image}
                  alt={plugin.name}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  loading="lazy"
                />
              </div>

              {/* Content */}
              <div className="p-7">
                <h3 className="font-['Space_Grotesk'] font-semibold text-[20px] text-white">
                  {plugin.name}
                </h3>
                <p className="font-['IBM_Plex_Mono'] text-[11px] uppercase text-[#64748B] mt-1">
                  {plugin.category}
                </p>
                <p className="font-['Inter'] text-[14px] text-[#94A3B8] mt-3 line-clamp-2">
                  {plugin.description}
                </p>

                <div className="mt-5 flex items-center justify-between">
                  <span className="font-['Space_Grotesk'] font-semibold text-[18px] text-white">
                    ${plugin.price}
                  </span>
                  <div className="flex items-center gap-4">
                    <a
                      href={`/plugins/${plugin.id}`}
                      className="font-['Inter'] font-medium text-[14px] text-[#94A3B8] hover:text-white transition-colors duration-300"
                    >
                      Learn More
                    </a>
                    <button
                      onClick={() => handleAddToCart(plugin)}
                      className="font-['Inter'] font-medium text-[14px] text-[#00D4FF] hover:underline transition-all"
                    >
                      Add to Cart
                    </button>
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
