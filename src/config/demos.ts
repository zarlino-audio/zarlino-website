/**
 * ZARLINO AUDIO — A/B demo audio configuration
 * ---------------------------------------------------------------------------
 * Up to 3 disclosed presets per plugin. Each preset has real audio rendered
 * through the plugin's own DSP (see plugins/<Plugin>/Tests/OfflineRender.cpp)
 * from real FL Studio demo-project stems, converted to MP3 via
 * scripts/demo-mp3.mjs. Audio lives in public/audio/<Plugin>/.
 */
import type { ABPreset } from '../components/ABPlayer';

export const ZTAME_PRESETS: ABPreset[] = [
  {
    label: 'Vocal Soothe',
    source: 'KARRA lead vocal — "Bombs Away ft KARRA — Awake" (FL Studio demo project)',
    disclosure:
      'FFT 2048 @50% overlap, peak-vs-floor detection, threshold ≈ 8.8 dB, selectivity ≈ 12.8 dB, max reduction ~7 dB, Dry/Wet 65% — tames sibilant and resonant peaks while keeping the performance.',
    a: '/audio/ZTame/A_vocal-soothe_dry.mp3',
    b: '/audio/ZTame/B_vocal-soothe_ztame.mp3',
  },
  {
    label: 'Room Tamer',
    source: 'Ella lead vocal — "Edlan & Ella Noël — Song For You" (FL Studio demo project)',
    disclosure:
      'FFT 2048 @50% overlap, threshold ≈ 9.5 dB, max reduction ~5 dB, Dry/Wet 80% — reduces ringing room resonances around the vocal.',
    a: '/audio/ZTame/A_room-tamer_dry.mp3',
    b: '/audio/ZTame/B_room-tamer_ztame.mp3',
  },
  {
    label: 'Master Polish',
    source: 'Full chorus mix — "Right Night Feeling" (FL Studio demo project)',
    disclosure:
      'FFT 2048 @50% overlap, threshold ≈ 10 dB, max reduction ~4.5 dB, Dry/Wet 55%, slow release — polishes a full mix by taming boxy resonances before the limiter.',
    a: '/audio/ZTame/A_master-polish_dry.mp3',
    b: '/audio/ZTame/B_master-polish_ztame.mp3',
  },
];

export const ZSCORCH_PRESETS: ABPreset[] = [
  {
    label: 'Tape Warm',
    source: 'Guitar solo — "Seamless — Menagerie" (FL Studio demo project)',
    disclosure:
      'Tape saturation, LR4 split @ 120/900/4 kHz, per-band drive ~0.22, mix 80%, gentle highs, glue-like soft clip — adds weight without smearing the solo.',
    a: '/audio/ZScorch/A_tape-warm_dry.mp3',
    b: '/audio/ZScorch/B_tape-warm_zscorch.mp3',
  },
  {
    label: 'Studio Drive',
    source: 'Chorus — "Astes — Bien Duro" (FL Studio demo project)',
    disclosure:
      'Tube saturation, 4-band LR4 split @ 150/800/3.5 kHz, per-band drive ~0.38, mix 75%, master soft-clip — harmonic richness on the vocal stack.',
    a: '/audio/ZScorch/A_studio-drive_dry.mp3',
    b: '/audio/ZScorch/B_studio-drive_zscorch.mp3',
  },
  {
    label: 'Aggressive Crunch',
    source: 'Full chorus mix — "Right Night Feeling" (FL Studio demo project)',
    disclosure:
      'Transistor push-pull, LR4 split @ 120/700/3.2 kHz, drive ~0.6, mix 85%, ceiling limiter — aggressive harmonic edge on a full mix.',
    a: '/audio/ZScorch/A_aggressive-crunch_dry.mp3',
    b: '/audio/ZScorch/B_aggressive-crunch_zscorch.mp3',
  },
];
