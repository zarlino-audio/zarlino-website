import { ShoppingBag, Hourglass } from 'lucide-react';
import { useCartStore } from '../store/cartStore';
import { SALES_ENABLED } from '../config/sales';

export interface AddToCartItem {
  id: string;
  name: string;
  price: number;
  image: string;
  category: string;
}

/** Add a plugin to the cart (opens the drawer) and hand off to Paystack
 *  checkout. `price` is the server-authoritative GHS price — the backend
 *  re-prices from PLUGINS so a tampered client value is ignored.
 *
 *  NOTE: sales are controlled by the single `SALES_ENABLED` flag in
 *  `src/config/sales.ts`. While it is `false` (plugins still CONCEPT), this
 *  component renders a clear "Not yet available — coming soon" state instead
 *  of a clickable purchase button, on EVERY page it appears on (the ZTame and
 *  ZScorch detail pages and the home PluginLineup cards) — no per-page wiring
 *  needed. The price/item plumbing stays intact so re-enabling is a one-var
 *  flip.
 *
 *  `event` (optional) wires the button into the conversion beacon via
 *  [data-event] (see BaseLayout); it only fires on a real purchase click. */
const AddToCartButton = ({ item, label = 'Add to Cart', event }: { item: AddToCartItem; label?: string; event?: string }) => {
  const addItem = useCartStore((s) => s.addItem);

  const handle = () => {
    // Belt-and-suspenders: never allow a purchase to even reach the cart while
    // the sales gate is closed, regardless of how this component was mounted.
    if (!SALES_ENABLED) return;
    addItem({ ...item, originalPrice: undefined });
  };

  // Sales disabled: show an honest "not available" state — not a purchase CTA.
  if (!SALES_ENABLED) {
    return (
      <span
        className="inline-flex items-center gap-2 rounded-lg border border-[rgba(255,255,255,0.18)] bg-[rgba(255,255,255,0.04)] text-[#94A3B8] px-5 py-2.5 font-['Inter'] font-medium text-[14px]"
        title="Not available for purchase yet"
        aria-disabled="true"
      >
        <Hourglass size={15} className="text-[#64748B]" />
        Coming soon
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={handle}
      data-event={event || undefined}
      className="inline-flex items-center gap-2 rounded-lg bg-white text-[#050505] px-5 py-2.5 font-['Inter'] font-medium text-[14px] hover:bg-[#00D4FF] transition-colors duration-300"
    >
      <ShoppingBag size={15} />
      {label}
    </button>
  );
};

export default AddToCartButton;
