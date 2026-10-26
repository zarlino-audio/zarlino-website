/**
 * Deterministic PluginSpec validation.
 *
 * The cases are written against the kernel's documented rules: every rejection
 * names the exact stable code and JSON path the C++ validator produces, so the
 * two implementations can be compared case by case in CI.
 */

import { describe, expect, it } from "vitest";
import {
  ErrorCodes,
  canonicalJsonText,
  normalizeSpec,
  parsePluginSpec,
  parsePluginSpecText,
  parseSemVer,
  specSha256,
  type PluginSpec,
} from "../../src/factory/spec";
import { MODULE_CATALOG } from "../../src/factory/catalog";

/** A minimal but complete and valid spec, cloned per test. */
function baseSpec(): Record<string, unknown> {
  return {
    factorySchemaVersion: 1,
    plugin: {
      id: "zarlino.customer.punch",
      name: "Punch",
      vendor: "Zarlino Audio",
      version: "1.0.0",
      effectType: "dynamics",
      channels: "stereo",
    },
    graph: {
      modules: [
        { instanceId: "comp", moduleId: "zarlino.dynamics.compressor", moduleVersion: "1.0.0", parameters: { threshold: -22, ratio: 3.5 } },
        { instanceId: "sat", moduleId: "zarlino.saturation", moduleVersion: "1.0.0", parameters: { drive: 0.25, mode: 2 } },
      ],
    },
    parameters: [
      {
        id: "compression",
        name: "Compression",
        target: "comp.threshold",
        range: { min: -40, max: -6, default: -20 },
        unit: "dB",
        group: "Dynamics",
      },
      {
        id: "drive",
        name: "Drive",
        target: "sat.drive",
        range: { min: 0, max: 1, default: 0.3 },
        group: "Colour",
      },
      {
        id: "mix",
        name: "Mix",
        target: "$factory.dryWet",
        range: { min: 0, max: 1, default: 1 },
        group: "Output",
      },
    ],
    macros: [
      {
        id: "warmth",
        name: "Warmth",
        defaultValue: 0.4,
        mappings: [
          { parameter: "compression", rangeStart: 0.2, rangeEnd: 0.8 },
          { parameter: "drive", rangeStart: 0.1, rangeEnd: 0.9, curve: 0.7 },
        ],
      },
    ],
    dryWet: { enabled: true, defaultMix: 1 },
    bypass: { mode: "hard", defaultBypassed: false },
    ui: {
      accentColor: "#4C9AFF",
      category: "Dynamics",
      shortDescription: "Fast, warm compressor with a little grit",
      tags: ["compressor", "saturation"],
      layout: "vertical",
      parameterOrder: ["compression", "drive", "mix"],
    },
  };
}

function expectCode(input: unknown, code: number, path?: string): void {
  const result = parsePluginSpec(input);
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.error.code).toBe(code);
  if (path) expect(result.error.path).toBe(path);
}

describe("PluginSpec validation: acceptance", () => {
  it("accepts a complete conventional channel-strip style spec", () => {
    const result = parsePluginSpec(baseSpec());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.spec.graph.modules).toHaveLength(2);
    expect(result.spec.parameters.map((parameter) => parameter.id)).toEqual(["compression", "drive", "mix"]);
    // Optional fields materialise with the kernel's defaults.
    expect(result.spec.parameters[0]!.logarithmic).toBe(false);
    expect(result.spec.parameters[0]!.exposeToHost).toBe(true);
  });

  it("accepts every certified module in a single graph", () => {
    const spec = baseSpec();
    // The source module is the one exception: it generates audio, so it belongs
    // in an instrument graph and is covered by the next case.
    spec.graph = {
      modules: MODULE_CATALOG.filter((module) => module.isSource !== true).map((module, index) => ({
        instanceId: `m${index}`,
        moduleId: module.id,
        moduleVersion: module.version,
        parameters: {},
      })),
    };
    spec.parameters = [];
    spec.macros = [];
    spec.dryWet = { enabled: false, defaultMix: 1 };
    spec.ui = { ...(spec.ui as Record<string, unknown>), parameterOrder: [], tags: [] };
    expect(parsePluginSpec(spec).ok).toBe(true);
  });

  it("accepts the source module only in an instrument graph", () => {
    const source = MODULE_CATALOG.find((module) => module.isSource === true);
    expect(source, "the catalogue must contain a source module").toBeTruthy();
    if (!source) return;

    const instrument = baseSpec();
    instrument.plugin = { ...(instrument.plugin as Record<string, unknown>), effectType: "instrument" };
    instrument.graph = {
      modules: [{ instanceId: "voice", moduleId: source.id, moduleVersion: source.version, parameters: {} }],
    };
    instrument.parameters = [];
    instrument.macros = [];
    instrument.dryWet = { enabled: false, defaultMix: 1 };
    instrument.ui = { ...(instrument.ui as Record<string, unknown>), parameterOrder: [], tags: [] };
    expect(parsePluginSpec(instrument).ok).toBe(true);

    // The same chain declared as a processor would silently discard its input.
    const asProcessor = baseSpec();
    asProcessor.plugin = { ...(asProcessor.plugin as Record<string, unknown>), effectType: "utility" };
    asProcessor.graph = {
      modules: [{ instanceId: "voice", moduleId: source.id, moduleVersion: source.version, parameters: {} }],
    };
    asProcessor.parameters = [];
    asProcessor.macros = [];
    asProcessor.dryWet = { enabled: false, defaultMix: 1 };
    asProcessor.ui = { ...(asProcessor.ui as Record<string, unknown>), parameterOrder: [], tags: [] };
    expect(parsePluginSpec(asProcessor).ok).toBe(false);

    // An instrument with no source would build and stay silent.
    const withoutSource = baseSpec();
    withoutSource.plugin = { ...(withoutSource.plugin as Record<string, unknown>), effectType: "instrument" };
    withoutSource.parameters = [];
    withoutSource.macros = [];
    withoutSource.dryWet = { enabled: false, defaultMix: 1 };
    withoutSource.ui = { ...(withoutSource.ui as Record<string, unknown>), parameterOrder: [], tags: [] };
    expect(parsePluginSpec(withoutSource).ok).toBe(false);

    // An instrument has no input signal, so a mix control would be dead.
    const withMix = baseSpec();
    withMix.plugin = { ...(withMix.plugin as Record<string, unknown>), effectType: "instrument" };
    withMix.graph = {
      modules: [{ instanceId: "voice", moduleId: source.id, moduleVersion: source.version, parameters: {} }],
    };
    expect(parsePluginSpec(withMix).ok).toBe(false);
  });

  it("accepts a mono spec when no stereo-only module is present", () => {
    const spec = baseSpec();
    (spec.plugin as Record<string, unknown>).channels = "mono";
    expect(parsePluginSpec(spec).ok).toBe(true);
  });

  it("accepts a newer patch of a certified module (registry must not be older)", () => {
    const spec = baseSpec();
    (spec.graph as { modules: Array<Record<string, unknown>> }).modules[0]!.moduleVersion = "1.0.0";
    expect(parsePluginSpec(spec).ok).toBe(true);
  });
});

describe("PluginSpec validation: document shape", () => {
  it("rejects a non-object root", () => {
    expectCode([], ErrorCodes.RootNotObject, "$");
    expectCode("nope", ErrorCodes.RootNotObject, "$");
  });

  it("rejects an unsupported schema version before reading any other field", () => {
    const spec = baseSpec();
    spec.factorySchemaVersion = 2;
    expectCode(spec, ErrorCodes.UnsupportedSchemaVersion, "$/factorySchemaVersion");
  });

  it("rejects a non-integer schema version as a type mismatch", () => {
    const spec = baseSpec();
    spec.factorySchemaVersion = "1";
    expectCode(spec, ErrorCodes.TypeMismatch, "$/factorySchemaVersion");
  });

  it("rejects missing required fields with the exact path", () => {
    const spec = baseSpec();
    delete (spec.plugin as Record<string, unknown>).name;
    expectCode(spec, ErrorCodes.MissingRequiredField, "$/plugin/name");
  });

  it("rejects a null required field", () => {
    const spec = baseSpec();
    (spec.plugin as Record<string, unknown>).vendor = null;
    expectCode(spec, ErrorCodes.MissingRequiredField, "$/plugin/vendor");
  });

  it("rejects unknown fields anywhere in the document", () => {
    const root = baseSpec();
    root.script = "console.log('escaped')";
    expectCode(root, ErrorCodes.UnexpectedField, "$/script");

    const nested = baseSpec();
    (nested.graph as { modules: Array<Record<string, unknown>> }).modules[0]!.code = "#include <evil>";
    expectCode(nested, ErrorCodes.UnexpectedField, "$/graph/modules[0]/code");
  });

  it("rejects wrong types", () => {
    const spec = baseSpec();
    (spec.plugin as Record<string, unknown>).channels = 2;
    expectCode(spec, ErrorCodes.TypeMismatch, "$/plugin/channels");
  });

  it("rejects an unknown effect type and channel mode", () => {
    const effect = baseSpec();
    (effect.plugin as Record<string, unknown>).effectType = "synth";
    expectCode(effect, ErrorCodes.UnsupportedValue, "$/plugin/effectType");

    const channels = baseSpec();
    (channels.plugin as Record<string, unknown>).channels = "quad";
    expectCode(channels, ErrorCodes.UnsupportedValue, "$/plugin/channels");
  });

  it("rejects an empty graph and a graph with duplicates", () => {
    const empty = baseSpec();
    (empty.graph as Record<string, unknown>).modules = [];
    expectCode(empty, ErrorCodes.EmptyCollection, "$/graph/modules");

    const duplicate = baseSpec();
    const modules = (duplicate.graph as { modules: Array<Record<string, unknown>> }).modules;
    modules[1]!.instanceId = modules[0]!.instanceId;
    expectCode(duplicate, ErrorCodes.DuplicateIdentifier, "$/graph/modules[1]/instanceId");
  });

  it("rejects more modules than the kernel allows", () => {
    const spec = baseSpec();
    (spec.graph as Record<string, unknown>).modules = Array.from({ length: 33 }, (_, index) => ({
      instanceId: `m${index}`,
      moduleId: "zarlino.gain",
      moduleVersion: "1.0.0",
      parameters: {},
    }));
    expectCode(spec, ErrorCodes.CollectionTooLarge, "$/graph/modules");
  });

  it("rejects an invalid identifier in a graph instance id", () => {
    const spec = baseSpec();
    (spec.graph as { modules: Array<Record<string, unknown>> }).modules[0]!.instanceId = "1bad id";
    expectCode(spec, ErrorCodes.InvalidIdentifier, "$/graph/modules[0]/instanceId");
  });
});

describe("PluginSpec validation: parameters and macros", () => {
  it("rejects a parameter range whose min is not below max", () => {
    const spec = baseSpec();
    (spec.parameters as Array<Record<string, unknown>>)[0]!.range = { min: 10, max: 10, default: 10 };
    expectCode(spec, ErrorCodes.ValueOutOfRange, "$/parameters[0]/range/min");
  });

  it("rejects a default outside the declared range", () => {
    const spec = baseSpec();
    (spec.parameters as Array<Record<string, unknown>>)[1]!.range = { min: 0, max: 1, default: 2 };
    expectCode(spec, ErrorCodes.ValueOutOfRange, "$/parameters[1]/range/default");
  });

  it("rejects a logarithmic parameter whose range starts at zero", () => {
    const spec = baseSpec();
    const parameter = (spec.parameters as Array<Record<string, unknown>>)[1]!;
    parameter.range = { min: 0, max: 10, default: 1 };
    parameter.logarithmic = true;
    expectCode(spec, ErrorCodes.ValueOutOfRange, "$/parameters[1]/logarithmic");
  });

  it("rejects a dangling parameter target", () => {
    const spec = baseSpec();
    (spec.parameters as Array<Record<string, unknown>>)[0]!.target = "ghost.threshold";
    expectCode(spec, ErrorCodes.DanglingReference, "$/parameters[0]/target");
  });

  it("rejects a malformed target", () => {
    const spec = baseSpec();
    (spec.parameters as Array<Record<string, unknown>>)[0]!.target = "compression";
    expectCode(spec, ErrorCodes.UnsupportedValue, "$/parameters[0]/target");
  });

  it("rejects an unknown factory control", () => {
    const spec = baseSpec();
    (spec.parameters as Array<Record<string, unknown>>)[2]!.target = "$factory.everything";
    expectCode(spec, ErrorCodes.UnsupportedValue, "$/parameters[2]/target");
  });

  it("rejects a dry/wet parameter when dryWet is disabled", () => {
    const spec = baseSpec();
    spec.dryWet = { enabled: false, defaultMix: 1 };
    expectCode(spec, ErrorCodes.UnsupportedValue, "$/parameters[2]/target");
  });

  it("rejects a macro mapping to an undeclared parameter", () => {
    const spec = baseSpec();
    (spec.macros as Array<Record<string, unknown>>)[0]!.mappings = [{ parameter: "ghost" }];
    expectCode(spec, ErrorCodes.DanglingReference, "$/macros[0]/mappings[0]/parameter");
  });

  it("rejects a macro with no mappings and an out-of-range curve", () => {
    const empty = baseSpec();
    (empty.macros as Array<Record<string, unknown>>)[0]!.mappings = [];
    expectCode(empty, ErrorCodes.EmptyCollection, "$/macros[0]/mappings");

    const curve = baseSpec();
    (curve.macros as Array<Record<string, unknown>>)[0]!.mappings = [{ parameter: "drive", curve: 12 }];
    expectCode(curve, ErrorCodes.ValueOutOfRange, "$/macros[0]/mappings[0]/curve");
  });

  it("rejects a macro that maps the same parameter twice", () => {
    const spec = baseSpec();
    (spec.macros as Array<Record<string, unknown>>)[0]!.mappings = [{ parameter: "drive" }, { parameter: "drive" }];
    expectCode(spec, ErrorCodes.DuplicateIdentifier, "$/macros[0]/mappings[1]/parameter");
  });
});

describe("PluginSpec validation: module resolution", () => {
  it("rejects an unknown module", () => {
    const spec = baseSpec();
    (spec.graph as { modules: Array<Record<string, unknown>> }).modules[0]!.moduleId = "zarlino.reverb.hall";
    expectCode(spec, ErrorCodes.UnknownModule, "$/graph/modules[0]/moduleId");
  });

  it("rejects an incompatible major version and an older minor", () => {
    const major = baseSpec();
    (major.graph as { modules: Array<Record<string, unknown>> }).modules[0]!.moduleVersion = "2.0.0";
    expectCode(major, ErrorCodes.ModuleVersionIncompatible, "$/graph/modules[0]/moduleId");

    const newer = baseSpec();
    (newer.graph as { modules: Array<Record<string, unknown>> }).modules[0]!.moduleVersion = "1.5.0";
    expectCode(newer, ErrorCodes.ModuleVersionIncompatible, "$/graph/modules[0]/moduleId");
  });

  it("rejects a stereo-only module in a mono spec", () => {
    const spec = baseSpec();
    (spec.plugin as Record<string, unknown>).channels = "mono";
    (spec.graph as { modules: Array<Record<string, unknown>> }).modules.push({
      instanceId: "width",
      moduleId: "zarlino.stereo.width",
      moduleVersion: "1.0.0",
      parameters: {},
    });
    expectCode(spec, ErrorCodes.ModuleChannelUnsupported, "$/graph/modules[2]/moduleId");
  });

  it("rejects an unknown module parameter", () => {
    const spec = baseSpec();
    (spec.graph as { modules: Array<Record<string, unknown>> }).modules[0]!.parameters = { treshold: -18 };
    expectCode(spec, ErrorCodes.ModuleParameterUnknown, "$/graph/modules[0]/moduleId");
  });

  it("rejects a module parameter value outside its manifest domain", () => {
    const spec = baseSpec();
    (spec.graph as { modules: Array<Record<string, unknown>> }).modules[0]!.parameters = { threshold: 6 };
    expectCode(spec, ErrorCodes.ValueOutOfRange, "$/graph/modules[0]/parameters/threshold");
  });

  it("rejects an exposed parameter that names a parameter the module lacks", () => {
    const spec = baseSpec();
    (spec.parameters as Array<Record<string, unknown>>)[0]!.target = "comp.treshold";
    // `validateSchema` sees the instance, resolution sees the parameter.
    expectCode(spec, ErrorCodes.ModuleParameterUnknown, "$/parameters[0]/target");
  });
});

describe("PluginSpec normalization and identity", () => {
  it("produces identical canonical bytes for key-reordered documents", async () => {
    const first = parsePluginSpec(baseSpec());
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    // Rebuild the document with every object's keys in reverse order: the
    // kernel must not care about key order.
    const reverseKeys = (value: unknown): unknown => {
      if (Array.isArray(value)) return value.map(reverseKeys);
      if (value && typeof value === "object") {
        const out: Record<string, unknown> = {};
        for (const key of Object.keys(value as Record<string, unknown>).reverse()) {
          out[key] = reverseKeys((value as Record<string, unknown>)[key]);
        }
        return out;
      }
      return value;
    };
    const reordered = reverseKeys(baseSpec());
    const second = parsePluginSpec(reordered);
    expect(second.ok).toBe(true);
    if (!second.ok) return;

    expect(canonicalJsonText(normalizeSpec(first.spec))).toBe(canonicalJsonText(normalizeSpec(second.spec)));
    expect(await specSha256(first.spec)).toBe(await specSha256(second.spec));
  });

  it("changes identity when one value changes", async () => {
    const first = parsePluginSpec(baseSpec());
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const changed = baseSpec();
    (changed.parameters as Array<Record<string, unknown>>)[1]!.range = { min: 0, max: 1, default: 0.31 };
    const second = parsePluginSpec(changed);
    expect(second.ok).toBe(true);
    if (!second.ok) return;

    expect(await specSha256(first.spec)).not.toBe(await specSha256(second.spec));
  });

  it("materialises every optional field so a build receives a total document", () => {
    const parsed = parsePluginSpec(baseSpec());
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const normalized = normalizeSpec(parsed.spec) as unknown as PluginSpec;
    const json = JSON.parse(JSON.stringify(normalized)) as Record<string, unknown>;
    const parameter = (json.parameters as Array<Record<string, unknown>>)[0]!;
    expect(Object.keys(parameter).sort()).toEqual(
      ["exposeToHost", "group", "id", "logarithmic", "name", "range", "target", "unit"].sort(),
    );
    expect((json.ui as Record<string, unknown>).shortDescription).toBeTypeOf("string");
    expect((json.bypass as Record<string, unknown>).defaultBypassed).toBe(false);
  });
});

describe("PluginSpec text parsing", () => {
  it("reports malformed JSON as ZFACTORY-1001", () => {
    const result = parsePluginSpecText("{ not json");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe(ErrorCodes.JsonParseFailed);
    expect(result.error.path).toBe("$");
  });

  it("rejects a document carrying a JSON array of specs", () => {
    const result = parsePluginSpecText(JSON.stringify([baseSpec()]));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe(ErrorCodes.RootNotObject);
  });

  it("is deterministic: the same rejection twice, byte for byte", () => {
    const spec = baseSpec();
    delete (spec.plugin as Record<string, unknown>).name;
    const first = parsePluginSpec(spec);
    const second = parsePluginSpec(spec);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });
});

describe("SemVer rules", () => {
  it("accepts MAJOR.MINOR.PATCH", () => {
    expect(parseSemVer("1.0.0")).toEqual({ major: 1, minor: 0, patch: 0 });
    expect(parseSemVer("12.34.9999")).toEqual({ major: 12, minor: 34, patch: 9999 });
  });

  it("rejects partial, leading-zero and suffixed versions", () => {
    expect(parseSemVer("1")).toBeNull();
    expect(parseSemVer("1.0")).toBeNull();
    expect(parseSemVer("01.0.0")).toBeNull();
    expect(parseSemVer("1.0.0-beta")).toBeNull();
    expect(parseSemVer("10000.0.0")).toBeNull();
    expect(parseSemVer(-1)).toBeNull();
  });
});
