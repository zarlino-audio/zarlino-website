import { Check } from 'lucide-react';
import { PRODUCTS } from '../config/products';

const ProductShowcase = () => {
  const product = PRODUCTS.ztame;
  const features = [
    'High-resolution FFT-based automatic peak detection',
    'Per-peak dynamic notch filtering — only active resonances are reduced',
    'Selectivity gating, split-band operation, and solo monitoring',
  ];

  return (
    <section
      id="showcase"
      className="relative z-[1] bg-[#050505] py-[140px] px-6 md:px-10"
    >
      <div className="max-w-[1200px] mx-auto grid grid-cols-1 md:grid-cols-[60%_40%] gap-12 items-center">
        {/* Left: Product Image */}
        <div
          className="za-reveal relative rounded-xl overflow-hidden"
          style={{
            transform: 'perspective(1000px) rotateY(-5deg)',
            boxShadow: '0 40px 80px rgba(0,0,0,0.5)',
          }}
        >
          <img
            src={product.image}
            alt={`${product.name} Resonance Suppressor Plugin`}
            className="w-full h-auto object-cover"
            width={1440}
            height={900}
            loading="lazy"
          />
        </div>

        {/* Right: Content */}
        <div className="flex flex-col">
          <span className="za-reveal za-d1 font-['IBM_Plex_Mono'] text-[12px] uppercase tracking-[0.1em] text-[#00D4FF]">
            {product.heroKicker}
          </span>

          <h2
            className="za-reveal za-d2 mt-3 font-['Space_Grotesk'] font-semibold text-white"
            style={{
              fontSize: 'clamp(36px, 4vw, 52px)',
              lineHeight: 1.15,
              letterSpacing: '-0.02em',
            }}
          >
            <span className="inline-flex items-center gap-3">
              {product.name}
              <span className="align-middle font-['IBM_Plex_Mono'] text-[12px] uppercase tracking-[0.1em] text-[#00D4FF] border border-[rgba(0,212,255,0.35)] rounded-full px-2.5 py-1">
                {product.badge}
              </span>
            </span>
          </h2>

          <p className="za-reveal za-d3 mt-4 font-['Inter'] text-[16px] text-[#94A3B8] leading-[1.7]">
            {product.outcome}
          </p>

          <ul className="za-reveal za-d4 mt-6 flex flex-col gap-3">
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

          <div className="za-reveal za-d5 mt-8 flex items-baseline gap-4">
            <span className="font-['Space_Grotesk'] font-semibold text-[32px] text-white">
              {product.priceLabelGhs}
            </span>
            <span className="font-['Space_Grotesk'] text-[18px] text-[#64748B]">
              {product.usdLabel} · {product.platform} {product.format}
            </span>
          </div>

          <a
            href={product.buyUrl}
            className="za-reveal za-d6 mt-6 self-start inline-flex items-center bg-[#00D4FF] text-[#050505] rounded-lg px-7 py-[14px] font-['Inter'] font-medium text-[15px] hover:bg-[#33DDFF] transition-colors duration-300"
          >
            Buy {product.name}
          </a>
        </div>
      </div>
    </section>
  );
};

export default ProductShowcase;
