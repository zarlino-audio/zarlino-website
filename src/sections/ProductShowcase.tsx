import { useEffect, useRef } from 'react';
import { Check } from 'lucide-react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useCartStore } from '../store/cartStore';

gsap.registerPlugin(ScrollTrigger);

const ProductShowcase = () => {
  const sectionRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const addItem = useCartStore((s) => s.addItem);

  useEffect(() => {
    const section = sectionRef.current;
    const image = imageRef.current;
    const content = contentRef.current;
    if (!section || !image || !content) return;

    const ctx = gsap.context(() => {
      gsap.from(image, {
        x: -60,
        opacity: 0,
        duration: 1,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: section,
          start: 'top 75%',
          toggleActions: 'play none none none',
        },
      });

      const contentEls = content.querySelectorAll('.animate-in');
      gsap.from(contentEls, {
        y: 40,
        opacity: 0,
        duration: 0.8,
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

  const handleBuy = () => {
    addItem({
      id: 'ztame',
      name: 'ZTame',
      price: 109,
      originalPrice: 129,
      image: '/images/plugin-card-4.jpg',
      category: 'Resonance Suppressor',
    });
  };

  const features = [
    'High-resolution FFT-based automatic peak detection',
    'Per-peak dynamic notch filtering — only active resonances are reduced',
    'Selectivity gating, split-band operation, and solo monitoring',
  ];

  return (
    <section
      ref={sectionRef}
      id="showcase"
      className="relative z-[1] bg-[#050505] py-[140px] px-6 md:px-10"
    >
      <div className="max-w-[1200px] mx-auto grid grid-cols-1 md:grid-cols-[60%_40%] gap-12 items-center">
        {/* Left: Product Image */}
        <div
          ref={imageRef}
          className="relative rounded-xl overflow-hidden"
          style={{
            transform: 'perspective(1000px) rotateY(-5deg)',
            boxShadow: '0 40px 80px rgba(0,0,0,0.5)',
          }}
        >
          <img
            src="/images/plugin-card-4.jpg"
            alt="ZTame Resonance Suppressor Plugin"
            className="w-full h-auto object-cover"
            loading="lazy"
          />
        </div>

        {/* Right: Content */}
        <div ref={contentRef} className="flex flex-col">
          <span className="animate-in font-['IBM_Plex_Mono'] text-[12px] uppercase tracking-[0.1em] text-[#00D4FF]">
            FLAGSHIP PROCESSOR
          </span>

          <h2
            className="animate-in mt-3 font-['Space_Grotesk'] font-semibold text-white"
            style={{
              fontSize: 'clamp(36px, 4vw, 52px)',
              lineHeight: 1.15,
              letterSpacing: '-0.02em',
            }}
          >
            ZTame
          </h2>

          <p className="animate-in mt-4 font-['Inter'] text-[16px] text-[#94A3B8] leading-[1.7]">
            A high-resolution FFT-based automatic resonance suppressor. Detect
            narrow, persistent spectral peaks and apply surgical dynamic
            reduction — with selectivity gating, split-band operation, and
            latency-aligned Dry/Wet control.
          </p>

          <ul className="animate-in mt-6 flex flex-col gap-3">
            {features.map((feature) => (
              <li key={feature} className="flex items-start gap-3">
                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-[rgba(0,212,255,0.15)] mt-0.5 flex-shrink-0">
                  <Check size={12} className="text-[#00D4FF]" />
                </span>
                <span className="font-['Inter'] text-[15px] text-[#CBD5E1]">
                  {feature}
                </span>
              </li>
            ))}
          </ul>

          <div className="animate-in mt-8 flex items-center gap-4">
            <span className="font-['Space_Grotesk'] font-semibold text-[32px] text-white">
              $109
            </span>
            <span className="font-['Space_Grotesk'] text-[18px] text-[#64748B] line-through">
              $129
            </span>
          </div>

          <button
            onClick={handleBuy}
            className="animate-in mt-6 self-start bg-[#00D4FF] text-[#050505] rounded-lg px-7 py-[14px] font-['Inter'] font-medium text-[15px] hover:bg-[#33DDFF] transition-colors duration-300"
          >
            Buy Now
          </button>
        </div>
      </div>
    </section>
  );
};

export default ProductShowcase;
