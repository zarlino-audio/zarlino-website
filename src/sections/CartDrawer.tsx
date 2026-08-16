import { X, Trash2, ShoppingBag } from 'lucide-react';
import { useCartStore } from '../store/cartStore';

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

const CartDrawer = ({ isOpen, onClose }: CartDrawerProps) => {
  const { items, removeItem, clearCart, total } = useCartStore();

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/60 z-[1001] transition-opacity duration-300 ${
          isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        className={`fixed top-0 right-0 h-full w-full max-w-[420px] bg-[#0A0A0A] border-l border-[rgba(255,255,255,0.06)] z-[1002] transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-[rgba(255,255,255,0.06)]">
            <h2 className="font-['Space_Grotesk'] font-semibold text-[20px] text-white">
              Your Cart
            </h2>
            <button
              onClick={onClose}
              className="p-2 text-[#94A3B8] hover:text-white transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          {/* Items */}
          <div className="flex-1 overflow-y-auto p-6">
            {items.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <ShoppingBag size={48} className="text-[#334155] mb-4" />
                <p className="font-['Space_Grotesk'] text-[18px] text-white mb-2">
                  Your cart is empty
                </p>
                <p className="font-['Inter'] text-[14px] text-[#64748B]">
                  Add some plugins to get started
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {items.map((item) => (
                  <div
                    key={item.id}
                    className="flex gap-4 p-4 bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.06)] rounded-xl"
                  >
                    <img
                      src={item.image}
                      alt={item.name}
                      className="w-16 h-16 rounded-lg object-cover"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-['Space_Grotesk'] font-semibold text-[15px] text-white truncate">
                        {item.name}
                      </p>
                      <p className="font-['IBM_Plex_Mono'] text-[11px] uppercase tracking-wider text-[#64748B] mt-1">
                        {item.category}
                      </p>
                      <p className="font-['Space_Grotesk'] font-semibold text-[16px] text-[#00D4FF] mt-2">
                        ${item.price}
                      </p>
                    </div>
                    <button
                      onClick={() => removeItem(item.id)}
                      className="p-2 text-[#64748B] hover:text-red-400 transition-colors self-start"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          {items.length > 0 && (
            <div className="p-6 border-t border-[rgba(255,255,255,0.06)]">
              <div className="flex items-center justify-between mb-4">
                <span className="font-['Inter'] text-[14px] text-[#94A3B8]">Subtotal</span>
                <span className="font-['Space_Grotesk'] font-semibold text-[24px] text-white">
                  ${total()}
                </span>
              </div>
              <button
                onClick={() => alert('Checkout coming soon!')}
                className="w-full bg-[#00D4FF] text-[#050505] rounded-lg py-3 font-['Inter'] font-medium text-[15px] hover:bg-[#33DDFF] transition-colors duration-300"
              >
                Proceed to Checkout
              </button>
              <button
                onClick={clearCart}
                className="w-full mt-2 py-2 font-['Inter'] text-[13px] text-[#64748B] hover:text-white transition-colors"
              >
                Clear Cart
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default CartDrawer;
