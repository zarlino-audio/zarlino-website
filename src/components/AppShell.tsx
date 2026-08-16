import ParticleCloud from '../sections/ParticleCloud';
import Navigation from './Navigation';
import CartDrawer from '../sections/CartDrawer';
import { useCartStore } from '../store/cartStore';

const AppShell = () => {
  const isOpen = useCartStore((s) => s.isOpen);
  const setCartOpen = useCartStore((s) => s.setCartOpen);

  return (
    <>
      <ParticleCloud />
      <Navigation />
      <CartDrawer isOpen={isOpen} onClose={() => setCartOpen(false)} />
    </>
  );
};

export default AppShell;
