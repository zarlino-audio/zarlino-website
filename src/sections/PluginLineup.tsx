import AddToCartButton from '../components/AddToCartButton';
import { PRODUCTS } from '../config/products';

const plugins = [PRODUCTS.ztame, PRODUCTS.zscorch].map((p) => ({
  id: p.id,
  name: p.name,
  category: p.category,
  description: p.description,
  price: p.priceGhs,
  image: p.image,
  badge: p.badge,
  priceLabel: p.priceLabelGhs,
  usdLabel: p.usdLabel,
}));

const PluginLineup = () => {
  return (
    <section
      id="plugins"
      className="relative z-[1] bg-[#050505] py-[140px] px-6 md:px-10"
    >
      <div className="max-w-[1200px] mx-auto">
        {/* Header */}
        <div className="section-header za-reveal">
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
          {plugins.map((plugin, i) => (
            <div
              key={plugin.id}
              className={`plugin-card za-reveal za-d${(i % 4) + 1} group bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.06)] rounded-2xl overflow-hidden hover:-translate-y-1.5 hover:shadow-[0_20px_60px_rgba(0,0,0,0.4)] hover:border-[rgba(255,255,255,0.1)] transition-all duration-[400ms] ease-out`}
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

                <div className="mt-5 flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-baseline gap-2">
                    <span className="font-['Space_Grotesk'] font-semibold text-[18px] text-white">
                      {plugin.priceLabel}
                    </span>
                    <span className="font-['Inter'] text-[12px] text-[#64748B]">
                      · {plugin.usdLabel}
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    <a
                      href={`/plugins/${plugin.id}`}
                      className="font-['Inter'] font-medium text-[14px] text-[#94A3B8] hover:text-white transition-colors duration-300"
                    >
                      Learn More
                    </a>
                    <AddToCartButton
                      item={{ id: plugin.id, name: plugin.name, price: plugin.price, image: plugin.image, category: plugin.category }}
                    />
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
