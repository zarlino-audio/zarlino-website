import Hero from '../sections/Hero';
import TrustedBy from '../sections/TrustedBy';
import ProductShowcase from '../sections/ProductShowcase';
import FeatureGrid from '../sections/FeatureGrid';
import PluginLineup from '../sections/PluginLineup';
import CTABanner from '../sections/CTABanner';
import BundleSection from './BundleSection';

/**
 * Homepage sections. Entrance reveals are pure CSS (`.za-reveal`), and
 * anchor smooth-scrolling is handled in CSS (`scroll-behavior: smooth` +
 * `scroll-margin-top`), so this component needs no JavaScript of its own.
 */
const HomePage = () => {
  return (
    <main>
      <Hero />
      <TrustedBy />
      <ProductShowcase />
      <FeatureGrid />
      <PluginLineup />
      <BundleSection />
      <CTABanner />
    </main>
  );
};

export default HomePage;
