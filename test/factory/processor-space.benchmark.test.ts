/**
 * PROCESSOR SPACE BENCHMARK - what the factory can actually build.
 *
 * The launch question is not "how many modules exist" but "what fraction of
 * ordinary audio-processor requests can Zarlino compile from certified DSP?".
 * This suite answers it with two halves:
 *
 *   1. EVERY certified module must be expressible in a PluginSpec: a generated
 *      single-module case per catalogue entry, with parameters taken from the
 *      catalogue's own ranges. A module nobody can address is not a capability.
 *   2. PRODUCT CASES across the plugin categories a customer actually asks for
 *      (vocal, drum, bass, guitar, mix bus, mastering, EQ, dynamics, distortion,
 *      stereo, time, modulation, spatial, creative). Each case is a real design
 *      and every one must validate and produce a plan and three interfaces.
 *
 * The unsupported half lists requests that must STILL be refused, so coverage
 * cannot be inflated by quietly claiming capabilities the DSP does not have.
 *
 * This is a benchmark, not a model test: no assistant is involved, so the
 * numbers reflect the DSP vocabulary and the deterministic validator only.
 */

import { describe, expect, it } from "vitest";
import { MODULE_CATALOG } from "../../src/factory/catalog";
import { parsePluginSpec } from "../../src/factory/spec";
import { compilePlan, previewAllTemplates } from "../../src/factory/plan";
import { detectUnsupportedRequest } from "../../src/factory/ai";

// ---------------------------------------------------------------------------
// Spec construction from the catalogue
// ---------------------------------------------------------------------------

interface ModuleRef {
  instanceId: string;
  moduleId: string;
  values?: Record<string, number>;
}

function moduleById(moduleId: string) {
  const found = MODULE_CATALOG.find((module) => module.id === moduleId);
  if (!found) throw new Error(`catalogue has no module '${moduleId}'`);
  return found;
}

/**
 * Build a valid spec from module references, deriving every declared parameter
 * from the catalogue so a range can never drift from the manifest.
 */
function buildSpec(refs: ModuleRef[], options: { channels?: "mono" | "stereo"; name?: string; effectType?: string } = {}) {
  const channels = options.channels ?? (refs.some((ref) => moduleById(ref.moduleId).channels.length === 1) ? "stereo" : "stereo");

  const modules = refs.map((ref) => {
    const module = moduleById(ref.moduleId);
    const parameters: Record<string, number> = {};
    for (const parameter of module.parameters) parameters[parameter.id] = ref.values?.[parameter.id] ?? parameter.default;
    return { instanceId: ref.instanceId, moduleId: ref.moduleId, moduleVersion: module.version, parameters };
  });

  const exposed: Array<Record<string, unknown>> = [];
  const seen = new Set<string>();

  for (const ref of refs) {
    const module = moduleById(ref.moduleId);
    for (const parameter of module.parameters.slice(0, 3)) {
      if (seen.has(parameter.id)) continue;
      seen.add(parameter.id);
      exposed.push({
        id: parameter.id,
        name: parameter.displayName,
        target: `${ref.instanceId}.${parameter.id}`,
        range: { min: parameter.min, max: parameter.max, default: parameter.default },
        unit: parameter.unit,
        logarithmic: parameter.logarithmic,
        group: parameter.group,
        exposeToHost: true,
      });
    }
  }

  return {
    factorySchemaVersion: 1,
    plugin: {
      id: "zarlino.customer.benchmark-case",
      name: options.name ?? "Benchmark Case",
      vendor: "Zarlino Audio",
      version: "1.0.0",
      effectType: options.effectType ?? "utility",
      channels,
    },
    graph: { modules },
    parameters: exposed,
    macros: [],
    dryWet: { enabled: false, defaultMix: 1 },
    bypass: { mode: "hard", defaultBypassed: false },
    ui: {
      accentColor: "#4C9AFF",
      category: "Benchmark",
      shortDescription: "A processor the factory compiles from certified modules.",
      tags: [],
      layout: "vertical",
      parameterOrder: exposed.map((parameter) => parameter.id as string),
    },
  };
}

function validate(refs: ModuleRef[], options?: Parameters<typeof buildSpec>[1]) {
  return parsePluginSpec(buildSpec(refs, options));
}

// ---------------------------------------------------------------------------
// The benchmark corpus
// ---------------------------------------------------------------------------

/** One case per certified module: the vocabulary itself. */
const moduleCases = MODULE_CATALOG.map((module) => ({
  category: module.category,
  request: `a ${module.displayName.toLowerCase()} processor`,
  refs: [{ instanceId: "unit", moduleId: module.id }] as ModuleRef[],
}));

/** Whole products across the categories a customer actually asks for. */
const productCases: Array<{ category: string; request: string; refs: ModuleRef[]; expect: string[] }> = [
  {
    category: "vocal",
    request: "warm vocal compressor with a tilt EQ, a little saturation and a blend control",
    refs: [
      { instanceId: "tilt", moduleId: "zarlino.eq.tilt" },
      { instanceId: "comp", moduleId: "zarlino.dynamics.compressor" },
      { instanceId: "sat", moduleId: "zarlino.saturation" },
    ],
    expect: ["zarlino.eq.tilt", "zarlino.dynamics.compressor", "zarlino.saturation"],
  },
  {
    category: "vocal",
    request: "de-esser that tames sibilance without dulling the voice",
    refs: [{ instanceId: "ess", moduleId: "zarlino.dynamics.deesser", values: { freqHz: 6500, thresholdDb: -30 } }],
    expect: ["zarlino.dynamics.deesser"],
  },
  {
    category: "drum",
    request: "punchy drum bus with transient shaping, glue compression and controlled saturation",
    refs: [
      { instanceId: "transient", moduleId: "zarlino.shaping.transient" },
      { instanceId: "glue", moduleId: "zarlino.dynamics.compressor" },
      { instanceId: "drive", moduleId: "zarlino.saturation.clipper" },
    ],
    expect: ["zarlino.shaping.transient", "zarlino.dynamics.compressor", "zarlino.saturation.clipper"],
  },
  {
    category: "bass",
    request: "bass DI with a high-pass, an exciter for definition and a limiter",
    refs: [
      { instanceId: "hp", moduleId: "zarlino.filter.multimode" },
      { instanceId: "air", moduleId: "zarlino.saturation.exciter" },
      { instanceId: "safe", moduleId: "zarlino.limiter" },
    ],
    expect: ["zarlino.filter.multimode", "zarlino.saturation.exciter", "zarlino.limiter"],
  },
  {
    category: "guitar",
    request: "subtle chorus for guitar with only depth, movement and mix",
    refs: [{ instanceId: "chorus", moduleId: "zarlino.modulation.chorus" }],
    expect: ["zarlino.modulation.chorus"],
  },
  {
    category: "guitar",
    request: "flanger for guitar with a slow sweep and feedback",
    refs: [{ instanceId: "flange", moduleId: "zarlino.modulation.flanger" }],
    expect: ["zarlino.modulation.flanger"],
  },
  {
    category: "mix bus",
    request: "transparent mix-bus processor with gentle compression and width control",
    refs: [
      { instanceId: "comp", moduleId: "zarlino.dynamics.compressor" },
      { instanceId: "width", moduleId: "zarlino.stereo.midside" },
    ],
    expect: ["zarlino.dynamics.compressor", "zarlino.stereo.midside"],
  },
  {
    category: "mastering",
    request: "mastering chain: EQ, glue compression, stereo width and a brick-wall limiter",
    refs: [
      { instanceId: "eq", moduleId: "zarlino.eq.parametric" },
      { instanceId: "glue", moduleId: "zarlino.dynamics.compressor" },
      { instanceId: "width", moduleId: "zarlino.stereo.width" },
      { instanceId: "limit", moduleId: "zarlino.limiter" },
    ],
    expect: ["zarlino.eq.parametric", "zarlino.dynamics.compressor", "zarlino.stereo.width", "zarlino.limiter"],
  },
  {
    category: "spatial",
    request: "dark vocal reverb that sits behind the vocal",
    refs: [
      { instanceId: "verb", moduleId: "zarlino.reverb.algorithmic", values: { predelayMs: 40, damping: 0.8, mix: 0.3 } },
    ],
    expect: ["zarlino.reverb.algorithmic"],
  },
  {
    category: "time",
    request: "wide ping-pong delay that stays out of the way",
    refs: [{ instanceId: "delay", moduleId: "zarlino.delay.stereo", values: { pingPong: 1, timeMs: 375, mix: 0.3 } }],
    expect: ["zarlino.delay.stereo"],
  },
  {
    category: "time",
    request: "slapback delay with a dark repeat",
    refs: [{ instanceId: "slap", moduleId: "zarlino.delay.stereo", values: { timeMs: 90, dampHz: 3000, feedback: 0.15 } }],
    expect: ["zarlino.delay.stereo"],
  },
  {
    category: "modulation",
    request: "phaser for keys with slow movement",
    refs: [{ instanceId: "phase", moduleId: "zarlino.modulation.phaser", values: { rateHz: 0.2, depth: 0.8 } }],
    expect: ["zarlino.modulation.phaser"],
  },
  {
    category: "modulation",
    request: "auto-pan for percussion",
    refs: [{ instanceId: "pan", moduleId: "zarlino.modulation.tremolo", values: { rateHz: 2, depth: 0.9, stereoPhase: 0.5 } }],
    expect: ["zarlino.modulation.tremolo"],
  },
  {
    category: "dynamics",
    request: "noise gate with hysteresis for a drum room mic",
    refs: [{ instanceId: "gate", moduleId: "zarlino.dynamics.gate" }],
    expect: ["zarlino.dynamics.gate"],
  },
  {
    category: "distortion",
    request: "hard clipper to tame peaks on a synth bus",
    refs: [{ instanceId: "clip", moduleId: "zarlino.saturation.clipper", values: { mode: 1, driveDb: 12 } }],
    expect: ["zarlino.saturation.clipper"],
  },
  {
    category: "stereo",
    request: "mono the bass but keep the top wide",
    refs: [{ instanceId: "ms", moduleId: "zarlino.stereo.midside", values: { width: 1.4, bassMonoHz: 180 } }],
    expect: ["zarlino.stereo.midside"],
  },
  {
    category: "analogue",
    request: "tape and tube colour across the drum bus",
    refs: [
      { instanceId: "tape", moduleId: "zarlino.saturation.tape", values: { driveDb: 4, bumpDb: 2.5, hfHz: 11000 } },
      { instanceId: "tube", moduleId: "zarlino.saturation.tube", values: { driveDb: 6, bias: 0.4, sag: 0.35 } },
      { instanceId: "iron", moduleId: "zarlino.saturation.transformer", values: { driveDb: 3, splitHz: 200 } },
    ],
    expect: ["zarlino.saturation.tape", "zarlino.saturation.tube", "zarlino.saturation.transformer"],
  },
  {
    category: "analogue",
    request: "console-style drive with an iron transformer at the output",
    refs: [
      { instanceId: "iron", moduleId: "zarlino.saturation.transformer" },
      { instanceId: "trim", moduleId: "zarlino.gain" },
    ],
    expect: ["zarlino.saturation.transformer", "zarlino.gain"],
  },
  {
    category: "guitar",
    request: "a warm amp-style colour for a DI guitar with a tone control",
    refs: [
      { instanceId: "pre", moduleId: "zarlino.saturation.tube", values: { driveDb: 12, bias: 0.45 } },
      { instanceId: "tone", moduleId: "zarlino.eq.parametric" },
    ],
    expect: ["zarlino.saturation.tube", "zarlino.eq.parametric"],
  },
  {
    category: "utility",
    request: "trim with polarity flip and a blend control",
    refs: [
      { instanceId: "gain", moduleId: "zarlino.gain" },
      { instanceId: "blend", moduleId: "zarlino.mix.drywet" },
    ],
    expect: ["zarlino.gain", "zarlino.mix.drywet"],
  },
  {
    category: "creative",
    request: "creative multi-stage: filter into chorus into reverb into a limiter",
    refs: [
      { instanceId: "filter", moduleId: "zarlino.filter.multimode" },
      { instanceId: "chorus", moduleId: "zarlino.modulation.chorus" },
      { instanceId: "verb", moduleId: "zarlino.reverb.algorithmic" },
      { instanceId: "safe", moduleId: "zarlino.limiter" },
    ],
    expect: ["zarlino.filter.multimode", "zarlino.modulation.chorus", "zarlino.reverb.algorithmic", "zarlino.limiter"],
  },
];

/** Requests the factory must keep refusing: no module in the set can do these. */
const unsupportedCases: Array<{ request: string; family: string }> = [
  { request: "a convolution reverb with an impulse response of a real cathedral", family: "convolution" },
  { request: "a wavetable synth with three oscillators", family: "instrument" },
  { request: "an octaver that shifts me down a fifth", family: "pitch" },
  { request: "a 4x12 speaker simulation with a cabinet impulse", family: "cabinet" },
  { request: "a multiband compressor with four bands and sidechain input", family: "multiband" },
  { request: "a linear-phase mastering EQ", family: "linear-phase" },
];

// ---------------------------------------------------------------------------
// The benchmark
// ---------------------------------------------------------------------------

describe("processor space benchmark", () => {
  it("every certified module is expressible in a valid PluginSpec", () => {
    const failures: string[] = [];
    const coverage: Record<string, number> = {};

    for (const testCase of moduleCases) {
      const result = validate(testCase.refs);
      if (!result.ok) {
        failures.push(`${testCase.refs[0]!.moduleId}: ${result.error.code} ${result.error.path}`);
        continue;
      }
      coverage[testCase.category] = (coverage[testCase.category] ?? 0) + 1;
    }

    expect(failures).toEqual([]);
    expect(moduleCases.length).toBeGreaterThanOrEqual(24);

    // Every family the catalogue claims must be reachable from a spec.
    for (const category of ["dynamics", "equalizer", "filter", "limiter", "mixing", "saturation", "shaping", "stereo", "utility"]) {
      expect(coverage[category] ?? 0, `catalogue category '${category}' must be expressible`).toBeGreaterThan(0);
    }
  });

  it("builds every product case across the plugin categories", () => {
    const rows: Array<{ category: string; request: string; modules: number; controls: number; templates: number }> = [];
    const failures: string[] = [];

    for (const testCase of productCases) {
      const parsed = validate(testCase.refs, { name: testCase.category });
      if (!parsed.ok) {
        failures.push(`${testCase.request}: ${parsed.error.code} ${parsed.error.path}`);
        continue;
      }

      const plan = compilePlan(parsed.spec);
      const chain = plan.chain.map((module) => module.moduleId);
      expect(chain).toEqual(testCase.expect);

      const templates = previewAllTemplates(parsed.spec);
      expect(templates).toHaveLength(3);
      // An interface with no controls is not an interface.
      for (const template of templates) expect(template.controls.length).toBeGreaterThan(0);

      rows.push({
        category: testCase.category,
        request: testCase.request,
        modules: chain.length,
        controls: plan.parameters.length,
        templates: templates.length,
      });
    }

    expect(failures).toEqual([]);

    // One product per category the benchmark claims to cover.
    const categories = new Set(rows.map((row) => row.category));
    for (const required of ["vocal", "drum", "bass", "guitar", "mix bus", "mastering", "spatial", "time", "modulation", "dynamics", "distortion", "stereo", "utility", "creative", "analogue"]) {
      expect(categories.has(required), `benchmark must cover '${required}'`).toBe(true);
    }

    expect(rows.length).toBe(productCases.length);
  });

  it("still refuses the requests the DSP cannot express", () => {
    const wrong: string[] = [];

    for (const testCase of unsupportedCases) {
      const hint = detectUnsupportedRequest(testCase.request);
      if (!hint) wrong.push(`${testCase.request} was not recognised as unsupported`);
      else expect(hint.message.length).toBeGreaterThan(20);
    }

    expect(wrong).toEqual([]);
  });

  it("no longer refuses the families that are now certified", () => {
    // These were refused before the Wave 2 primitives existed. The detector is
    // the cheapest place to accidentally keep a capability hidden.
    for (const request of [
      "a lush plate reverb with a long tail",
      "a ping-pong delay synced to the track",
      "a gentle chorus for a clean guitar",
      "a flanger with slow movement",
      "a phaser for the keys",
      "a tremolo that pulses with the beat",
      "an auto-pan for percussion",
      "a de-esser for the vocal",
      "a clipper to tame peaks",
      "an exciter for air on the vocal",
      "make the bass mono below 120 Hz but keep the top wide",
      "a tape machine warming up the mix bus",
      "a driven tube preamp for the vocal",
      "iron transformer colour on the drum bus",
      "an analogue console emulation for the whole mix",
      "a warm guitar amp tone with a tone stack",
    ]) {
      expect(detectUnsupportedRequest(request), `'${request}' must be buildable now`).toBeNull();
    }
  });
});
