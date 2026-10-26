/**
 * Deterministic PluginSpec validation for the customer application.
 *
 * This is a faithful TypeScript port of the kernel's two validation phases
 * (`factory/src/PluginSpec.cpp` and `factory/src/ModuleRegistry.cpp`):
 *
 *   1. document shape (strict: every field required unless documented optional,
 *      unknown fields rejected, every failure carries a stable code + JSON path),
 *   2. module resolution against the certified catalogue (module exists, version
 *      compatible, channel domain matches, parameter ids and ranges are real).
 *
 * Why a port instead of trusting the model or the build: money is spent at
 * dispatch time. The authoritative gate stays the C++ kernel inside the build
 * (defence in depth); this port is the pre-flight that stops a bad document
 * before anything is paid for.
 *
 * Nothing here can execute user text. A spec is pure data, and the only values
 * that ever reach a compiler are numbers and identifiers drawn from this file.
 */

import { findModule } from "./catalog";

export const SCHEMA_VERSION = 1;
export const MAX_GRAPH_MODULES = 32;
export const MAX_EXPOSED_PARAMETERS = 64;
export const MAX_MACROS = 16;
export const MAX_MACRO_MAPPINGS = 256;

export const FACTORY_INSTANCE_ID = "$factory";
export const FACTORY_DRY_WET = "dryWet";
export const FACTORY_BYPASS = "bypass";

export const EFFECT_TYPES = [
  "utility",
  "filter",
  "equalizer",
  "dynamics",
  "saturation",
  "limiter",
  "transient-shaper",
  "stereo-utility",
  "channel-strip",
  "vocal-processor",
  "instrument",
] as const;
export type EffectType = (typeof EFFECT_TYPES)[number];

export const CHANNEL_MODES = ["mono", "stereo"] as const;

/** Error codes mirror `zfactory::ErrorCode` so the two implementations can be compared. */
export const ErrorCodes = {
  JsonParseFailed: 1001,
  RootNotObject: 1002,
  MissingRequiredField: 1003,
  UnexpectedField: 1004,
  TypeMismatch: 1005,
  ValueOutOfRange: 1006,
  UnsupportedSchemaVersion: 1007,
  UnsupportedValue: 1008,
  EmptyCollection: 1009,
  DuplicateIdentifier: 1010,
  DanglingReference: 1011,
  InvalidIdentifier: 1012,
  CollectionTooLarge: 1013,
  UnknownModule: 2001,
  ModuleVersionIncompatible: 2002,
  ModuleNotCertified: 2003,
  ModuleChannelUnsupported: 2004,
  ModuleSampleRateUnsupported: 2005,
  ModuleParameterUnknown: 2006,
  ModuleDependencyMissing: 2007,
  GraphEmpty: 3001,
  GraphTooLong: 3002,
} as const;

export interface SpecError {
  code: number;
  path: string;
  message: string;
}

export function describeSpecError(error: SpecError): string {
  return `ZFACTORY-${error.code} ${error.path}: ${error.message}`;
}

// ---------------------------------------------------------------------------
// The normalized document
// ---------------------------------------------------------------------------

export interface SpecParameterRange {
  min: number;
  max: number;
  default: number;
}

export interface SpecParameter {
  id: string;
  name: string;
  target: string;
  range: SpecParameterRange;
  unit: string;
  logarithmic: boolean;
  group: string;
  exposeToHost: boolean;
}

export interface SpecMacroMapping {
  parameter: string;
  rangeStart: number;
  rangeEnd: number;
  curve: number;
  scale: number;
  invert: boolean;
}

export interface SpecMacro {
  id: string;
  name: string;
  defaultValue: number;
  mappings: SpecMacroMapping[];
}

export interface SpecModuleInstance {
  instanceId: string;
  moduleId: string;
  moduleVersion: string;
  parameters: Record<string, number>;
}

export interface PluginSpec {
  factorySchemaVersion: number;
  plugin: {
    id: string;
    name: string;
    vendor: string;
    version: string;
    effectType: EffectType | string;
    channels: "mono" | "stereo";
  };
  graph: { modules: SpecModuleInstance[] };
  parameters: SpecParameter[];
  macros: SpecMacro[];
  dryWet: { enabled: boolean; defaultMix: number };
  bypass: { mode: string; defaultBypassed: boolean };
  ui: {
    accentColor: string;
    category: string;
    shortDescription: string;
    tags: string[];
    layout: "vertical" | "horizontal" | string;
    parameterOrder: string[];
  };
}

// ---------------------------------------------------------------------------
// Small helpers, ported from factory/src/JsonUtil.cpp
// ---------------------------------------------------------------------------

type JsonObject = Record<string, unknown>;

const ROOT_KEYS = [
  "factorySchemaVersion",
  "plugin",
  "graph",
  "parameters",
  "macros",
  "dryWet",
  "bypass",
  "ui",
] as const;
const PLUGIN_KEYS = ["id", "name", "vendor", "version", "effectType", "channels"] as const;
const GRAPH_KEYS = ["modules"] as const;
const MODULE_KEYS = ["instanceId", "moduleId", "moduleVersion", "parameters"] as const;
const PARAMETER_KEYS = ["id", "name", "target", "range", "unit", "logarithmic", "group", "exposeToHost"] as const;
const RANGE_KEYS = ["min", "max", "default"] as const;
const MACRO_KEYS = ["id", "name", "defaultValue", "mappings"] as const;
const MAPPING_KEYS = ["parameter", "rangeStart", "rangeEnd", "curve", "scale", "invert"] as const;
const DRY_WET_KEYS = ["enabled", "defaultMix"] as const;
const BYPASS_KEYS = ["mode", "defaultBypassed"] as const;
const UI_KEYS = ["accentColor", "category", "shortDescription", "tags", "layout", "parameterOrder"] as const;

function isPlainObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function childPath(base: string, key: string): string {
  return `${base}/${key}`;
}

function indexPath(base: string, index: number): string {
  return `${base}[${index}]`;
}

function isIdentStart(ch: string): boolean {
  return (ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z");
}

function isIdentRest(ch: string): boolean {
  return isIdentStart(ch) || (ch >= "0" && ch <= "9") || ch === "." || ch === "_" || ch === "-";
}

/** Same rule as `json::isValidIdentifier`: 1..64 chars, letter first. */
export function isValidIdentifier(text: unknown): boolean {
  if (typeof text !== "string" || text.length === 0 || text.length > 64) return false;
  if (!isIdentStart(text[0]!)) return false;
  for (let i = 1; i < text.length; i += 1) if (!isIdentRest(text[i]!)) return false;
  return true;
}

/** Same rule as `parseSemVer`: MAJOR.MINOR.PATCH, 0..9999, no leading zeros. */
export function parseSemVer(text: unknown): { major: number; minor: number; patch: number } | null {
  if (typeof text !== "string") return null;
  const match = /^(\d{1,4})\.(\d{1,4})\.(\d{1,4})$/.exec(text);
  if (!match) return null;
  const parts = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (parts.some((part) => part > 9999)) return null;
  // Leading zeros would make two different strings compare equal; reject them.
  const segments = text.split(".");
  for (let i = 0; i < segments.length; i += 1) {
    if (segments[i]!.length > 1 && segments[i]!.startsWith("0")) return null;
  }
  return { major: parts[0]!, minor: parts[1]!, patch: parts[2]! };
}

function isVersionCompatible(
  requested: { major: number; minor: number; patch: number },
  available: { major: number; minor: number; patch: number },
): boolean {
  if (requested.major !== available.major) return false;
  if (available.minor !== requested.minor) return available.minor > requested.minor;
  return available.patch >= requested.patch;
}

function isHexDigit(ch: string): boolean {
  return (ch >= "0" && ch <= "9") || (ch >= "a" && ch <= "f") || (ch >= "A" && ch <= "F");
}

function isValidColour(text: string): boolean {
  if (text.length !== 7 || text[0] !== "#") return false;
  for (let i = 1; i < text.length; i += 1) if (!isHexDigit(text[i]!)) return false;
  return true;
}

function isTagValid(tag: string): boolean {
  if (tag.length === 0 || tag.length > 32) return false;
  for (const ch of tag) {
    const ok = (ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z") || (ch >= "0" && ch <= "9") || ch === "-" || ch === "_";
    if (!ok) return false;
  }
  return true;
}

function splitTarget(target: string): { instanceId: string; parameterId: string } | null {
  const dot = target.indexOf(".");
  if (dot <= 0 || dot + 1 >= target.length) return null;
  return { instanceId: target.slice(0, dot), parameterId: target.slice(dot + 1) };
}

function fail(code: number, path: string, message: string): never {
  throw new SpecErrorError({ code, path, message });
}

class SpecErrorError extends Error {
  readonly detail: SpecError;
  constructor(detail: SpecError) {
    super(describeSpecError(detail));
    this.name = "SpecErrorError";
    this.detail = detail;
  }
}

// ---------------------------------------------------------------------------
// Field readers (throwing; the public API converts to a Result)
// ---------------------------------------------------------------------------

function requireField(object: JsonObject, path: string, key: string): unknown {
  if (!Object.prototype.hasOwnProperty.call(object, key)) {
    fail(ErrorCodes.MissingRequiredField, childPath(path, key), "required field is missing");
  }
  const value = object[key];
  if (value === null || value === undefined) {
    fail(ErrorCodes.MissingRequiredField, childPath(path, key), "required field is present but null");
  }
  return value;
}

function requireString(object: JsonObject, path: string, key: string): string {
  const value = requireField(object, path, key);
  if (typeof value !== "string") {
    fail(ErrorCodes.TypeMismatch, childPath(path, key), `expected a JSON string, found ${jsonTypeName(value)}`);
  }
  return value;
}

function optionalString(object: JsonObject, path: string, key: string, fallback: string): string {
  if (!Object.prototype.hasOwnProperty.call(object, key)) return fallback;
  const value = object[key];
  if (value === null || value === undefined) return fallback;
  if (typeof value !== "string") {
    fail(ErrorCodes.TypeMismatch, childPath(path, key), `expected a JSON string, found ${jsonTypeName(value)}`);
  }
  return value;
}

function elementAsNumber(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(ErrorCodes.TypeMismatch, path, `expected a JSON number, found ${jsonTypeName(value)}`);
  }
  return value;
}

function requireNumber(object: JsonObject, path: string, key: string): number {
  return elementAsNumber(requireField(object, path, key), childPath(path, key));
}

function optionalNumber(object: JsonObject, path: string, key: string, fallback: number): number {
  if (!Object.prototype.hasOwnProperty.call(object, key)) return fallback;
  const value = object[key];
  if (value === null || value === undefined) return fallback;
  return elementAsNumber(value, childPath(path, key));
}

function requireBool(object: JsonObject, path: string, key: string): boolean {
  const value = requireField(object, path, key);
  if (typeof value !== "boolean") {
    fail(ErrorCodes.TypeMismatch, childPath(path, key), `expected a JSON boolean, found ${jsonTypeName(value)}`);
  }
  return value;
}

function optionalBool(object: JsonObject, path: string, key: string, fallback: boolean): boolean {
  if (!Object.prototype.hasOwnProperty.call(object, key)) return fallback;
  const value = object[key];
  if (value === null || value === undefined) return fallback;
  if (typeof value !== "boolean") {
    fail(ErrorCodes.TypeMismatch, childPath(path, key), `expected a JSON boolean, found ${jsonTypeName(value)}`);
  }
  return value;
}

function requireObject(object: JsonObject, path: string, key: string): JsonObject {
  const value = requireField(object, path, key);
  if (!isPlainObject(value)) {
    fail(ErrorCodes.TypeMismatch, childPath(path, key), `expected a JSON object, found ${jsonTypeName(value)}`);
  }
  return value;
}

function requireArray(object: JsonObject, path: string, key: string): unknown[] {
  const value = requireField(object, path, key);
  if (!Array.isArray(value)) {
    fail(ErrorCodes.TypeMismatch, childPath(path, key), `expected a JSON array, found ${jsonTypeName(value)}`);
  }
  return value;
}

function checkKeys(object: JsonObject, path: string, allowed: readonly string[]): void {
  const unexpected = Object.keys(object)
    .filter((key) => !allowed.includes(key))
    .sort();
  if (unexpected.length === 0) return;
  const present = Object.keys(object).sort().join(", ");
  fail(
    ErrorCodes.UnexpectedField,
    childPath(path, unexpected[0]!),
    `unexpected field (allowed: ${present})`,
  );
}

export function jsonTypeName(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") return "number";
  if (typeof value === "string") return "string";
  if (Array.isArray(value)) return "array";
  return "object";
}

// ---------------------------------------------------------------------------
// Phase 1: document shape
// ---------------------------------------------------------------------------

function parseModule(element: unknown, path: string): SpecModuleInstance {
  if (!isPlainObject(element)) {
    fail(ErrorCodes.TypeMismatch, path, `expected a JSON object, found ${jsonTypeName(element)}`);
  }
  checkKeys(element, path, MODULE_KEYS);

  const instanceId = requireString(element, path, "instanceId");
  const moduleId = requireString(element, path, "moduleId");
  const versionText = requireString(element, path, "moduleVersion");
  if (!parseSemVer(versionText)) {
    fail(ErrorCodes.TypeMismatch, childPath(path, "moduleVersion"), `moduleVersion '${versionText}' is not MAJOR.MINOR.PATCH`);
  }

  const values = requireObject(element, path, "parameters");
  const parameters: Record<string, number> = {};
  for (const [key, raw] of Object.entries(values)) {
    if (!isValidIdentifier(key)) {
      fail(ErrorCodes.InvalidIdentifier, childPath(path, `parameters/${key}`), "parameter id is not a valid identifier");
    }
    parameters[key] = elementAsNumber(raw, childPath(path, `parameters/${key}`));
  }

  return { instanceId, moduleId, moduleVersion: versionText, parameters };
}

function parseParameter(element: unknown, path: string): SpecParameter {
  if (!isPlainObject(element)) {
    fail(ErrorCodes.TypeMismatch, path, `expected a JSON object, found ${jsonTypeName(element)}`);
  }
  checkKeys(element, path, PARAMETER_KEYS);

  const id = requireString(element, path, "id");
  const name = requireString(element, path, "name");
  const target = requireString(element, path, "target");
  if (!splitTarget(target)) {
    fail(ErrorCodes.UnsupportedValue, childPath(path, "target"), `target '${target}' must be '<moduleInstanceId>.<parameterId>'`);
  }

  const range = requireObject(element, path, "range");
  const rangePath = childPath(path, "range");
  checkKeys(range, rangePath, RANGE_KEYS);

  return {
    id,
    name,
    target,
    range: {
      min: requireNumber(range, rangePath, "min"),
      max: requireNumber(range, rangePath, "max"),
      default: requireNumber(range, rangePath, "default"),
    },
    unit: optionalString(element, path, "unit", ""),
    logarithmic: optionalBool(element, path, "logarithmic", false),
    group: optionalString(element, path, "group", ""),
    exposeToHost: optionalBool(element, path, "exposeToHost", true),
  };
}

function parseMacro(element: unknown, path: string): SpecMacro {
  if (!isPlainObject(element)) {
    fail(ErrorCodes.TypeMismatch, path, `expected a JSON object, found ${jsonTypeName(element)}`);
  }
  checkKeys(element, path, MACRO_KEYS);

  const id = requireString(element, path, "id");
  const name = requireString(element, path, "name");
  const defaultValue = requireNumber(element, path, "defaultValue");
  const mappingsRaw = requireArray(element, path, "mappings");
  if (mappingsRaw.length === 0) {
    fail(ErrorCodes.EmptyCollection, childPath(path, "mappings"), `macro '${id}' has no mappings`);
  }

  const mappings = mappingsRaw.map((entry, index) => {
    const mappingPath = indexPath(childPath(path, "mappings"), index);
    if (!isPlainObject(entry)) {
      fail(ErrorCodes.TypeMismatch, mappingPath, `expected a JSON object, found ${jsonTypeName(entry)}`);
    }
    checkKeys(entry, mappingPath, MAPPING_KEYS);
    return {
      parameter: requireString(entry, mappingPath, "parameter"),
      rangeStart: optionalNumber(entry, mappingPath, "rangeStart", 0),
      rangeEnd: optionalNumber(entry, mappingPath, "rangeEnd", 1),
      curve: optionalNumber(entry, mappingPath, "curve", 1),
      scale: optionalNumber(entry, mappingPath, "scale", 1),
      invert: optionalBool(entry, mappingPath, "invert", false),
    } satisfies SpecMacroMapping;
  });

  return { id, name, defaultValue, mappings };
}

function parseDocument(root: unknown): PluginSpec {
  if (!isPlainObject(root)) {
    fail(ErrorCodes.RootNotObject, "$", `PluginSpec root must be a JSON object, found ${jsonTypeName(root)}`);
  }

  // The schema version is checked first: a document written against a different
  // schema must be rejected as such, before any field is interpreted.
  const schemaVersion = requireField(root, "$", "factorySchemaVersion");
  if (typeof schemaVersion !== "number" || !Number.isInteger(schemaVersion)) {
    fail(ErrorCodes.TypeMismatch, "$/factorySchemaVersion", `expected an integer, found ${jsonTypeName(schemaVersion)}`);
  }
  if (schemaVersion !== SCHEMA_VERSION) {
    fail(
      ErrorCodes.UnsupportedSchemaVersion,
      "$/factorySchemaVersion",
      `unsupported schema version ${schemaVersion} (kernel supports ${SCHEMA_VERSION})`,
    );
  }

  checkKeys(root, "$", ROOT_KEYS);

  // plugin
  const pluginObject = requireObject(root, "$", "plugin");
  checkKeys(pluginObject, "$/plugin", PLUGIN_KEYS);
  const effectType = requireString(pluginObject, "$/plugin", "effectType");
  if (!(EFFECT_TYPES as readonly string[]).includes(effectType)) {
    fail(ErrorCodes.UnsupportedValue, "$/plugin/effectType", `unsupported effectType '${effectType}'`);
  }
  const channels = requireString(pluginObject, "$/plugin", "channels");
  if (!(CHANNEL_MODES as readonly string[]).includes(channels)) {
    fail(ErrorCodes.UnsupportedValue, "$/plugin/channels", `unsupported channel mode '${channels}' (expected 'mono' or 'stereo')`);
  }

  // graph
  const graphObject = requireObject(root, "$", "graph");
  checkKeys(graphObject, "$/graph", GRAPH_KEYS);
  const modulesRaw = requireArray(graphObject, "$/graph", "modules");
  if (modulesRaw.length === 0) {
    fail(ErrorCodes.EmptyCollection, "$/graph/modules", "graph must contain at least one module");
  }
  if (modulesRaw.length > MAX_GRAPH_MODULES) {
    fail(ErrorCodes.CollectionTooLarge, "$/graph/modules", `graph contains ${modulesRaw.length} modules (limit ${MAX_GRAPH_MODULES})`);
  }

  // parameters
  const parametersRaw = requireArray(root, "$", "parameters");
  if (parametersRaw.length > MAX_EXPOSED_PARAMETERS) {
    fail(ErrorCodes.CollectionTooLarge, "$/parameters", `too many parameters (${parametersRaw.length}, limit ${MAX_EXPOSED_PARAMETERS})`);
  }

  // macros
  const macrosRaw = requireArray(root, "$", "macros");
  if (macrosRaw.length > MAX_MACROS) {
    fail(ErrorCodes.CollectionTooLarge, "$/macros", `too many macros (${macrosRaw.length}, limit ${MAX_MACROS})`);
  }

  // dryWet / bypass / ui
  const dryWetObject = requireObject(root, "$", "dryWet");
  checkKeys(dryWetObject, "$/dryWet", DRY_WET_KEYS);
  const dryWet = {
    enabled: requireBool(dryWetObject, "$/dryWet", "enabled"),
    defaultMix: requireNumber(dryWetObject, "$/dryWet", "defaultMix"),
  };

  // An instrument generates its own signal, so a Mix control would be a knob
  // that does nothing. Refused here rather than shown to a customer.
  if (effectType === "instrument" && dryWet.enabled) {
    fail(
      ErrorCodes.UnsupportedValue,
      "$/dryWet/enabled",
      "an 'instrument' plugin has no input signal, so dryWet.enabled must be false",
    );
  }

  const bypassObject = requireObject(root, "$", "bypass");
  checkKeys(bypassObject, "$/bypass", BYPASS_KEYS);
  const bypass = {
    mode: requireString(bypassObject, "$/bypass", "mode"),
    defaultBypassed: optionalBool(bypassObject, "$/bypass", "defaultBypassed", false),
  };

  const uiObject = requireObject(root, "$", "ui");
  checkKeys(uiObject, "$/ui", UI_KEYS);
  const tagsRaw = Object.prototype.hasOwnProperty.call(uiObject, "tags") ? requireArray(uiObject, "$/ui", "tags") : [];
  const orderRaw = Object.prototype.hasOwnProperty.call(uiObject, "parameterOrder")
    ? requireArray(uiObject, "$/ui", "parameterOrder")
    : [];

  const spec: PluginSpec = {
    factorySchemaVersion: SCHEMA_VERSION,
    plugin: {
      id: requireString(pluginObject, "$/plugin", "id"),
      name: requireString(pluginObject, "$/plugin", "name"),
      vendor: requireString(pluginObject, "$/plugin", "vendor"),
      version: requireString(pluginObject, "$/plugin", "version"),
      effectType,
      channels: channels as "mono" | "stereo",
    },
    graph: { modules: modulesRaw.map((element, index) => parseModule(element, indexPath("$/graph/modules", index))) },
    parameters: parametersRaw.map((element, index) => parseParameter(element, indexPath("$/parameters", index))),
    macros: macrosRaw.map((element, index) => parseMacro(element, indexPath("$/macros", index))),
    dryWet,
    bypass,
    ui: {
      accentColor: requireString(uiObject, "$/ui", "accentColor"),
      category: requireString(uiObject, "$/ui", "category"),
      shortDescription: optionalString(uiObject, "$/ui", "shortDescription", ""),
      tags: tagsRaw.map((tag, index) => {
        if (typeof tag !== "string") {
          fail(ErrorCodes.TypeMismatch, indexPath("$/ui/tags", index), `expected a JSON string, found ${jsonTypeName(tag)}`);
        }
        return tag;
      }),
      layout: requireString(uiObject, "$/ui", "layout"),
      parameterOrder: orderRaw.map((id, index) => {
        if (typeof id !== "string") {
          fail(ErrorCodes.TypeMismatch, indexPath("$/ui/parameterOrder", index), `expected a JSON string, found ${jsonTypeName(id)}`);
        }
        return id;
      }),
    },
  };

  const schemaError = validateSchema(spec);
  if (schemaError) throw new SpecErrorError(schemaError);

  return spec;
}

// ---------------------------------------------------------------------------
// Phase 1b: cross-field schema validation (validatePluginSpecSchema)
// ---------------------------------------------------------------------------

function validateSchema(spec: PluginSpec): SpecError | null {
  const err = (code: number, path: string, message: string): SpecError => ({ code, path, message });

  if (!isValidIdentifier(spec.plugin.id)) {
    return err(ErrorCodes.InvalidIdentifier, "$/plugin/id", `plugin id '${spec.plugin.id}' is not a valid identifier`);
  }
  if (spec.plugin.name.length === 0 || spec.plugin.name.length > 96) {
    return err(ErrorCodes.ValueOutOfRange, "$/plugin/name", `plugin name length ${spec.plugin.name.length} is outside 1..96`);
  }
  if (spec.plugin.vendor.length === 0 || spec.plugin.vendor.length > 96) {
    return err(ErrorCodes.ValueOutOfRange, "$/plugin/vendor", `vendor length ${spec.plugin.vendor.length} is outside 1..96`);
  }
  if (!parseSemVer(spec.plugin.version)) {
    return err(ErrorCodes.TypeMismatch, "$/plugin/version", `plugin version '${spec.plugin.version}' is not MAJOR.MINOR.PATCH`);
  }

  if (spec.graph.modules.length === 0) {
    return err(ErrorCodes.GraphEmpty, "$/graph/modules", "graph must contain at least one module");
  }
  if (spec.graph.modules.length > MAX_GRAPH_MODULES) {
    return err(ErrorCodes.GraphTooLong, "$/graph/modules", `graph contains ${spec.graph.modules.length} modules (limit ${MAX_GRAPH_MODULES})`);
  }

  const instanceIds = new Set<string>();
  const isInstrument = spec.plugin.effectType === "instrument";
  let sourceCount = 0;
  for (let i = 0; i < spec.graph.modules.length; i += 1) {
    const module = spec.graph.modules[i]!;
    const path = indexPath("$/graph/modules", i);
    if (!isValidIdentifier(module.instanceId)) {
      return err(ErrorCodes.InvalidIdentifier, childPath(path, "instanceId"), `instance id '${module.instanceId}' is not a valid identifier`);
    }
    if (instanceIds.has(module.instanceId)) {
      return err(ErrorCodes.DuplicateIdentifier, childPath(path, "instanceId"), `duplicate module instance id '${module.instanceId}'`);
    }
    instanceIds.add(module.instanceId);
    if (!isValidIdentifier(module.moduleId)) {
      return err(ErrorCodes.InvalidIdentifier, childPath(path, "moduleId"), `module id '${module.moduleId}' is not a valid identifier`);
    }
    if (!parseSemVer(module.moduleVersion)) {
      return err(ErrorCodes.TypeMismatch, childPath(path, "moduleVersion"), "module version is not MAJOR.MINOR.PATCH");
    }

    // A source module replaces its input instead of processing it, so the effect
    // type and the graph have to agree. Getting this wrong is not a cosmetic
    // error: an "instrument" with no source builds and then makes no sound, and a
    // processor containing a source silently throws the host's audio away.
    if (findModule(module.moduleId)?.isSource === true) {
      if (!isInstrument) {
        return err(
          ErrorCodes.UnsupportedValue,
          childPath(path, "moduleId"),
          `'${module.moduleId}' generates audio, so it cannot appear in an '${spec.plugin.effectType}' plugin (effectType must be 'instrument')`,
        );
      }
      sourceCount += 1;
    }
  }

  if (isInstrument && sourceCount === 0) {
    return err(
      ErrorCodes.UnsupportedValue,
      "$/plugin/effectType",
      "an 'instrument' plugin must contain a source module (the certified synth), otherwise it would build and stay silent",
    );
  }

  if (isInstrument && sourceCount > 1) {
    return err(
      ErrorCodes.UnsupportedValue,
      "$/graph/modules",
      `an 'instrument' plugin must contain exactly one source module, found ${sourceCount}`,
    );
  }

  if (spec.parameters.length > MAX_EXPOSED_PARAMETERS) {
    return err(ErrorCodes.CollectionTooLarge, "$/parameters", `too many parameters (limit ${MAX_EXPOSED_PARAMETERS})`);
  }

  const parameterIds = new Set<string>();
  for (let i = 0; i < spec.parameters.length; i += 1) {
    const parameter = spec.parameters[i]!;
    const path = indexPath("$/parameters", i);

    if (!isValidIdentifier(parameter.id)) {
      return err(ErrorCodes.InvalidIdentifier, childPath(path, "id"), `parameter id '${parameter.id}' is not a valid identifier`);
    }
    if (parameterIds.has(parameter.id)) {
      return err(ErrorCodes.DuplicateIdentifier, childPath(path, "id"), `duplicate parameter id '${parameter.id}'`);
    }
    parameterIds.add(parameter.id);

    if (parameter.name.length === 0 || parameter.name.length > 96) {
      return err(ErrorCodes.ValueOutOfRange, childPath(path, "name"), "parameter name length is outside 1..96");
    }
    if (!(parameter.range.min < parameter.range.max)) {
      return err(ErrorCodes.ValueOutOfRange, childPath(path, "range/min"), "range min must be strictly less than max");
    }
    if (
      !Number.isFinite(parameter.range.min) ||
      !Number.isFinite(parameter.range.max) ||
      !Number.isFinite(parameter.range.default)
    ) {
      return err(ErrorCodes.ValueOutOfRange, childPath(path, "range"), "range values must be finite");
    }
    if (parameter.range.default < parameter.range.min || parameter.range.default > parameter.range.max) {
      return err(ErrorCodes.ValueOutOfRange, childPath(path, "range/default"), "default must lie inside [min, max]");
    }
    if (parameter.logarithmic && parameter.range.min <= 0) {
      return err(ErrorCodes.ValueOutOfRange, childPath(path, "logarithmic"), "logarithmic parameters require a strictly positive range min");
    }

    const target = splitTarget(parameter.target);
    if (!target) {
      return err(
        ErrorCodes.UnsupportedValue,
        childPath(path, "target"),
        "target must be '<moduleInstanceId>.<parameterId>' or '$factory.dryWet' / '$factory.bypass'",
      );
    }

    if (target.instanceId === FACTORY_INSTANCE_ID) {
      if (target.parameterId !== FACTORY_DRY_WET && target.parameterId !== FACTORY_BYPASS) {
        return err(
          ErrorCodes.UnsupportedValue,
          childPath(path, "target"),
          `unknown factory control '${parameter.target}' (supported: $factory.dryWet, $factory.bypass)`,
        );
      }
      if (target.parameterId === FACTORY_DRY_WET && !spec.dryWet.enabled) {
        return err(ErrorCodes.UnsupportedValue, childPath(path, "target"), "target '$factory.dryWet' requires dryWet.enabled = true");
      }
      if (parameter.range.min < 0 || parameter.range.max > 1) {
        return err(ErrorCodes.ValueOutOfRange, childPath(path, "range"), "a factory control parameter must be bounded to 0..1");
      }
    } else {
      if (!isValidIdentifier(target.instanceId)) {
        return err(ErrorCodes.InvalidIdentifier, childPath(path, "target"), `target instance id '${target.instanceId}' is not a valid identifier`);
      }
      if (!spec.graph.modules.some((module) => module.instanceId === target.instanceId)) {
        return err(ErrorCodes.DanglingReference, childPath(path, "target"), `target instance '${target.instanceId}' is not in the graph`);
      }
    }
  }

  if (spec.macros.length > MAX_MACROS) {
    return err(ErrorCodes.CollectionTooLarge, "$/macros", `too many macros (limit ${MAX_MACROS})`);
  }

  const declared = new Set(spec.parameters.map((parameter) => parameter.id));
  const macroIds = new Set<string>();
  let totalMappings = 0;

  for (let i = 0; i < spec.macros.length; i += 1) {
    const macro = spec.macros[i]!;
    const path = indexPath("$/macros", i);

    if (!isValidIdentifier(macro.id)) {
      return err(ErrorCodes.InvalidIdentifier, childPath(path, "id"), `macro id '${macro.id}' is not a valid identifier`);
    }
    if (macroIds.has(macro.id)) {
      return err(ErrorCodes.DuplicateIdentifier, childPath(path, "id"), `duplicate macro id '${macro.id}'`);
    }
    macroIds.add(macro.id);

    if (macro.name.length === 0 || macro.name.length > 96) {
      return err(ErrorCodes.ValueOutOfRange, childPath(path, "name"), "macro name length is outside 1..96");
    }
    if (!(macro.defaultValue >= 0 && macro.defaultValue <= 1)) {
      return err(ErrorCodes.ValueOutOfRange, childPath(path, "defaultValue"), "macro default must lie in 0..1");
    }
    if (macro.mappings.length === 0) {
      return err(ErrorCodes.EmptyCollection, childPath(path, "mappings"), `macro '${macro.id}' has no mappings`);
    }

    totalMappings += macro.mappings.length;
    if (totalMappings > MAX_MACRO_MAPPINGS) {
      return err(ErrorCodes.CollectionTooLarge, childPath(path, "mappings"), `too many macro mappings in total (limit ${MAX_MACRO_MAPPINGS})`);
    }

    const mapped = new Set<string>();
    for (let m = 0; m < macro.mappings.length; m += 1) {
      const mapping = macro.mappings[m]!;
      const mappingPath = indexPath(childPath(path, "mappings"), m);

      if (!isValidIdentifier(mapping.parameter)) {
        return err(ErrorCodes.InvalidIdentifier, childPath(mappingPath, "parameter"), `mapped parameter id '${mapping.parameter}' is not a valid identifier`);
      }
      if (!declared.has(mapping.parameter)) {
        return err(ErrorCodes.DanglingReference, childPath(mappingPath, "parameter"), `mapped parameter '${mapping.parameter}' is not declared`);
      }
      if (mapped.has(mapping.parameter)) {
        return err(
          ErrorCodes.DuplicateIdentifier,
          childPath(mappingPath, "parameter"),
          `macro '${macro.id}' maps parameter '${mapping.parameter}' more than once`,
        );
      }
      mapped.add(mapping.parameter);

      if (!(mapping.rangeStart >= 0 && mapping.rangeStart <= 1) || !(mapping.rangeEnd >= 0 && mapping.rangeEnd <= 1)) {
        return err(ErrorCodes.ValueOutOfRange, childPath(mappingPath, "rangeStart"), "mapping range bounds must lie in 0..1");
      }
      if (!(mapping.curve >= 0.05 && mapping.curve <= 8)) {
        return err(ErrorCodes.ValueOutOfRange, childPath(mappingPath, "curve"), "mapping curve must lie in 0.05..8");
      }
      if (!(mapping.scale >= 0 && mapping.scale <= 4)) {
        return err(ErrorCodes.ValueOutOfRange, childPath(mappingPath, "scale"), "mapping scale must lie in 0..4");
      }
    }
  }

  if (!(spec.dryWet.defaultMix >= 0 && spec.dryWet.defaultMix <= 1)) {
    return err(ErrorCodes.ValueOutOfRange, "$/dryWet/defaultMix", "dry/wet default mix must lie in 0..1");
  }
  if (spec.bypass.mode !== "hard") {
    return err(ErrorCodes.UnsupportedValue, "$/bypass/mode", `unsupported bypass mode '${spec.bypass.mode}' (v1 supports 'hard')`);
  }

  if (!isValidColour(spec.ui.accentColor)) {
    return err(ErrorCodes.UnsupportedValue, "$/ui/accentColor", `accentColor '${spec.ui.accentColor}' must be '#RRGGBB'`);
  }
  if (spec.ui.category.length === 0 || spec.ui.category.length > 48) {
    return err(ErrorCodes.ValueOutOfRange, "$/ui/category", "ui category length is outside 1..48");
  }
  if (spec.ui.shortDescription.length > 256) {
    return err(ErrorCodes.ValueOutOfRange, "$/ui/shortDescription", "shortDescription length exceeds 256");
  }
  if (spec.ui.layout !== "vertical" && spec.ui.layout !== "horizontal") {
    return err(ErrorCodes.UnsupportedValue, "$/ui/layout", `unsupported layout '${spec.ui.layout}'`);
  }
  if (spec.ui.tags.length > 16) {
    return err(ErrorCodes.CollectionTooLarge, "$/ui/tags", "too many tags (limit 16)");
  }
  for (let i = 0; i < spec.ui.tags.length; i += 1) {
    if (!isTagValid(spec.ui.tags[i]!)) {
      return err(ErrorCodes.InvalidIdentifier, indexPath("$/ui/tags", i), `tag '${spec.ui.tags[i]}' is not a valid tag`);
    }
  }

  const ordered = new Set<string>();
  for (let i = 0; i < spec.ui.parameterOrder.length; i += 1) {
    const id = spec.ui.parameterOrder[i]!;
    if (!declared.has(id)) {
      return err(ErrorCodes.DanglingReference, indexPath("$/ui/parameterOrder", i), `parameterOrder entry '${id}' is not declared`);
    }
    if (ordered.has(id)) {
      return err(ErrorCodes.DuplicateIdentifier, indexPath("$/ui/parameterOrder", i), `parameterOrder entry '${id}' appears more than once`);
    }
    ordered.add(id);
  }

  return null;
}

// ---------------------------------------------------------------------------
// Phase 2: module resolution against the certified catalogue
// ---------------------------------------------------------------------------

/** The certificate policy the factory build uses for user-generated products. */
export function resolveModules(spec: PluginSpec): SpecError | null {
  const err = (code: number, path: string, message: string): SpecError => ({ code, path, message });

  for (let i = 0; i < spec.graph.modules.length; i += 1) {
    const requested = spec.graph.modules[i]!;
    const path = indexPath("$/graph/modules", i);
    const modulePath = childPath(path, "moduleId");

    const manifest = findModule(requested.moduleId);
    if (!manifest) {
      return err(ErrorCodes.UnknownModule, modulePath, `no module registered with id '${requested.moduleId}'`);
    }

    const requestedVersion = parseSemVer(requested.moduleVersion)!;
    const availableVersion = parseSemVer(manifest.version)!;
    if (!isVersionCompatible(requestedVersion, availableVersion)) {
      return err(
        ErrorCodes.ModuleVersionIncompatible,
        modulePath,
        `module '${requested.moduleId}' version ${requested.moduleVersion} is incompatible with the registered version ${manifest.version} (major versions must match and the registry must not be older)`,
      );
    }

    if (!manifest.channels.includes(spec.plugin.channels)) {
      return err(
        ErrorCodes.ModuleChannelUnsupported,
        modulePath,
        `module '${manifest.id}' (version ${manifest.version}) does not support channel mode '${spec.plugin.channels}'`,
      );
    }

    for (const [parameterId, value] of Object.entries(requested.parameters)) {
      const parameter = manifest.parameters.find((candidate) => candidate.id === parameterId);
      if (!parameter) {
        return err(ErrorCodes.ModuleParameterUnknown, modulePath, `module '${manifest.id}' has no parameter '${parameterId}'`);
      }
      if (value < parameter.min || value > parameter.max) {
        return err(
          ErrorCodes.ValueOutOfRange,
          `$/graph/modules[${i}]/parameters/${parameterId}`,
          `value ${formatNumber(value)} is outside the domain [${formatNumber(parameter.min)}, ${formatNumber(parameter.max)}] of module parameter '${parameterId}'`,
        );
      }
    }

    // A declared expose/macro target must name a parameter the module really has.
    for (let p = 0; p < spec.parameters.length; p += 1) {
      const parameter = spec.parameters[p]!;
      const target = splitTarget(parameter.target)!;
      if (target.instanceId !== requested.instanceId || target.instanceId === FACTORY_INSTANCE_ID) continue;
      if (!manifest.parameters.some((candidate) => candidate.id === target.parameterId)) {
        return err(
          ErrorCodes.ModuleParameterUnknown,
          `$/parameters[${p}]/target`,
          `module '${manifest.id}' has no parameter '${target.parameterId}'`,
        );
      }
    }
  }

  // Factory-control parameters must reference the dry/wet or bypass the spec enables.
  for (let p = 0; p < spec.parameters.length; p += 1) {
    const parameter = spec.parameters[p]!;
    const target = splitTarget(parameter.target)!;
    if (target.instanceId !== FACTORY_INSTANCE_ID) continue;
    if (target.parameterId === FACTORY_DRY_WET && !spec.dryWet.enabled) {
      return err(ErrorCodes.UnsupportedValue, `$/parameters[${p}]/target`, "target '$factory.dryWet' requires dryWet.enabled = true");
    }
  }

  return null;
}

export function formatNumber(value: number): string {
  if (Number.isInteger(value) && Math.abs(value) < 1e15) return String(value);
  return Number(value.toPrecision(9)).toString();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type ParseResult = { ok: true; spec: PluginSpec } | { ok: false; error: SpecError };

/**
 * Parse + fully validate a PluginSpec document (both phases).
 * Deterministic: the same input always produces the same verdict and error.
 */
export function parsePluginSpec(input: unknown): ParseResult {
  try {
    const spec = parseDocument(input);
    const resolutionError = resolveModules(spec);
    return resolutionError ? { ok: false, error: resolutionError } : { ok: true, spec };
  } catch (error) {
    if (error instanceof SpecErrorError) return { ok: false, error: error.detail };
    throw error;
  }
}

/** Parse JSON text and validate it, reporting a parse failure as ZFACTORY-1001. */
export function parsePluginSpecText(jsonText: string): ParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (error) {
    return {
      ok: false,
      error: {
        code: ErrorCodes.JsonParseFailed,
        path: "$",
        message: `document is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
      },
    };
  }
  return parsePluginSpec(parsed);
}

/**
 * The exact document a build receives: every optional field materialised, keys
 * in the kernel's own order. Two semantically identical specs serialize
 * identically, which is what makes build reuse safe.
 */
export function normalizeSpec(spec: PluginSpec): PluginSpec {
  return {
    factorySchemaVersion: SCHEMA_VERSION,
    plugin: {
      id: spec.plugin.id,
      name: spec.plugin.name,
      vendor: spec.plugin.vendor,
      version: spec.plugin.version,
      effectType: spec.plugin.effectType,
      channels: spec.plugin.channels,
    },
    graph: {
      modules: spec.graph.modules.map((module) => ({
        instanceId: module.instanceId,
        moduleId: module.moduleId,
        moduleVersion: module.moduleVersion,
        parameters: Object.fromEntries(Object.entries(module.parameters).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))),
      })),
    },
    parameters: spec.parameters.map((parameter) => ({
      id: parameter.id,
      name: parameter.name,
      target: parameter.target,
      range: { min: parameter.range.min, max: parameter.range.max, default: parameter.range.default },
      unit: parameter.unit,
      logarithmic: parameter.logarithmic,
      group: parameter.group,
      exposeToHost: parameter.exposeToHost,
    })),
    macros: spec.macros.map((macro) => ({
      id: macro.id,
      name: macro.name,
      defaultValue: macro.defaultValue,
      mappings: macro.mappings.map((mapping) => ({
        parameter: mapping.parameter,
        rangeStart: mapping.rangeStart,
        rangeEnd: mapping.rangeEnd,
        curve: mapping.curve,
        scale: mapping.scale,
        invert: mapping.invert,
      })),
    })),
    dryWet: { enabled: spec.dryWet.enabled, defaultMix: spec.dryWet.defaultMix },
    bypass: { mode: spec.bypass.mode, defaultBypassed: spec.bypass.defaultBypassed },
    ui: {
      accentColor: spec.ui.accentColor,
      category: spec.ui.category,
      shortDescription: spec.ui.shortDescription,
      tags: [...spec.ui.tags],
      layout: spec.ui.layout,
      parameterOrder: [...spec.ui.parameterOrder],
    },
  };
}

/** Canonical JSON text (recursively sorted keys) — the bytes a build identity hashes. */
export function canonicalJsonText(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) out[key] = sortValue(value[key]);
    return out;
  }
  return value;
}

/** SHA-256 of the canonical document. Identical specs reuse one build. */
export async function specSha256(spec: PluginSpec): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalJsonText(normalizeSpec(spec)));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Exposed for tests: the schema-only phase. */
export function validateSpecSchema(spec: PluginSpec): SpecError | null {
  return validateSchema(spec);
}
