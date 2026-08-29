import { Settings, Layers, Waves } from 'lucide-react';

const features = [
  {
    icon: Settings,
    iconColor: '#00D4FF',
    title: 'DSP Precision',
    body: 'Sample-accurate processing with FFT-based spectral analysis, dynamic filtering, and adaptive algorithms tuned for real-time performance.',
  },
  {
    icon: Layers,
    iconColor: '#7C3AED',
    title: 'Modular Signal Chains',
    body: 'Multi-stage processing architectures with configurable routing, parallel paths, and macro controls that simplify complex workflows.',
  },
  {
    icon: Waves,
    iconColor: '#FF6B35',
    title: 'Surgical Control',
    body: 'Per-band dynamics, resonance suppression, harmonic shaping, and spatial enhancement — every parameter exposed for total creative freedom.',
  },
];

const FeatureGrid = () => {
  return (
    <section
      id="features"
      className="relative z-[1] bg-[#0A0A0A] py-[140px] px-6 md:px-10"
    >
      <div className="max-w-[1200px] mx-auto">
        {/* Header */}
        <div className="section-header za-reveal">
          <span className="font-['IBM_Plex_Mono'] text-[12px] uppercase tracking-[0.1em] text-[#00D4FF]">
            WHY ZARLINO
          </span>
          <h2
            className="mt-3 font-['Space_Grotesk'] font-semibold text-white"
            style={{
              fontSize: 'clamp(36px, 4vw, 52px)',
              lineHeight: 1.15,
              letterSpacing: '-0.02em',
            }}
          >
            Built for the Craft
          </h2>
          <p className="mt-3 font-['Inter'] text-[16px] text-[#94A3B8] max-w-[500px]">
            Every detail designed for professionals who spend hours in the
            studio.
          </p>
        </div>

        {/* Grid */}
        <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-6">
          {features.map((feature, i) => {
            const Icon = feature.icon;
            return (
              <div
                key={feature.title}
                className={`feature-card za-reveal za-d${(i % 4) + 1} bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.06)] rounded-xl p-10 hover:border-[rgba(255,255,255,0.12)] hover:-translate-y-1 transition-all duration-[400ms] ease-out`}
              >
                <Icon
                  size={40}
                  style={{ color: feature.iconColor }}
                  strokeWidth={1.5}
                />
                <h3 className="mt-6 font-['Space_Grotesk'] font-semibold text-[20px] text-white">
                  {feature.title}
                </h3>
                <p className="mt-3 font-['Inter'] text-[15px] text-[#94A3B8] leading-[1.7]">
                  {feature.body}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default FeatureGrid;
