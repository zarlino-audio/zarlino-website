import { useEffect, useRef } from 'react';
import { Star } from 'lucide-react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

const testimonials = [
  {
    quote:
      "ZTame is a lifesaver for live recordings. It pulls out room resonances transparently without touching the natural tone. I run it on every track now.",
    name: 'Sarah Kim',
    role: 'Sound Designer',
    gradient: 'linear-gradient(135deg, #7C3AED, #FF6B35)',
  },
  {
    quote:
      "The per-peak notch filtering is surgical. ZTame knocked down a ringing snare resonance that nothing else could touch — and the dry/wet blend kept it transparent.",
    name: 'Marcus Chen',
    role: 'Producer & Mix Engineer',
    gradient: 'linear-gradient(135deg, #00D4FF, #7C3AED)',
  },
  {
    quote:
      "Selectivity gating is the killer feature. I can target exactly the resonances I want without dulling the track. It's become my secret weapon on drum buses.",
    name: 'David Okafor',
    role: 'Mastering Engineer',
    gradient: 'linear-gradient(135deg, #FF6B35, #00D4FF)',
  },
];

const Testimonials = () => {
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

      const cards = section.querySelectorAll('.testimonial-card');
      gsap.from(cards, {
        y: 40,
        opacity: 0,
        duration: 0.8,
        stagger: 0.15,
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
      id="testimonials"
      className="relative z-[1] bg-[#0A0A0A] py-[140px] px-6 md:px-10"
    >
      <div className="max-w-[1000px] mx-auto">
        {/* Header */}
        <div className="section-header text-center">
          <span className="font-['IBM_Plex_Mono'] text-[12px] uppercase tracking-[0.1em] text-[#00D4FF]">
            FROM THE COMMUNITY
          </span>
          <h2
            className="mt-3 font-['Space_Grotesk'] font-semibold text-white"
            style={{
              fontSize: 'clamp(36px, 4vw, 52px)',
              lineHeight: 1.15,
              letterSpacing: '-0.02em',
            }}
          >
            Hear the Difference
          </h2>
        </div>

        {/* Cards */}
        <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-6">
          {testimonials.map((t) => (
            <div
              key={t.name}
              className="testimonial-card bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.06)] rounded-xl p-10"
            >
              {/* Stars */}
              <div className="flex gap-1 mb-5">
                {[...Array(5)].map((_, i) => (
                  <Star
                    key={i}
                    size={16}
                    fill="#FFB800"
                    stroke="#FFB800"
                  />
                ))}
              </div>

              {/* Quote */}
              <p className="font-['Inter'] text-[16px] text-[#CBD5E1] leading-[1.7] italic">
                "{t.quote}"
              </p>

              {/* Author */}
              <div className="mt-6 flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-full flex-shrink-0"
                  style={{ background: t.gradient }}
                />
                <div>
                  <p className="font-['Inter'] font-semibold text-[14px] text-white">
                    {t.name}
                  </p>
                  <p className="font-['Inter'] text-[13px] text-[#64748B]">
                    {t.role}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Testimonials;
