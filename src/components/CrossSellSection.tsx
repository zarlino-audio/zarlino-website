import { PRODUCTS } from '../config/products';

interface CrossSellSectionProps {
  /** The product id currently being viewed — we cross-sell the other one. */
  current: string;
}

/**
 * "Complete Your Processing Toolkit" — introduces the complementary plugin
 * without aggressive selling. Shows how the two tools work together.
 */
const CrossSellSection = ({ current }: CrossSellSectionProps) => {
  const other = PRODUCTS[current === 'ztame' ? 'zscorch' : 'ztame'];
  const currentProduct = PRODUCTS[current];

  const pair = {
    ztame: {
      headline: 'Tame the problem, then add character.',
      body: 'Use ZTame to control harsh resonances, then ZScorch to add controlled warmth and energy.',
      cta: 'Explore ZScorch',
    },
    zscorch: {
      headline: 'Add character without losing control.',
      body: 'Use ZScorch for harmonic colour, then ZTame to keep any new resonances in check.',
      cta: 'Explore ZTame',
    },
  }[current];

  return (
    <section className="mt-16 pt-8 border-t border-[rgba(255,255,255,0.06)]">
      <h2 className="font-['Space_Grotesk'] font-semibold text-[24px] text-white mb-2">
        Complete Your Processing Toolkit
      </h2>
      <p className="font-['Inter'] text-[15px] text-[#94A3B8] leading-[1.7] max-w-[640px]">
        {pair.headline} {pair.body}
      </p>
      <a
        href={other.slug}
        className="group mt-5 inline-flex items-center gap-4 rounded-xl border border-[rgba(0,212,255,0.2)] bg-[rgba(0,212,255,0.04)] p-5 hover:bg-[rgba(0,212,255,0.07)] transition-colors duration-300"
      >
        <img
          src={other.image}
          alt={other.name}
          className="w-20 h-14 rounded-lg object-cover"
          width={160}
          height={112}
          loading="lazy"
        />
        <div>
          <p className="font-['Space_Grotesk'] font-semibold text-[17px] text-white">
            {other.name} <span className="text-[#64748B] font-normal">· {other.usdLabel}</span>
          </p>
          <p className="mt-0.5 font-['Inter'] text-[13px] text-[#94A3B8] leading-[1.6]">
            {other.tagline}
          </p>
          <span className="mt-1 inline-block font-['Inter'] font-medium text-[13px] text-[#00D4FF] group-hover:underline">
            {pair.cta} →
          </span>
        </div>
      </a>
      <p className="mt-3 font-['Inter'] text-[12px] text-[#475569]">
        {currentProduct.name} ({currentProduct.usdLabel}) + {other.name} ({other.usdLabel}) — two tools that complement each other.
      </p>
    </section>
  );
};

export default CrossSellSection;
