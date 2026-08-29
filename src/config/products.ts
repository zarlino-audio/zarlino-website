/**
 * ZARLINO AUDIO — Central product configuration
 * ---------------------------------------------------------------------------
 * Single source of truth for product facts: pricing, status, compatibility,
 * versioning, download/purchase URLs and the copy used across the site.
 *
 * RULES:
 *  - Change a product fact in THIS file only. Do not hard-code prices,
 *    versions or compatibility claims in components/pages.
 *  - Do not add speculative claims. If a fact isn't confirmed, leave the
 *    field empty or the flag `false` and ship the structure.
 *  - Server-authoritative prices for checkout live in the Worker
 *    (`src/index.ts` -> PLUGINS) and MUST be kept in sync with this file.
 */

export interface Feature {
  title: string;
  body: string;
}

export interface ProductConfig {
  /** Cart / checkout plugin key (must match the Worker PLUGINS map). */
  id: string;
  name: string;
  slug: string;
  category: string;
  /** Outcome-led one-liner shown right under the product name. */
  tagline: string;
  /** The audio problem the product solves. */
  problem: string;
  /** What changes for the user once they use it. */
  outcome: string;
  /** Fuller description used on cards and pages. */
  description: string;
  /** Server-authoritative retail prices. */
  priceUsd: number;
  priceGhs: number;
  priceLabelGhs: string;
  usdLabel: string;
  status: 'released';
  version: string;
  platform: string;
  format: string;
  /** Fully-functional trial length in days (matches the plugin). */
  trialDays: number;
  image: string;
  /** Primary download (installer) — full path under /downloads/. */
  downloadUrl: string;
  buyUrl: string;
  badge: string;
  heroKicker: string;
  /** Product-specific email-list hook (see EmailCapture). */
  emailList: {
    topic: string;
    cta: string;
    success: string;
  };
}

export const SITE = {
  name: 'Zarlino Audio',
  url: 'https://zarlinoaudio.com',
  positioning: 'Precision audio tools. Better decisions.',
  supporting:
    'Professional audio processing designed to make complex decisions feel clear, controlled, and effortless.',
  mission:
    'Zarlino builds precision audio tools that make professional decisions feel effortless — precision over excess, clarity over complexity.',
  email: 'support@zarlinoaudio.com',
};

/**
 * DAW compatibility — only hosts that genuinely run our plugin format on our
 * supported OS. The plugins ship as Windows VST3. Logic Pro requires AU and
 * Pro Tools requires AAX, so they are intentionally NOT listed as supported.
 */
export const SUPPORTED_DAWS = [
  'FL Studio',
  'Ableton Live',
  'Cubase',
  'Reaper',
  'Studio One',
  'Bitwig',
];

export const FUTURE_PLATFORMS = {
  note: 'Mac (AU) and Pro Tools (AAX) are under consideration for a future release.',
  /** Flip to true only once a real waitlist capture is wired up. */
  waitlistEnabled: false,
};

export const PRODUCTS: Record<string, ProductConfig> = {
  ztame: {
    id: 'ztame',
    name: 'ZTame',
    slug: '/plugins/ztame',
    category: 'Resonance Suppressor',
    tagline:
      'Automatically identify and control harsh resonances while preserving the character of the sound.',
    problem:
      'Every recording has resonances — harsh vocal peaks, ringing cymbals, boxy rooms. Finding them by ear and cutting them by hand is slow, repetitive surgical EQ work.',
    outcome:
      'ZTame detects narrow, persistent spectral peaks and reduces them dynamically — only while they are present — so the harshness is controlled without dulling the rest of the signal.',
    description:
      'High-resolution FFT-based automatic resonance suppressor with per-peak dynamic notch filtering, selectivity gating, split-band operation, and solo monitoring.',
    priceUsd: 49,
    priceGhs: 750,
    priceLabelGhs: '₵750',
    usdLabel: '$49',
    status: 'released',
    version: '1.0.0',
    platform: 'Windows',
    format: 'VST3',
    trialDays: 14,
    image: '/images/ztame-ui.png',
    downloadUrl: '/downloads/ZTame-v1.0.0-Windows-Installer.exe',
    buyUrl: '/plugins/ztame#buy',
    badge: 'v1.0',
    heroKicker: 'FLAGSHIP PROCESSOR',
    emailList: {
      topic: 'ZTame',
      cta: 'Get the Resonance Control Guide and ZTame updates.',
      success: 'Thanks — we will send the guide and ZTame updates to your inbox.',
    },
  },
  zscorch: {
    id: 'zscorch',
    name: 'ZScorch',
    slug: '/plugins/zscorch',
    category: 'Harmonic Processor',
    tagline:
      'Add weight, colour, energy, and controlled aggression — without unnecessarily sacrificing clarity.',
    problem:
      'Clean signals can sound thin, flat, or lifeless. Adding saturation by hand is trial-and-error across EQs, drive stages, and parallel chains — and it is easy to muddy a mix.',
    outcome:
      'ZScorch adds controlled harmonic character — warmth, edge, and glue — through multiband saturation you can shape with a few simple macros.',
    description:
      'Adaptive harmonic processor with multiband saturation across six topologies — Tube, Tape, Germanium, Transistor, Diode, and Wavefold — driven by Lift, Character, and Mix macros.',
    priceUsd: 79,
    priceGhs: 1200,
    priceLabelGhs: '₵1,200',
    usdLabel: '$79',
    status: 'released',
    version: '1.0.0',
    platform: 'Windows',
    format: 'VST3',
    trialDays: 14,
    image: '/images/zscorch-ui.jpg',
    downloadUrl: '/downloads/ZScorch-v1.0.0-Windows-Installer.exe',
    buyUrl: '/plugins/zscorch#buy',
    badge: 'v1.0',
    heroKicker: 'HARMONIC PROCESSOR',
    emailList: {
      topic: 'ZScorch',
      cta: 'Learn practical harmonic processing techniques and get ZScorch updates.',
      success: 'Thanks — we will send harmonic processing techniques and ZScorch updates.',
    },
  },
};

/** Keep checkout prices in sync — mirrored server-side in the Worker PLUGINS map. */
export const CART_PRICES: Record<string, { usd: number; ghs: number }> = {
  ztame: { usd: PRODUCTS.ztame.priceUsd, ghs: PRODUCTS.ztame.priceGhs },
  zscorch: { usd: PRODUCTS.zscorch.priceUsd, ghs: PRODUCTS.zscorch.priceGhs },
};

/**
 * Bundle — infrastructure only. The exact price MUST be confirmed by the
 * business owner before `enabled` is set to true, and the Worker licensing/
 * Paystack flow must support a bundle before it ships live.
 */
export const BUNDLE = {
  enabled: false,
  name: 'Zarlino Bundle',
  includes: ['ztame', 'zscorch'],
  priceUsd: 99,
  priceGhs: 1950,
  savingsUsd: PRODUCTS.ztame.priceUsd + PRODUCTS.zscorch.priceUsd - 99,
  blurb:
    'Both plugins — resonance control and harmonic character — in one purchase.',
};

/**
 * Social proof — only genuine, permission-granted feedback goes here.
 * Keep this array empty until real user evidence exists (see directive §9).
 */
export const TESTIMONIALS: Array<{
  name: string;
  role?: string;
  org?: string;
  quote: string;
  source?: string;
}> = [];

/** Future-platform waitlist config (see §2 of the directive). */
export const WAITLIST = {
  /** Set true only once a real email-capture provider is wired to /api/waitlist. */
  enabled: true,
  success: 'Thanks — we will notify you when Mac / AU / AAX is available.',
};
