/**
 * The certified Zarlino factory module catalogue, as data.
 *
 * AUTHORITY: the C++ module manifests under `factory/modules/*.cpp` are the
 * source of truth for what a build can actually link. This file is a faithful
 * transcription of them, used by the customer application for three things
 * that must happen BEFORE a build is paid for:
 *
 *   1. deterministic validation of an AI-proposed PluginSpec,
 *   2. the human-readable build plan the customer reviews,
 *   3. the vocabulary given to the language model (it may only choose from it).
 *
 * Drift is a real risk, so it is checked: `.github/workflows/factory-gate.yml`
 * regenerates the catalogue from the compiled kernel
 * (`ZarlinoFactory_Check --catalog-json`) and diffs it against
 * `factory/catalog/modules.json`. A mismatch fails the gate.
 */

export type ModuleCategory =
  | "utility"
  | "filter"
  | "equalizer"
  | "dynamics"
  | "saturation"
  | "limiter"
  | "shaping"
  | "stereo"
  | "mixing"
  | "source";

export type ChannelMode = "mono" | "stereo";

export interface CatalogParameter {
  id: string;
  displayName: string;
  unit: string;
  min: number;
  max: number;
  default: number;
  logarithmic: boolean;
  /** Discrete positions when stepped; 0 when continuous. */
  stepCount: number;
  group: string;
}

export interface CatalogModule {
  id: string;
  version: string;
  displayName: string;
  description: string;
  category: ModuleCategory;
  channels: ChannelMode[];
  /** Latency at 48 kHz, in samples. */
  referenceLatencySamples: number;
  /**
   * True for the modules that GENERATE the signal instead of processing it.
   * An instrument spec must contain exactly this kind of module and a processor
   * spec must contain none, because a source replaces its input: a chain that
   * mixed the two would silently discard the host's audio.
   */
  isSource?: boolean;
  parameters: CatalogParameter[];
}

function p(
  id: string,
  displayName: string,
  unit: string,
  min: number,
  max: number,
  def: number,
  group: string,
  logarithmic = false,
  stepCount = 0,
): CatalogParameter {
  return { id, displayName, unit, min, max, default: def, logarithmic, stepCount, group };
}

export const MODULE_CATALOG: readonly CatalogModule[] = [
  {
    id: "zarlino.dynamics.compressor",
    version: "1.0.0",
    displayName: "Compressor",
    description: "Feedforward compressor with soft knee and makeup gain",
    category: "dynamics",
    channels: ["mono", "stereo"],
    referenceLatencySamples: 0,
    parameters: [
      p("threshold", "Threshold", "dB", -60, 0, -18, "Dynamics"),
      p("ratio", "Ratio", "ratio", 1, 20, 4, "Dynamics"),
      p("attack", "Attack", "ms", 0.1, 200, 10, "Timing", true),
      p("release", "Release", "ms", 10, 2000, 150, "Timing", true),
      p("knee", "Knee", "dB", 0, 24, 6, "Dynamics"),
      p("makeup", "Makeup", "dB", 0, 24, 0, "Output"),
      p("detection", "Detection", "", 0, 1, 0, "Detector"),
    ],
  },
  {
    id: "zarlino.dynamics.gate",
    version: "1.0.0",
    displayName: "Gate",
    description: "Downward expander / noise gate with hysteresis",
    category: "dynamics",
    channels: ["mono", "stereo"],
    referenceLatencySamples: 0,
    parameters: [
      p("threshold", "Threshold", "dB", -80, 0, -45, "Gate"),
      p("range", "Range", "dB", -80, 0, -40, "Gate"),
      p("attack", "Attack", "ms", 0.1, 200, 2, "Timing", true),
      p("release", "Release", "ms", 10, 2000, 200, "Timing", true),
      p("hysteresis", "Hysteresis", "dB", 0, 24, 6, "Gate"),
    ],
  },
  {
    id: "zarlino.eq.parametric",
    version: "1.0.0",
    displayName: "Parametric EQ",
    description: "Four-band parametric equaliser: low shelf, two peaks, high shelf",
    category: "equalizer",
    channels: ["mono", "stereo"],
    referenceLatencySamples: 0,
    parameters: [
      p("lowShelfFreq", "Low Shelf Freq", "Hz", 20, 1000, 100, "Low", true),
      p("lowShelfGain", "Low Shelf Gain", "dB", -18, 18, 0, "Low"),
      p("lowShelfQ", "Low Shelf Q", "Q", 0.3, 4, 0.707, "Low", true),
      p("peakLowFreq", "Low Peak Freq", "Hz", 60, 8000, 400, "Low Mid", true),
      p("peakLowGain", "Low Peak Gain", "dB", -18, 18, 0, "Low Mid"),
      p("peakLowQ", "Low Peak Q", "Q", 0.3, 8, 0.9, "Low Mid", true),
      p("peakHighFreq", "High Peak Freq", "Hz", 300, 16000, 3000, "High Mid", true),
      p("peakHighGain", "High Peak Gain", "dB", -18, 18, 0, "High Mid"),
      p("peakHighQ", "High Peak Q", "Q", 0.3, 8, 0.9, "High Mid", true),
      p("highShelfFreq", "High Shelf Freq", "Hz", 2000, 20000, 8000, "High", true),
      p("highShelfGain", "High Shelf Gain", "dB", -18, 18, 0, "High"),
      p("highShelfQ", "High Shelf Q", "Q", 0.3, 4, 0.707, "High", true),
    ],
  },
  {
    id: "zarlino.eq.tilt",
    version: "1.0.0",
    displayName: "Tilt EQ",
    description: "Spectral tilt around a pivot frequency",
    category: "equalizer",
    channels: ["mono", "stereo"],
    referenceLatencySamples: 0,
    parameters: [
      p("tiltDb", "Tilt", "dB", -12, 12, 0, "Tone"),
      p("pivotHz", "Pivot", "Hz", 200, 8000, 1000, "Tone", true),
    ],
  },
  {
    id: "zarlino.filter.multimode",
    version: "1.0.0",
    displayName: "Multimode Filter",
    description: "Resonant low-pass / high-pass, 12 or 24 dB per octave",
    category: "filter",
    channels: ["mono", "stereo"],
    referenceLatencySamples: 0,
    parameters: [
      p("shape", "Shape", "", 0, 1, 0, "Filter", false, 2),
      p("frequency", "Frequency", "Hz", 20, 20000, 1000, "Filter", true),
      p("resonance", "Resonance", "Q", 0.1, 10, 0.707, "Filter", true),
      p("slope", "Slope", "", 0, 1, 0, "Filter", false, 2),
    ],
  },
  {
    id: "zarlino.gain",
    version: "1.0.0",
    displayName: "Gain",
    description: "Smoothed trim stage with polarity inversion",
    category: "utility",
    channels: ["mono", "stereo"],
    referenceLatencySamples: 0,
    parameters: [
      p("gainDb", "Gain", "dB", -60, 24, 0, "Trim"),
      p("polarity", "Polarity", "", 0, 1, 0, "Trim", false, 2),
    ],
  },
  {
    id: "zarlino.limiter",
    version: "1.0.0",
    displayName: "Limiter",
    description: "Brick-wall lookahead limiter with a fixed 1 ms window",
    category: "limiter",
    channels: ["mono", "stereo"],
    referenceLatencySamples: 48,
    parameters: [
      p("ceiling", "Ceiling", "dB", -12, 0, -1, "Limiter"),
      p("release", "Release", "ms", 1, 500, 50, "Limiter", true),
    ],
  },
  {
    id: "zarlino.mix.drywet",
    version: "1.0.0",
    displayName: "Dry/Wet",
    description: "Parallel dry/wet blend, linear or equal-power",
    category: "mixing",
    channels: ["mono", "stereo"],
    referenceLatencySamples: 0,
    parameters: [
      p("mix", "Mix", "", 0, 1, 1, "Blend"),
      p("equalPower", "Equal Power", "", 0, 1, 0, "Blend", false, 2),
    ],
  },
  {
    id: "zarlino.saturation",
    version: "1.0.0",
    displayName: "Saturation",
    description: "Six-mode harmonic saturator with ADAA anti-aliasing (ZScorch curves)",
    category: "saturation",
    channels: ["mono", "stereo"],
    referenceLatencySamples: 0,
    parameters: [
      p("drive", "Drive", "", 0, 1, 0, "Drive"),
      p("mode", "Mode", "", 0, 5, 0, "Drive", false, 6),
      p("harmReduction", "Harmonic Reduction", "", 0, 1, 0, "Tone"),
    ],
  },
  {
    id: "zarlino.shaping.transient",
    version: "1.0.0",
    displayName: "Transient Shaper",
    description: "Dual-envelope transient shaper for attack and sustain",
    category: "shaping",
    channels: ["mono", "stereo"],
    referenceLatencySamples: 0,
    parameters: [
      p("attack", "Attack", "dB", -24, 24, 0, "Shaper"),
      p("sustain", "Sustain", "dB", -24, 24, 0, "Shaper"),
      p("attackTime", "Attack Time", "ms", 0.5, 50, 5, "Detector", true),
      p("releaseTime", "Release Time", "ms", 5, 500, 100, "Detector", true),
      p("sensitivity", "Sensitivity", "", 0, 1, 0.5, "Detector"),
    ],
  },
  {
    id: "zarlino.stereo.width",
    version: "1.0.0",
    displayName: "Stereo Width",
    description: "Mid/side width control with bass-mono guard",
    category: "stereo",
    channels: ["stereo"],
    referenceLatencySamples: 0,
    parameters: [
      p("width", "Width", "", 0, 2, 1, "Image"),
      p("bassMonoAmount", "Bass Mono", "", 0, 1, 0, "Image"),
      p("bassMonoFreq", "Bass Mono Freq", "Hz", 20, 500, 120, "Image", true),
    ],
  },
  {
    id: "zarlino.delay.stereo",
    version: "1.0.0",
    displayName: "Stereo Delay",
    description: "Tempo-friendly stereo delay with a damped feedback loop and ping-pong routing",
    category: "mixing",
    channels: ["mono", "stereo"],
    referenceLatencySamples: 0,
    parameters: [
      p("timeMs", "Time", "ms", 1, 2000, 350, "Delay", true),
      p("feedback", "Feedback", "", 0, 0.95, 0.3, "Delay"),
      p("dampHz", "Damping", "Hz", 400, 18000, 7000, "Delay", true),
      p("pingPong", "Ping-Pong", "", 0, 1, 0, "Delay", false, 2),
      p("mix", "Mix", "", 0, 1, 0.25, "Output"),
    ],
  },
  {
    id: "zarlino.reverb.algorithmic",
    version: "1.0.0",
    displayName: "Reverb",
    description: "Algorithmic room: damped comb network with allpass diffusion and predelay",
    category: "mixing",
    channels: ["mono", "stereo"],
    referenceLatencySamples: 0,
    parameters: [
      p("predelayMs", "Predelay", "ms", 0, 200, 20, "Space"),
      p("size", "Size", "", 0, 1, 0.55, "Space"),
      p("decay", "Decay", "", 0, 1, 0.6, "Space"),
      p("damping", "Damping", "", 0, 1, 0.4, "Tone"),
      p("width", "Width", "", 0, 1, 0.8, "Tone"),
      p("mix", "Mix", "", 0, 1, 0.25, "Output"),
    ],
  },
  {
    id: "zarlino.modulation.chorus",
    version: "1.0.0",
    displayName: "Chorus",
    description: "Two-voice modulated delay for width and thickness",
    category: "mixing",
    channels: ["mono", "stereo"],
    referenceLatencySamples: 0,
    parameters: [
      p("rateHz", "Rate", "Hz", 0.05, 8, 0.6, "Movement", true),
      p("depthMs", "Depth", "ms", 0, 20, 6, "Movement"),
      p("spread", "Spread", "", 0, 1, 0.6, "Movement"),
      p("mix", "Mix", "", 0, 1, 0.35, "Output"),
    ],
  },
  {
    id: "zarlino.modulation.flanger",
    version: "1.0.0",
    displayName: "Flanger",
    description: "Short modulated delay with feedback for comb-filter sweeps",
    category: "mixing",
    channels: ["mono", "stereo"],
    referenceLatencySamples: 0,
    parameters: [
      p("rateHz", "Rate", "Hz", 0.05, 8, 0.25, "Movement", true),
      p("depthMs", "Depth", "ms", 0.5, 8, 3, "Movement"),
      p("feedback", "Feedback", "", -0.9, 0.9, 0.35, "Character"),
      p("mix", "Mix", "", 0, 1, 0.5, "Output"),
    ],
  },
  {
    id: "zarlino.modulation.phaser",
    version: "1.0.0",
    displayName: "Phaser",
    description: "Six-stage swept allpass chain for swirling phase movement",
    category: "mixing",
    channels: ["mono", "stereo"],
    referenceLatencySamples: 0,
    parameters: [
      p("rateHz", "Rate", "Hz", 0.05, 8, 0.4, "Movement", true),
      p("centreHz", "Centre", "Hz", 150, 3000, 700, "Movement", true),
      p("depth", "Depth", "", 0, 1, 0.7, "Movement"),
      p("feedback", "Feedback", "", 0, 0.9, 0.3, "Character"),
      p("mix", "Mix", "", 0, 1, 0.5, "Output"),
    ],
  },
  {
    id: "zarlino.modulation.tremolo",
    version: "1.0.0",
    displayName: "Tremolo / Pan",
    description: "Amplitude modulation with a stereo phase offset for auto-pan",
    category: "mixing",
    channels: ["mono", "stereo"],
    referenceLatencySamples: 0,
    parameters: [
      p("rateHz", "Rate", "Hz", 0.05, 20, 4, "Movement", true),
      p("depth", "Depth", "", 0, 1, 0.6, "Movement"),
      p("shape", "Shape", "", 0, 2, 0, "Movement", false, 3),
      p("stereoPhase", "Stereo Phase", "", 0, 1, 0, "Movement"),
    ],
  },
  {
    id: "zarlino.stereo.midside",
    version: "1.0.0",
    displayName: "Mid/Side Width",
    description: "Mid/side width with a bass-mono guard",
    category: "stereo",
    channels: ["stereo"],
    referenceLatencySamples: 0,
    parameters: [
      p("width", "Width", "", 0, 2, 1, "Width"),
      p("bassMonoHz", "Bass Mono", "Hz", 20, 500, 20, "Width", true),
    ],
  },
  {
    id: "zarlino.saturation.clipper",
    version: "1.0.0",
    displayName: "Clipper",
    description: "Driven soft/hard/asymmetric clipper with a hard ceiling",
    category: "saturation",
    channels: ["mono", "stereo"],
    referenceLatencySamples: 0,
    parameters: [
      p("driveDb", "Drive", "dB", 0, 24, 6, "Character"),
      p("ceilingDb", "Ceiling", "dB", -12, 0, 0, "Output"),
      p("mode", "Mode", "", 0, 2, 0, "Character", false, 3),
      p("mix", "Mix", "", 0, 1, 1, "Output"),
    ],
  },
  {
    id: "zarlino.saturation.exciter",
    version: "1.0.0",
    displayName: "Exciter",
    description: "High-band harmonic generator for air and presence",
    category: "saturation",
    channels: ["mono", "stereo"],
    referenceLatencySamples: 0,
    parameters: [
      p("freqHz", "Tune", "Hz", 800, 8000, 3000, "Character", true),
      p("amount", "Amount", "", 0, 1, 0.35, "Character"),
      p("mix", "Mix", "", 0, 1, 1, "Output"),
    ],
  },
  {
    id: "zarlino.dynamics.deesser",
    version: "1.0.0",
    displayName: "De-Esser",
    description: "Band-limited downward compression for sibilance and harshness",
    category: "dynamics",
    channels: ["mono", "stereo"],
    referenceLatencySamples: 0,
    parameters: [
      p("freqHz", "Frequency", "Hz", 2500, 12000, 6000, "Detector", true),
      p("thresholdDb", "Threshold", "dB", -48, 0, -24, "Detector"),
      p("amount", "Amount", "", 0, 1, 0.6, "Reduction"),
      p("releaseMs", "Release", "ms", 20, 400, 90, "Reduction"),
    ],
  },
  {
    id: "zarlino.saturation.tape",
    version: "1.0.0",
    displayName: "Tape",
    description: "Tape-machine character: head bump, biased asymmetry and high-frequency loss",
    category: "saturation",
    channels: ["mono", "stereo"],
    referenceLatencySamples: 0,
    parameters: [
      p("driveDb", "Drive", "dB", 0, 18, 3, "Character"),
      p("bias", "Bias", "", 0, 1, 0.25, "Character"),
      p("bumpDb", "Head Bump", "dB", 0, 6, 2, "Tone"),
      p("hfHz", "HF Loss", "Hz", 2000, 20000, 12000, "Tone", true),
      p("mix", "Mix", "", 0, 1, 1, "Output"),
    ],
  },
  {
    id: "zarlino.saturation.tube",
    version: "1.0.0",
    displayName: "Tube",
    description: "Driven tube stage with asymmetric bias and supply sag",
    category: "saturation",
    channels: ["mono", "stereo"],
    referenceLatencySamples: 0,
    parameters: [
      p("driveDb", "Drive", "dB", 0, 24, 6, "Character"),
      p("bias", "Bias", "", 0, 1, 0.35, "Character"),
      p("sag", "Sag", "", 0, 1, 0.3, "Character"),
      p("mix", "Mix", "", 0, 1, 1, "Output"),
    ],
  },
  {
    id: "zarlino.saturation.transformer",
    version: "1.0.0",
    displayName: "Transformer",
    description: "Iron colour: low-band core saturation with a passive high-frequency roll-off",
    category: "saturation",
    channels: ["mono", "stereo"],
    referenceLatencySamples: 0,
    parameters: [
      p("driveDb", "Drive", "dB", 0, 18, 4, "Character"),
      p("splitHz", "Core Split", "Hz", 60, 600, 220, "Character", true),
      p("hfHz", "HF Roll-off", "Hz", 3000, 20000, 14000, "Tone", true),
      p("mix", "Mix", "", 0, 1, 1, "Output"),
    ],
  },
  {
    id: "zarlino.source.synth",
    version: "1.0.0",
    displayName: "Synth",
    description: "Eight-voice polyphonic oscillator with an amplitude envelope",
    category: "source",
    channels: ["mono", "stereo"],
    referenceLatencySamples: 0,
    isSource: true,
    parameters: [
      p("wave", "Waveform", "", 0, 3, 0, "Voice", false, 4),
      p("octave", "Octave", "", -2, 2, 0, "Voice", false, 5),
      p("fineCents", "Fine", "", -100, 100, 0, "Voice"),
      p("pulseWidth", "Width", "", 0.05, 0.95, 0.5, "Voice"),
      p("attackMs", "Attack", "ms", 0.5, 4000, 5, "Envelope", true),
      p("decayMs", "Decay", "ms", 5, 4000, 250, "Envelope", true),
      p("sustain", "Sustain", "", 0, 1, 0.75, "Envelope"),
      p("releaseMs", "Release", "ms", 5, 8000, 220, "Envelope", true),
      p("levelDb", "Level", "dB", -48, 6, -6, "Output"),
    ],
  },
];

/** The catalogue keyed by id, in the order the kernel's registry iterates. */
export const CATALOG_BY_ID: ReadonlyMap<string, CatalogModule> = new Map(
  [...MODULE_CATALOG].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)).map((m) => [m.id, m]),
);

export function findModule(moduleId: string): CatalogModule | undefined {
  return CATALOG_BY_ID.get(moduleId);
}

export function findModuleParameter(moduleId: string, parameterId: string): CatalogParameter | undefined {
  return findModule(moduleId)?.parameters.find((parameter) => parameter.id === parameterId);
}

/** Plain-data statement of the vocabulary, for the model prompt and the UI. */
export function catalogForPrompt(): Array<Record<string, unknown>> {
  return [...CATALOG_BY_ID.values()].map((module) => ({
    moduleId: module.id,
    displayName: module.displayName,
    description: module.description,
    category: module.category,
    channels: module.channels,
    parameters: module.parameters.map((parameter) => ({
      id: parameter.id,
      unit: parameter.unit || undefined,
      min: parameter.min,
      max: parameter.max,
      default: parameter.default,
      logarithmic: parameter.logarithmic || undefined,
      steps: parameter.stepCount || undefined,
    })),
  }));
}
