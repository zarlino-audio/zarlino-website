import { useState, useEffect } from 'react';
import { ShoppingCart, Menu, X } from 'lucide-react';
import { useCartStore } from '../store/cartStore';

const Navigation = () => {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const itemCount = useCartStore((s) => s.itemCount());
  const setCartOpen = useCartStore((s) => s.setCartOpen);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const navLinks = [
    { label: 'Plugins', href: '/#plugins' },
    { label: 'Features', href: '/#features' },
    { label: 'Showcase', href: '/#showcase' },
    { label: 'Community', href: '/#testimonials' },
  ];

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-[1000] transition-all duration-300 ${
        scrolled
          ? 'bg-[rgba(5,5,5,0.9)] backdrop-blur-[16px] border-b border-[rgba(255,255,255,0.06)]'
          : 'bg-transparent'
      }`}
      style={{ height: 64 }}
    >
      <div className="max-w-[1200px] mx-auto px-6 h-full flex items-center justify-between">
        {/* Brand */}
        <a href="/" className="flex items-center gap-2">
          <img src="/images/zarlino-logo.svg" alt="Zarlino Audio" className="h-7 w-auto" />
        </a>

        {/* Center Links - Desktop */}
        <div className="hidden md:flex items-center gap-8">
          {navLinks.map((link) => (
            <a
              key={link.label}
              href={link.href}
              className="relative font-['Inter'] font-medium text-[14px] text-[#94A3B8] hover:text-white transition-colors duration-300 group"
            >
              {link.label}
              <span className="absolute bottom-[-2px] left-0 w-0 h-[1px] bg-[#00D4FF] group-hover:w-full transition-all duration-300" />
            </a>
          ))}
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => setCartOpen(true)}
            className="relative p-2 text-[#94A3B8] hover:text-white transition-colors duration-300"
            aria-label="Cart"
          >
            <ShoppingCart size={20} />
            {itemCount > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-[#00D4FF] text-[#050505] text-[11px] font-bold rounded-full flex items-center justify-center">
                {itemCount}
              </span>
            )}
          </button>

          <a
            href="/#cta"
            className="hidden md:inline-flex items-center bg-white text-[#050505] rounded-md px-5 py-2 font-['Inter'] font-medium text-[14px] hover:bg-[#00D4FF] transition-all duration-300"
          >
            Get Started
          </a>

          {/* Mobile Menu Toggle */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden p-2 text-[#94A3B8] hover:text-white transition-colors"
          >
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileOpen && (
        <div className="md:hidden bg-[rgba(5,5,5,0.95)] backdrop-blur-[16px] border-t border-[rgba(255,255,255,0.06)]">
          <div className="px-6 py-4 flex flex-col gap-4">
            {navLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className="font-['Inter'] font-medium text-[14px] text-[#94A3B8] hover:text-white transition-colors"
              >
                {link.label}
              </a>
            ))}
            <a
              href="/#cta"
              onClick={() => setMobileOpen(false)}
              className="inline-flex items-center justify-center bg-white text-[#050505] rounded-md px-5 py-2 font-['Inter'] font-medium text-[14px] hover:bg-[#00D4FF] transition-all duration-300"
            >
              Get Started
            </a>
          </div>
        </div>
      )}
    </nav>
  );
};

export default Navigation;
