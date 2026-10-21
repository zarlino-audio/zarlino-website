import { describe, expect, it } from "vitest";
import { parsePluginSpec } from "../../src/factory/spec";
import { compilePlan, formatControlValue, previewAllTemplates, projectTemplate, UI_TEMPLATES } from "../../src/factory/plan";

function specFrom(document: Record<string, unknown>) {
  const result = parsePluginSpec(document);
  if (!result.ok) throw new Error(`fixture is invalid: ${result.error.path} ${result.error.message}`);
  return result.spec;
}

function baseSpec(): Record<string, unknown> {
  return {
    factorySchemaVersion: 1,
    plugin: {
      id: "zarlino.customer.warmth",
      name: "Warmth",
      vendor: "Zarlino Audio",
      version: "1.0.0",
      effectType: "saturation",
      channels: "stereo",
    },
    graph: {
      modules: [
        { instanceId: "eq", moduleId: "zarlino.eq.tilt", moduleVersion: "1.0.0", parameters: { tiltDb: 0 } },
        { instanceId: "sat", moduleId: "zarlino.saturation", moduleVersion: "1.0.0", parameters: { drive: 0.2 } },
      ],
    },
    parameters: [
      {
        id: "tone",
        name: "Tone",
        target: "eq.tiltDb",
        range: { min: -12, max: 12, default: 0 },
        unit: "dB",
        group: "Tone",
        exposeToHost: true,
      },
      {
        id: "drive",
        name: "Drive",
        target: "sat.drive",
        range: { min: 0, max: 1, default: 0.2 },
        group: "Colour",
        exposeToHost: true,
      },
      {
        id: "mix",
        name: "Mix",
        target: "$factory.dryWet",
        range: { min: 0, max: 1, default: 1 },
        group: "Output",
        exposeToHost: true,
      },
    ],
    macros: [
      {
        id: "warmth",
        name: "Warmth",
        defaultValue: 0.4,
        mappings: [
          { parameter: "tone", rangeStart: 0.5, rangeEnd: 1 },
          { parameter: "drive", rangeStart: 0.2, rangeEnd: 0.9 },
        ],
      },
    ],
    dryWet: { enabled: true, defaultMix: 1 },
    bypass: { mode: "hard", defaultBypassed: false },
    ui: {
      accentColor: "#FF8844",
      category: "Saturation",
      shortDescription: "Tilt plus drive, one Warmth macro",
      tags: ["saturation"],
      layout: "vertical",
      parameterOrder: ["warmth", "tone", "drive", "mix"].filter((id) => id !== "warmth"),
    },
  };
}

describe("Build plan", () => {
  it("describes the chain in processing order", () => {
    const plan = compilePlan(specFrom(baseSpec()));
    expect(plan.chain.map((module) => module.moduleId)).toEqual(["zarlino.eq.tilt", "zarlino.saturation"]);
    expect(plan.chain[0]!.role).toContain("first in the chain");
    expect(plan.chain[1]!.role).toContain("last in the chain");
    expect(plan.summary).toContain("Tilt EQ then Saturation");
    expect(plan.summary).toContain("1 macro control");
  });

  it("reports macro-driven parameters", () => {
    const plan = compilePlan(specFrom(baseSpec()));
    expect(plan.parameters.find((parameter) => parameter.id === "drive")!.drivenByMacro).toBe(true);
    expect(plan.parameters.find((parameter) => parameter.id === "mix")!.drivenByMacro).toBe(false);
    expect(plan.macros[0]!.drives).toEqual(["tone", "drive"]);
  });

  it("sums latency across modules and notes it in milliseconds", () => {
    const spec = baseSpec();
    (spec.graph as { modules: unknown[] }).modules.push({
      instanceId: "lim",
      moduleId: "zarlino.limiter",
      moduleVersion: "1.0.0",
      parameters: {},
    });
    const plan = compilePlan(specFrom(spec));
    expect(plan.latencySamples).toBe(48);
    expect(plan.latencyMsAt48k).toBe(1);
    expect(plan.notes.join(" ")).toContain("48 samples of latency");
  });

  it("notes a fixed dry/wet when there is no mix control", () => {
    const spec = baseSpec();
    spec.dryWet = { enabled: true, defaultMix: 0.5 };
    (spec.parameters as unknown[]).pop();
    spec.ui = { ...(spec.ui as Record<string, unknown>), parameterOrder: ["tone", "drive"] };
    const plan = compilePlan(specFrom(spec));
    expect(plan.notes.join(" ")).toContain("Dry/wet is fixed at 50%");
  });

  it("is deterministic for the same spec", () => {
    const spec = specFrom(baseSpec());
    expect(JSON.stringify(compilePlan(spec))).toBe(JSON.stringify(compilePlan(spec)));
  });
});

describe("Interface templates", () => {
  it("is strictly nested: minimal âŠ† standard âŠ† advanced", () => {
    const spec = specFrom(baseSpec());
    const [minimal, standard, advanced] = previewAllTemplates(spec);
    const ids = (preview: typeof minimal) => new Set(preview!.controls.map((control) => control.id));

    for (const id of ids(minimal!)) expect(ids(standard!).has(id)).toBe(true);
    for (const id of ids(standard!)) expect(ids(advanced!).has(id)).toBe(true);
    expect(minimal!.drawnCount).toBeLessThanOrEqual(standard!.drawnCount);
    expect(standard!.drawnCount).toBeLessThanOrEqual(advanced!.drawnCount);
  });

  it("draws macros first in every template", () => {
    const spec = specFrom(baseSpec());
    for (const template of UI_TEMPLATES) {
      const preview = projectTemplate(spec, template);
      expect(preview.controls[0]!.id).toBe("macro:warmth");
    }
  });

  it("keeps more controls as density rises and reports the surface honestly", () => {
    const spec = specFrom(baseSpec());
    const minimal = projectTemplate(spec, "minimal");
    const standard = projectTemplate(spec, "standard");
    const advanced = projectTemplate(spec, "advanced");

    expect(standard.drawnCount).toBeGreaterThanOrEqual(minimal.drawnCount);
    expect(minimal.layout).toBe("one-column");
    expect(minimal.showsUnits).toBe(false);
    expect(advanced.showsValueReadouts).toBe(true);
    expect(advanced.hiddenCount).toBe(0);

    // Advanced surfaces every module parameter the spec leaves unexposed.
    const moduleLevel = advanced.controls.filter((control) => control.moduleLevel);
    expect(moduleLevel.length).toBeGreaterThan(0);
    expect(moduleLevel.every((control) => !control.exposedToHost)).toBe(true);
    expect(moduleLevel.some((control) => control.id === "eq.pivotHz")).toBe(true);
  });

  it("never shows a module-level control in minimal or standard", () => {
    const spec = specFrom(baseSpec());
    for (const template of ["minimal", "standard"] as const) {
      const preview = projectTemplate(spec, template);
      expect(preview.controls.some((control) => control.moduleLevel)).toBe(false);
    }
  });

  it("groups controls without losing any drawn control", () => {
    const spec = specFrom(baseSpec());
    for (const template of UI_TEMPLATES) {
      const preview = projectTemplate(spec, template);
      const grouped = preview.groups.flatMap((group) => group.controls.map((control) => control.id));
      expect(grouped.sort()).toEqual(preview.controls.map((control) => control.id).sort());
    }
  });

  it("renders schematic rows that respect the template column count", () => {
    const spec = specFrom(baseSpec());
    const standard = projectTemplate(spec, "standard");
    expect(standard.columns).toBe(2);
    for (const row of standard.rows) expect(row.length).toBeLessThanOrEqual(2);
    const minimal = projectTemplate(spec, "minimal");
    for (const row of minimal.rows) expect(row.length).toBeLessThanOrEqual(1);
  });

  it("shows switches and selects as discrete states", () => {
    const spec = baseSpec();
    (spec.parameters as unknown[]).push({
      id: "shape",
      name: "Shape",
      target: "eq.pivotHz",
      range: { min: 200, max: 2000, default: 440 },
      unit: "Hz",
      group: "Tone",
    });
    (spec.parameters as unknown[]).push({
      id: "mode",
      name: "Mode",
      target: "sat.mode",
      range: { min: 0, max: 5, default: 2 },
      group: "Colour",
    });
    const preview = projectTemplate(specFrom(spec), "advanced");
    expect(preview.controls.find((control) => control.id === "mode")!.kind).toBe("select");
    expect(formatControlValue(preview.controls.find((control) => control.id === "mode")!)).toBe("Position 3");
    expect(preview.controls.find((control) => control.id === "tone")!.kind).toBe("knob");
  });

  it("hides a parameter that is not exposed to the host from Minimal and Standard", () => {
    const spec = baseSpec();
    (spec.parameters as unknown[])[1] = { ...((spec.parameters as Array<Record<string, unknown>>)[1]!), exposeToHost: false };
    const parsed = specFrom(spec);
    expect(projectTemplate(parsed, "standard").controls.some((control) => control.id === "drive")).toBe(false);
    expect(projectTemplate(parsed, "advanced").controls.some((control) => control.id === "drive")).toBe(true);
  });
});
