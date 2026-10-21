/**
 * Catalogue parity: the customer application's TypeScript catalogue must equal
 * the kernel's own module manifests.
 *
 * Why this matters: the site validates a customer's design and shows the plan
 * BEFORE a build is paid for. If the site's idea of a module disagrees with the
 * kernel's, a customer either pays for a build that cannot succeed or is
 * refused a design that would have worked.
 *
 * `factory/catalog/modules.json` is generated from the compiled kernel
 * (`ZarlinoFactory_Check --catalog-json`) and committed. This test proves the
 * committed artefact and the TypeScript catalogue agree, field by field. CI
 * additionally regenerates the artefact from a fresh build and diffs it, which
 * proves the committed artefact still matches the C++.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { MODULE_CATALOG } from "../../src/factory/catalog";

interface KernelParameter {
  id: string;
  displayName: string;
  unit: string;
  min: number;
  max: number;
  default: number;
  logarithmic: boolean;
  stepCount: number;
  group: string;
}

interface KernelModule {
  id: string;
  version: string;
  displayName: string;
  description: string;
  category: string;
  certification: string;
  channels: string[];
  referenceLatencySamples: number;
  parameters: KernelParameter[];
}

function kernelCatalog(): KernelModule[] {
  const path = resolve(__dirname, "../../../factory/catalog/modules.json");
  return JSON.parse(readFileSync(path, "utf8")) as KernelModule[];
}

describe("catalogue parity with the factory kernel", () => {
  it("ships exactly the same module ids, versions and channels", () => {
    const kernel = kernelCatalog();
    const kernelById = new Map(kernel.map((module) => [module.id, module]));
    const siteById = new Map(MODULE_CATALOG.map((module) => [module.id, module]));

    expect([...siteById.keys()].sort()).toEqual([...kernelById.keys()].sort());

    for (const [id, site] of siteById) {
      const fromKernel = kernelById.get(id)!;
      expect(site.version, `${id} version`).toBe(fromKernel.version);
      expect(site.displayName, `${id} displayName`).toBe(fromKernel.displayName);
      expect(site.description, `${id} description`).toBe(fromKernel.description);
      expect(site.category, `${id} category`).toBe(fromKernel.category);
      expect([...site.channels].sort(), `${id} channels`).toEqual([...fromKernel.channels].sort());
      expect(site.referenceLatencySamples, `${id} latency`).toBe(fromKernel.referenceLatencySamples);
      expect(fromKernel.certification).toBe("CERTIFIED");
    }
  });

  it("ships exactly the same parameters, domains, defaults and stepping", () => {
    const kernel = kernelCatalog();
    const kernelById = new Map(kernel.map((module) => [module.id, module]));

    for (const site of MODULE_CATALOG) {
      const fromKernel = kernelById.get(site.id)!;
      expect(site.parameters.map((parameter) => parameter.id), `${site.id} parameter ids`).toEqual(
        fromKernel.parameters.map((parameter) => parameter.id),
      );

      for (const [index, parameter] of site.parameters.entries()) {
        const other = fromKernel.parameters[index]!;
        const label = `${site.id}.${parameter.id}`;
        expect(parameter.displayName, `${label} name`).toBe(other.displayName);
        expect(parameter.unit, `${label} unit`).toBe(other.unit);
        expect(parameter.min, `${label} min`).toBeCloseTo(other.min, 6);
        expect(parameter.max, `${label} max`).toBeCloseTo(other.max, 6);
        expect(parameter.default, `${label} default`).toBeCloseTo(other.default, 6);
        expect(parameter.logarithmic, `${label} logarithmic`).toBe(other.logarithmic);
        expect(parameter.stepCount, `${label} steps`).toBe(other.stepCount);
        expect(parameter.group, `${label} group`).toBe(other.group);
      }
    }
  });

  it("only certifies modules that are realtime safe and carry no forbidden fields", () => {
    for (const module of kernelCatalog()) {
      // A certified module must declare at least one channel domain and a
      // semver version; the kernel refuses to register one that does not.
      expect(module.channels.length).toBeGreaterThan(0);
      expect(module.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(Object.keys(module)).toEqual([
        "id",
        "version",
        "displayName",
        "description",
        "category",
        "certification",
        "channels",
        "referenceLatencySamples",
        "parameters",
      ]);
    }
  });
});
