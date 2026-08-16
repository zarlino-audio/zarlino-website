import { useEffect } from 'react';
import Hero from '../sections/Hero';
import TrustedBy from '../sections/TrustedBy';
import ProductShowcase from '../sections/ProductShowcase';
import FeatureGrid from '../sections/FeatureGrid';
import PluginLineup from '../sections/PluginLineup';
import CTABanner from '../sections/CTABanner';

const HomePage = () => {
  useEffect(() => {
    // Smooth scroll for anchor links
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const anchor = target.closest('a[href^="#"]');
      if (anchor) {
        const href = anchor.getAttribute('href');
        if (href && href !== '#') {
          e.preventDefault();
          const el = document.querySelector(href);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth' });
          }
        }
      }
    };
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  return (
    <main>
      <Hero />
      <TrustedBy />
      <ProductShowcase />
      <FeatureGrid />
      <PluginLineup />
      <CTABanner />
    </main>
  );
};

export default HomePage;
