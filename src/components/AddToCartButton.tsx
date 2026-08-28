import { ShoppingBag } from 'lucide-react';
import { useCartStore } from '../store/cartStore';

export interface AddToCartItem {
  id: string;
  name: string;
  price: number;
  image: string;
  category: string;
}

/** Add a plugin to the cart (opens the drawer) and hand off to Paystack
 *  checkout. `price` is the server-authoritative GHS price — the backend
 *  re-prices from PLUGINS so a tampered client value is ignored. */
const AddToCartButton = ({ item, label = 'Add to Cart' }: { item: AddToCartItem; label?: string }) => {
  const addItem = useCartStore((s) => s.addItem);

  const handle = () => {
    addItem({ ...item, originalPrice: undefined });
  };

  return (
    <button
      type="button"
      onClick={handle}
      className="inline-flex items-center gap-2 rounded-lg bg-white text-[#050505] px-5 py-2.5 font-['Inter'] font-medium text-[14px] hover:bg-[#00D4FF] transition-colors duration-300"
    >
      <ShoppingBag size={15} />
      {label}
    </button>
  );
};

export default AddToCartButton;
