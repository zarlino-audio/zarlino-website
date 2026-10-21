/**
 * The build plan and the three Zarlino interfaces.
 *
 * `compilePlan` turns a VALIDATED PluginSpec into the human-readable document a
 * customer reviews before spending a build, and into the exact control surface
 * each of the three interfaces draws.
 *
 * The control/template rules are a port of the kernel's `UiPlan` compiler
 * (`factory/src/UiPlan.cpp`), because the product idea only holds if what the
 * customer approves on the site is what the built plugin actually shows:
 *
 *   Minimal   - macros plus the most important controls (3..8), one column.
 *   Standard  - everything the spec exposes (8..16 kept by priority), grouped,
 *               two columns, units shown.
 *   Advanced  - Standard plus a control for every certified module parameter the
 *               spec leaves unexposed: the full-access surface.
 *
 * The three are strictly nested (Minimal subset of Standard subset of Advanced)
 * and therefore differ in density, never in coherence.
 */

import { findModule, type CatalogModule } from "./catalog";
import type { PluginSpec, SpecParameter } from "./spec";
import { FACTORY_INSTANCE_ID, formatNumber } from "./spec";

export const UI_TEMPLATES = ["minimal", "standard", "advanced"] as const;
export type UiTemplate = (typeof UI_TEMPLATES)[number];

export function isUiTemplate(value: unknown): value is UiTemplate {
  return typeof value === "string" && (UI_TEMPLATES as readonly string[]).includes(value);
}

export type Importance = "primary" | "secondary" | "tertiary";
export type ControlKind = "knob" | "fader" | "switch" | "select";

export interface PlanControl {
  /** `parameterId` for spec parameters, `macro:<id>` for macros, `instance.parameter` for module-level controls. */
  id: string;
  label: string;
  unit: string;
  group: string;
  importance: Importance;
  kind: ControlKind;
  isMacro: boolean;
  isFactoryControl: boolean;
  moduleLevel: boolean;
  exposedToHost: boolean;
  macroDriven: boolean;
  min: number;
  max: number;
  default: number;
  logarithmic: boolean;
  stepCount: number;
  target: string;
  /** Ordinal among host parameters (macros first, then exposed spec parameters); -1 when not automatable. */
  hostParameterIndex: number;
}

export interface PlanGroup {
  name: string;
  importance: Importance;
  controls: PlanControl[];
}

export interface BuildPlan {
  pluginId: string;
  title: string;
  vendor: string;
  version: string;
  category: string;
  shortDescription: string;
  effectType: string;
  channels: "mono" | "stereo";
  accentColor: string;
  tags: string[];
  /** Ordered signal chain, first module processes first. */
  chain: Array<{
    instanceId: string;
    moduleId: string;
    moduleName: string;
    description: string;
    category: string;
    role: string;
    latencySamples: number;
  }>;
  macros: Array<{ id: string; name: string; default: number; drives: string[] }>;
  parameters: Array<{
    id: string;
    name: string;
    group: string;
    unit: string;
    min: number;
    max: number;
    default: number;
    target: string;
    drivenByMacro: boolean;
    exposedToHost: boolean;
  }>;
  latencySamples: number;
  latencyMsAt48k: number;
  /** One sentence the customer reads on the review screen. */
  summary: string;
  /** Deterministic notes: the things a customer should know before paying. */
  notes: string[];
}

const IMPORTANCE_ORDER: Record<Importance, number> = { primary: 0, secondary: 1, tertiary: 2 };

const MINIMAL_FLOOR = 3;
const MINIMAL_CEILING = 8;
const STANDARD_FLOOR = 8;
const STANDARD_CEILING = 16;

function kindFromDomain(module: CatalogModule | undefined, parameterId: string): ControlKind {
  const manifest = module?.parameters.find((candidate) => candidate.id === parameterId);
  if (!manifest) return "knob";
  if (manifest.stepCount === 2) return "switch";
  if (manifest.stepCount > 2) return "select";
  return manifest.logarithmic ? "fader" : "knob";
}

function describeRole(spec: PluginSpec, instanceId: string, moduleId: string): string {
  const index = spec.graph.modules.findIndex((module) => module.instanceId === instanceId);
  const position = index === 0 ? "first in the chain" : index === spec.graph.modules.length - 1 ? "last in the chain" : "in the middle of the chain";
  const module = findModule(moduleId);
  return `${module?.displayName ?? moduleId}, ${position}`;
}

/**
 * Compile the human-readable plan. The spec must already have passed
 * `parsePluginSpec`; this function asserts nothing and cannot fail on a
 * validated document.
 */
export function compilePlan(spec: PluginSpec): BuildPlan {
  const chain = spec.graph.modules.map((module) => {
    const manifest = findModule(module.moduleId);
    return {
      instanceId: module.instanceId,
      moduleId: module.moduleId,
      moduleName: manifest?.displayName ?? module.moduleId,
      description: manifest?.description ?? "",
      category: manifest?.category ?? "utility",
      role: describeRole(spec, module.instanceId, module.moduleId),
      latencySamples: manifest?.referenceLatencySamples ?? 0,
    };
  });

  const macroDriven = new Set<string>();
  for (const macro of spec.macros) for (const mapping of macro.mappings) macroDriven.add(mapping.parameter);

  const latencySamples = chain.reduce((total, module) => total + module.latencySamples, 0);

  const notes: string[] = [];
  if (latencySamples > 0) {
    notes.push(`${latencySamples} samples of latency (${(latencySamples / 48).toFixed(2)} ms at 48 kHz) from the limiter's lookahead.`);
  }
  if (spec.dryWet.enabled && !spec.parameters.some((parameter) => parameter.target === `$factory.dryWet`)) {
    notes.push(`Dry/wet is fixed at ${Math.round(spec.dryWet.defaultMix * 100)}% — add a Mix control if you want it adjustable.`);
  }
  if (spec.graph.modules.length === 1) {
    notes.push("A single-module processor is valid, but most useful processors combine two or more stages.");
  }
  const stereoOnly = chain.some((module) => (findModule(module.moduleId)?.channels.length ?? 2) === 1);
  if (stereoOnly && spec.plugin.channels === "mono") {
    notes.push("This processor needs a stereo track: one of the chosen modules is stereo only.");
  }

  const summary = buildSummary(spec, chain);

  return {
    pluginId: spec.plugin.id,
    title: spec.plugin.name,
    vendor: spec.plugin.vendor,
    version: spec.plugin.version,
    category: spec.ui.category,
    shortDescription: spec.ui.shortDescription,
    effectType: spec.plugin.effectType,
    channels: spec.plugin.channels,
    accentColor: spec.ui.accentColor,
    tags: [...spec.ui.tags],
    chain,
    macros: spec.macros.map((macro) => ({
      id: macro.id,
      name: macro.name,
      default: macro.defaultValue,
      drives: macro.mappings.map((mapping) => mapping.parameter),
    })),
    parameters: spec.parameters.map((parameter) => ({
      id: parameter.id,
      name: parameter.name,
      group: parameter.group,
      unit: parameter.unit,
      min: parameter.range.min,
      max: parameter.range.max,
      default: parameter.range.default,
      target: parameter.target,
      drivenByMacro: macroDriven.has(parameter.id),
      exposedToHost: parameter.exposeToHost,
    })),
    latencySamples,
    latencyMsAt48k: Number(((latencySamples / 48000) * 1000).toFixed(3)),
    summary,
    notes,
  };
}

function buildSummary(spec: PluginSpec, chain: BuildPlan["chain"]): string {
  const names = chain.map((module) => module.moduleName);
  const chainText =
    names.length === 1 ? names[0]! : `${names.slice(0, -1).join(", ")} then ${names[names.length - 1]}`;
  const macroText =
    spec.macros.length > 0
      ? ` It has ${spec.macros.length} macro control${spec.macros.length === 1 ? "" : "s"} (${spec.macros.map((macro) => macro.name).join(", ")}) on top of ${spec.parameters.length} regular control${spec.parameters.length === 1 ? "" : "s"}.`
      : ` It has ${spec.parameters.length} control${spec.parameters.length === 1 ? "" : "s"}.`;
  return `${spec.plugin.name} is a ${spec.plugin.channels} ${humanEffectType(spec.plugin.effectType)}: ${chainText}.${macroText}`;
}

function humanEffectType(effectType: string): string {
  return effectType.replace(/-/g, " ");
}

// ---------------------------------------------------------------------------
// Template projection
// ---------------------------------------------------------------------------

export interface TemplatePreview {
  template: UiTemplate;
  label: string;
  description: string;
  /** Controls this interface draws, in display order. */
  controls: PlanControl[];
  groups: PlanGroup[];
  /** Everything the full-access template could ever draw (macros + parameters + module-level). */
  availableCount: number;
  drawnCount: number;
  hiddenCount: number;
  density: number;
  layout: "one-column" | "two-column" | "two-column-with-readouts";
  showsUnits: boolean;
  showsValueReadouts: boolean;
  /** Rows of at most `columns` controls, for the schematic preview. */
  rows: PlanControl[][];
  columns: number;
}

const TEMPLATE_TEXT: Record<UiTemplate, { label: string; description: string; layout: TemplatePreview["layout"]; units: boolean; readouts: boolean; columns: number }> = {
  minimal: {
    label: "Minimal",
    description: "Macros and the most important controls, one column. Fastest to use, nothing extra on screen.",
    layout: "one-column",
    units: false,
    readouts: false,
    columns: 1,
  },
  standard: {
    label: "Standard",
    description: "Every control this design declares, grouped, in two columns with units. The everyday interface.",
    layout: "two-column",
    units: true,
    readouts: false,
    columns: 2,
  },
  advanced: {
    label: "Advanced",
    description: "Standard plus a control for every module parameter, with values and ranges on screen. Full access.",
    layout: "two-column-with-readouts",
    units: true,
    readouts: true,
    columns: 2,
  },
};

/** Every control the spec can ever surface (the Advanced surface). */
function allControls(spec: PluginSpec): PlanControl[] {
  const macroDriven = new Set<string>();
  for (const macro of spec.macros) for (const mapping of macro.mappings) macroDriven.add(mapping.parameter);

  const macroControls: PlanControl[] = spec.macros.map((macro, index) => ({
    id: `macro:${macro.id}`,
    label: macro.name,
    unit: "",
    group: "Macros",
    importance: "primary",
    kind: "knob",
    isMacro: true,
    isFactoryControl: false,
    moduleLevel: false,
    exposedToHost: true,
    macroDriven: false,
    min: 0,
    max: 1,
    default: macro.defaultValue,
    logarithmic: false,
    stepCount: 0,
    target: "",
    hostParameterIndex: index,
  }));

  const order = spec.ui.parameterOrder.length > 0 ? spec.ui.parameterOrder : spec.parameters.map((parameter) => parameter.id);
  const ordered: SpecParameter[] = [];
  for (const id of order) {
    const found = spec.parameters.find((parameter) => parameter.id === id);
    if (found && !ordered.includes(found)) ordered.push(found);
  }
  for (const parameter of spec.parameters) if (!ordered.includes(parameter)) ordered.push(parameter);

  let hostIndex = spec.macros.length;
  const parameterControls = ordered.map((parameter) => {
    const [instanceId, parameterId] = splitTarget(parameter.target);
    const module = instanceId && instanceId !== FACTORY_INSTANCE_ID ? findModuleModuleFor(spec, instanceId) : undefined;
    const manifest = module?.parameters.find((candidate) => candidate.id === parameterId);
    const isFactory = instanceId === FACTORY_INSTANCE_ID;

    const importance: Importance = macroDriven.has(parameter.id)
      ? "primary"
      : isFactory || spec.ui.parameterOrder.includes(parameter.id)
        ? "secondary"
        : "tertiary";

    const group = parameter.group || (isFactory ? "Mix" : manifest?.group || module?.displayName || "Parameters");

    const control: PlanControl = {
      id: parameter.id,
      label: parameter.name,
      unit: parameter.unit,
      group,
      importance,
      kind: kindFromDomain(module, parameterId ?? ""),
      isMacro: false,
      isFactoryControl: isFactory,
      moduleLevel: false,
      exposedToHost: parameter.exposeToHost,
      macroDriven: macroDriven.has(parameter.id),
      min: parameter.range.min,
      max: parameter.range.max,
      default: parameter.range.default,
      logarithmic: parameter.logarithmic,
      stepCount: manifest?.stepCount ?? 0,
      target: parameter.target,
      hostParameterIndex: parameter.exposeToHost ? hostIndex++ : -1,
    };
    return control;
  });

  // Module-level controls: every certified module parameter the spec does not
  // expose. Not host parameters — the spec never declared them.
  const covered = new Set<string>();
  for (const parameter of spec.parameters) covered.add(parameter.target);

  const moduleControls: PlanControl[] = [];
  for (const instance of spec.graph.modules) {
    const module = findModule(instance.moduleId);
    if (!module) continue;
    for (const parameter of module.parameters) {
      if (covered.has(`${instance.instanceId}.${parameter.id}`)) continue;
      moduleControls.push({
        id: `${instance.instanceId}.${parameter.id}`,
        label: parameter.displayName || parameter.id,
        unit: parameter.unit,
        group: module.displayName,
        importance: "tertiary",
        kind: kindFromDomain(module, parameter.id),
        isMacro: false,
        isFactoryControl: false,
        moduleLevel: true,
        exposedToHost: false,
        macroDriven: false,
        min: parameter.min,
        max: parameter.max,
        default: parameter.default,
        logarithmic: parameter.logarithmic,
        stepCount: parameter.stepCount,
        target: `${instance.instanceId}.${parameter.id}`,
        hostParameterIndex: -1,
      });
    }
  }

  return [...macroControls, ...parameterControls, ...moduleControls];
}

function findModuleModuleFor(spec: PluginSpec, instanceId: string): CatalogModule | undefined {
  const instance = spec.graph.modules.find((module) => module.instanceId === instanceId);
  return instance ? findModule(instance.moduleId) : undefined;
}

function splitTarget(target: string): [string, string | null] {
  const dot = target.indexOf(".");
  if (dot <= 0) return ["", null];
  return [target.slice(0, dot), target.slice(dot + 1)];
}

function groupControls(controls: PlanControl[]): PlanGroup[] {
  const groups: PlanGroup[] = [];
  for (const control of controls) {
    let group = groups.find((candidate) => candidate.name === control.group);
    if (!group) {
      group = { name: control.group, importance: control.importance, controls: [] };
      groups.push(group);
    }
    if (IMPORTANCE_ORDER[control.importance] < IMPORTANCE_ORDER[group.importance]) group.importance = control.importance;
    group.controls.push(control);
  }
  return groups;
}

/**
 * Project the plan onto one of the three interfaces.
 *
 * Minimal and Standard draw a prefix of the same priority order (macros first,
 * then most important to least, stable within importance), which is what makes
 * the three strictly nested. Advanced draws everything.
 */
export function projectTemplate(spec: PluginSpec, template: UiTemplate): TemplatePreview {
  const all = allControls(spec);
  // Only declared, host-visible controls take part in the Minimal/Standard
  // prefix rule; module-level controls exist only on the Advanced surface.
  const declared = all.filter((control) => !control.moduleLevel && control.exposedToHost);
  const available = all.length;

  let keep: PlanControl[];
  if (template === "advanced") {
    keep = all;
  } else {
    const priority = [...declared].sort((a, b) => {
      const byImportance = IMPORTANCE_ORDER[a.importance] - IMPORTANCE_ORDER[b.importance];
      if (byImportance !== 0) return byImportance;
      return declared.indexOf(a) - declared.indexOf(b);
    });
    const primaryCount = declared.filter((control) => control.importance === "primary").length;
    const secondaryCount = declared.filter((control) => control.importance === "secondary").length;
    const keepCount =
      template === "minimal"
        ? Math.min(Math.max(MINIMAL_FLOOR, primaryCount), MINIMAL_CEILING)
        : Math.min(Math.max(STANDARD_FLOOR, primaryCount + secondaryCount), STANDARD_CEILING);
    // Keep the prefix, then restore display order (macros first, then display order).
    const keepIds = new Set(priority.slice(0, Math.min(keepCount, priority.length)).map((control) => control.id));
    keep = declared.filter((control) => keepIds.has(control.id));
  }

  const text = TEMPLATE_TEXT[template];
  const groups = groupControls(keep);
  const rows: PlanControl[][] = [];
  for (const control of keep) {
    const last = rows[rows.length - 1];
    if (!last || last.length >= text.columns) rows.push([control]);
    else last.push(control);
  }

  return {
    template,
    label: text.label,
    description: text.description,
    controls: keep,
    groups,
    availableCount: available,
    drawnCount: keep.length,
    hiddenCount: available - keep.length,
    density: available > 0 ? Number((keep.length / available).toFixed(3)) : 0,
    layout: text.layout,
    showsUnits: text.units,
    showsValueReadouts: text.readouts,
    rows,
    columns: text.columns,
  };
}

/** All three previews, for the selection screen. */
export function previewAllTemplates(spec: PluginSpec): TemplatePreview[] {
  return UI_TEMPLATES.map((template) => projectTemplate(spec, template));
}

/** A control's value rendered for the schematic preview. */
export function formatControlValue(control: PlanControl): string {
  if (control.kind === "switch") {
    return control.default > (control.min + control.max) / 2 ? "On" : "Off";
  }
  if (control.kind === "select") return `Position ${Math.round(control.default) + 1}`;
  const unit = control.unit ? ` ${control.unit}` : "";
  if (control.unit === "Hz" || control.unit === "ms") {
    return `${formatNumber(Number(control.default.toFixed(1)))}${unit}`;
  }
  return `${formatNumber(Number(control.default.toFixed(2)))}${unit}`;
}
