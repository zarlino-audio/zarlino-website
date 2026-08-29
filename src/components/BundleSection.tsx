import { PRODUCTS, BUNDLE } from '../config/products';
import AddToCartButton from './AddToCartButton';

/**
 * Bundle offer — infrastructure only. Renders nothing until BUNDLE.enabled is
 * true (i.e. the business owner has confirmed pricing and the Worker licensing
 * flow supports a bundle). The "Add both to cart" path uses each plugin's
 * server-authoritative price, so nothing ships with unconfirmed pricing.
 */
const BundleSection = () => {
  if (!BUNDLE.enabled) return null;

  const items = BUNDLE.includes
    .map((id) => PRODUCTS[id])
    .filter(Boolean);

  if (items.length < 2) return null;

  const savingsLabel =
    BUNDLE.savingsUsd > 0 ? `Save $${BUNDLE.savingsUsd}` : '';

  return (
    <section className="mt-16">
      <div className="rounded-2xl border border-[rgba(0,212,255,0.25)] bg-gradient-to-br from-[rgba(0,212,255,0.08)] to-transparent p-6 md:p-8">
        <div className="flex flex-col md:flex-row md:items-center gap-6 justify-between">
          <div>
            <p className="font-['IBM_Plex_Mono'] text-[11px] uppercase tracking-[0.1em] text-[#00D4FF]">
              {BUNDLE.name}
            </p>
            <h2 className="mt-1 font-['Space_Grotesk'] font-semibold text-[28px] text-white">
              {BUNDLE.blurb}
            </h2>
            <p className="mt-2 font-['Inter'] text-[15px] text-[#94A3B8]">
              {items.map((p) => p.name).join(' + ')} ·{' '}
              <span className="text-white">{BUNDLE.priceUsd > 0 ? `$${BUNDLE.priceUsd}` : 'Pricing pending confirmation'}</span>
              {savingsLabel && (
                <span className="ml-2 inline-block rounded-full border border-[rgba(134,239,172,0.3)] bg-[rgba(134,239,172,0.08)] px-2.5 py-0.5 font-['Inter'] text-[12px] text-[#86EFAC]">
                  {savingsLabel}
                </span>
              )}
            </p>
          </div>
          <div className="flex flex-col gap-2">
            {items.map((p) => (
              <AddToCartButton
                key={p.id}
                item={{ id: p.id, name: p.name, price: p.priceGhs, image: p.image, category: p.category }}
                label={`Add ${p.name}`}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default BundleSection;
