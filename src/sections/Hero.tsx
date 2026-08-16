import { useEffect, useRef, useState } from 'react';
import { Play } from 'lucide-react';
import gsap from 'gsap';

const themes = [
  { bg: '#050505', particle: 0x222222, line: 0x00ffff },
  { bg: '#0a0505', particle: 0x331111, line: 0xff3333 },
  { bg: '#050a05', particle: 0x113311, line: 0x33ff33 },
  { bg: '#050510', particle: 0x111133, line: 0x3333ff },
  { bg: '#0a0a05', particle: 0x333311, line: 0xffff33 },
  { bg: '#0a050a', particle: 0x331133, line: 0xff33ff },
  { bg: '#050a0a', particle: 0x113333, line: 0x33ffff },
  { bg: '#0f0f0f', particle: 0x222222, line: 0xffffff },
  { bg: '#0a0805', particle: 0x332211, line: 0xff8833 },
  { bg: '#050508', particle: 0x221133, line: 0xaa66ff },
];

const Hero = () => {
  const labelRef = useRef<HTMLSpanElement>(null);
  const h1Ref = useRef<HTMLHeadingElement>(null);
  const subtitleRef = useRef<HTMLParagraphElement>(null);
  const ctaRef = useRef<HTMLDivElement>(null);
  const buttonsRef = useRef<HTMLDivElement>(null);
  const [activeMode, setActiveMode] = useState(0);

  useEffect(() => {
    const tl = gsap.timeline({ delay: 0.2 });

    tl.to(labelRef.current, {
      opacity: 1,
      y: 0,
      duration: 0.8,
      ease: 'power3.out',
    })
      .to(
        h1Ref.current,
        {
          opacity: 1,
          y: 0,
          duration: 1,
          ease: 'power3.out',
        },
        '-=0.4'
      )
      .to(
        subtitleRef.current,
        {
          opacity: 1,
          y: 0,
          duration: 0.8,
          ease: 'power3.out',
        },
        '-=0.4'
      )
      .to(
        ctaRef.current,
        {
          opacity: 1,
          y: 0,
          duration: 0.8,
          ease: 'power3.out',
        },
        '-=0.4'
      )
      .to(
        buttonsRef.current?.children || [],
        {
          opacity: 1,
          duration: 0.6,
          stagger: 0.05,
        },
        '-=0.2'
      );

    return () => {
      tl.kill();
    };
  }, []);

  const handleModeClick = (index: number) => {
    setActiveMode(index);
    if ((window as any).__applyColorMode) {
      (window as any).__applyColorMode(index);
    }
  };

  return (
    <section className="relative min-h-[100dvh] flex items-center z-[1]">
      {/* Hero Content */}
      <div className="px-[8vw] py-20 max-w-[700px]">
        <span
          ref={labelRef}
          className="inline-block font-['IBM_Plex_Mono'] text-[12px] uppercase tracking-[0.12em] text-[#00D4FF] opacity-0 translate-y-[20px]"
        >
          AUDIO PLUGINS
        </span>

        <h1
          ref={h1Ref}
          className="mt-4 font-['Space_Grotesk'] font-semibold text-white opacity-0 translate-y-[40px]"
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
          ref={subtitleRef}
          className="mt-6 font-['Inter'] text-[18px] leading-[1.6] text-[#94A3B8] max-w-[480px] opacity-0 translate-y-[30px]"
          style={{ textShadow: '0 2px 20px rgba(0,0,0,0.8)' }}
        >
          Professional-grade audio processing plugins for mixing, mastering, and
          sound design. Built for engineers who demand precision.
        </p>

        <div
          ref={ctaRef}
          className="mt-8 flex items-center gap-6 opacity-0 translate-y-[20px]"
        >
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

      {/* Color Mode Selector */}
      <div
        ref={buttonsRef}
        className="absolute bottom-10 right-10 z-10 flex gap-2 flex-wrap max-w-[200px] justify-end"
      >
        {themes.map((_, index) => (
          <button
            key={index}
            onClick={() => handleModeClick(index)}
            className={`w-8 h-8 rounded-md border font-['IBM_Plex_Mono'] text-[12px] transition-all duration-300 opacity-0 ${
              activeMode === index
                ? 'bg-[rgba(255,255,255,0.1)] text-white border-[#00D4FF]'
                : 'bg-transparent text-[#94A3B8] border-[rgba(255,255,255,0.15)] hover:bg-[rgba(255,255,255,0.06)]'
            }`}
          >
            {index + 1}
          </button>
        ))}
      </div>
    </section>
  );
};

export default Hero;
