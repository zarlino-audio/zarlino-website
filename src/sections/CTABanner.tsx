import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

const CTABanner = () => {
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const ctx = gsap.context(() => {
      const h2 = section.querySelector('h2');
      const els = section.querySelectorAll('.animate-in');

      if (h2) {
        gsap.from(h2, {
          scale: 0.95,
          opacity: 0,
          duration: 0.8,
          ease: 'power3.out',
          scrollTrigger: {
            trigger: section,
            start: 'top 80%',
            toggleActions: 'play none none none',
          },
        });
      }

      gsap.from(els, {
        y: 20,
        opacity: 0,
        duration: 0.8,
        stagger: 0.15,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: section,
          start: 'top 80%',
          toggleActions: 'play none none none',
        },
      });
    }, section);

    return () => ctx.revert();
  }, []);

  return (
    <section
      ref={sectionRef}
      id="cta"
      className="relative z-[1] py-[100px] px-6 md:px-10 overflow-hidden"
      style={{
        background:
          'radial-gradient(ellipse at center, rgba(0,212,255,0.04) 0%, transparent 70%)',
      }}
    >
      {/* Video Background */}
      <video
        autoPlay
        muted
        loop
        playsInline
        className="absolute inset-0 w-full h-full object-cover opacity-[0.15] mix-blend-screen pointer-events-none"
      >
        <source src="/videos/hero-demo.mp4" type="video/mp4" />
      </video>

      <div className="relative max-w-[800px] mx-auto text-center">
        <h2
          className="font-['Space_Grotesk'] font-semibold text-white"
          style={{
            fontSize: 'clamp(36px, 5vw, 64px)',
            lineHeight: 1.15,
            letterSpacing: '-0.02em',
          }}
        >
          Explore the Sound
        </h2>

        <p className="animate-in mt-4 font-['Inter'] text-[18px] text-[#94A3B8]">
          Discover the Zarlino plugin collection and elevate your productions.
        </p>

        <a
          href="#plugins"
          onClick={(e) => {
            e.preventDefault();
            const el = document.querySelector('#plugins');
            if (el) el.scrollIntoView({ behavior: 'smooth' });
          }}
          className="animate-in inline-block mt-8 bg-[#00D4FF] text-[#050505] rounded-[10px] px-10 py-4 font-['Inter'] font-medium text-[17px] hover:bg-[#33DDFF] hover:shadow-[0_0_40px_rgba(0,212,255,0.2)] transition-all duration-300"
        >
          Explore the Collection
        </a>
      </div>
    </section>
  );
};

export default CTABanner;
