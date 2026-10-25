/**
 * The customer-side AI layer: description -> validated PluginSpec.
 *
 * The language model proposes; this module disposes. Every reply goes through
 * the deterministic validator, and a rejected reply is repaired by giving the
 * model the exact validator error and asking again — bounded, so an unusable
 * prompt cannot become an unbounded bill.
 *
 * A model that replies with something the certified module set cannot express
 * yields a clear "not supported" answer with the closest supported idea, never
 * a silent approximation.
 */

import { catalogForPrompt } from "./catalog";
import { compilePlan, type BuildPlan } from "./plan";
import { describeSpecError, parsePluginSpec, type PluginSpec, type SpecError } from "./spec";

export const MAX_ATTEMPTS = 3;
export const BUILD_CONSTRAINTS = { maxModules: 5, maxParameters: 8, maxMacros: 2 } as const;

/**
 * Gateway failures that say nothing about the customer's request, so the same
 * call is worth repeating: the model's reply was not JSON, the reply frame was
 * unreadable, or the gateway itself was briefly unreachable.
 */
const TRANSIENT_GATEWAY_CODES = new Set(["UNPARSEABLE", "PROVIDER_ERROR", "GATEWAY_UNREACHABLE", "GATEWAY_BAD_RESPONSE"]);
/** Hard cap on a customer description, so one prompt cannot become a large bill. */
export const MAX_DESCRIPTION_CHARS = 2000;

export interface AiUsage {
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
  latencyMs: number;
}

export interface InterpretRequestPayload {
  mode: "initial" | "refine";
  description: string;
  currentSpec?: unknown;
  catalog: ReturnType<typeof catalogForPrompt>;
  constraints: typeof BUILD_CONSTRAINTS;
  validationError?: string;
}

export type GatewayResponse =
  | { ok: true; spec: Record<string, unknown>; message: string; usage: AiUsage }
  | { ok: false; code: string; message: string; usage: AiUsage | null };

/** The HTTP gateway interface, so tests can substitute a deterministic model. */
export interface AiGateway {
  interpret(payload: InterpretRequestPayload): Promise<GatewayResponse>;
}

export function createAiGateway(options: { baseUrl: string; secret: string; fetchImpl?: typeof fetch }): AiGateway {
  const fetchImpl = options.fetchImpl ?? fetch;
  const base = options.baseUrl.replace(/\/$/, "");
  return {
    async interpret(payload) {
      let response: Response;
      try {
        response = await fetchImpl(`${base}/api/factory/interpret`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-factory-gateway": options.secret },
          body: JSON.stringify(payload),
        });
      } catch {
        return { ok: false, code: "GATEWAY_UNREACHABLE", message: "The assistant is unreachable right now.", usage: null };
      }

      const body = (await response.json().catch(() => null)) as
        | { ok?: boolean; spec?: Record<string, unknown>; message?: string; code?: string; usage?: AiUsage | null }
        | null;

      if (!body) return { ok: false, code: "GATEWAY_BAD_RESPONSE", message: "The assistant returned an unreadable response.", usage: null };
      if (response.ok && body.ok === true && body.spec) {
        return {
          ok: true,
          spec: body.spec,
          message: typeof body.message === "string" ? body.message : "",
          usage: body.usage ?? emptyUsage(),
        };
      }
      return {
        ok: false,
        code: typeof body.code === "string" ? body.code : "ASSISTANT_ERROR",
        message: typeof body.message === "string" ? body.message : "The assistant could not help with that.",
        usage: body.usage ?? null,
      };
    },
  };
}

export function emptyUsage(): AiUsage {
  return { provider: "none", model: "none", promptTokens: 0, completionTokens: 0, costUsd: 0, latencyMs: 0 };
}

// ---------------------------------------------------------------------------
// Out-of-scope detection
// ---------------------------------------------------------------------------

/**
 * Processor families the certified set genuinely cannot build. Recognising them
 * here means the customer gets a straight answer even if a model would happily
 * approximate with the wrong module.
 */
const UNSUPPORTED_FAMILIES: Array<{ pattern: RegExp; label: string; alternative: string }> = [
  // Reverb, delay, chorus, flanger, phaser, tremolo, de-essing, clipping, mid/side
  // and excitation are all CERTIFIED primitives now (see catalog.ts), so they are
  // deliberately absent from this list: naming them here would refuse a request
  // the factory can build.
  {
    pattern: /\b(convolution|impulse\s+response|ir\s+loader|cabinet\s+impulse)\b/i,
    label: "convolution processing",
    alternative: "the algorithmic reverb, which builds a room from certified primitives without an impulse response",
  },
  {
    pattern: /\b(synthesizer|synth|oscillator|wavetable|sampler|drum\s+machine)\b/i,
    label: "an instrument",
    alternative: "a processing chain - Zarlino builds processors, not instruments",
  },
  {
    pattern: /\b(pitch\s*shift|harmoni[sz]er|octaver|auto[-\s]?tune|formant\s+shift|vocoder)\b/i,
    label: "pitch shifting",
    alternative: "a chorus or a stereo width stage for a similar sense of size without transposing",
  },
  {
    pattern: /\b(amp\s*sim|guitar\s+amp|speaker\s+simulation|power\s+amp)\b/i,
    label: "amp/cabinet simulation",
    alternative: "a saturation or clipper plus a tilt EQ, which colours a DI signal without cabinet impulses",
  },
  {
    pattern: /\b(multiband\s+compress\w*|multiband|dynamic\s+eq|sidechain|side[-\s]chain)\b/i,
    label: "multiband or sidechain processing",
    alternative: "a compressor plus a parametric EQ, or the de-esser for one band",
  },
  {
    pattern: /\b(true[-\s]?peak|linear[-\s]?phase|spectral\s+(?:repair|denois\w*)|declip\w*)\b/i,
    label: "a specialised spectral/oversampled process",
    alternative: "the certified lookahead limiter, which already limits safely at its ceiling",
  },
];

export interface UnsupportedHint {
  label: string;
  alternative: string;
  message: string;
}

export function detectUnsupportedRequest(description: string): UnsupportedHint | null {
  for (const family of UNSUPPORTED_FAMILIES) {
    if (family.pattern.test(description)) {
      return {
        label: family.label,
        alternative: family.alternative,
        message: `Zarlino's certified module set cannot build ${family.label} yet. The closest thing it can build is ${family.alternative}.`,
      };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// The interpret + validate + repair loop
// ---------------------------------------------------------------------------

export type InterpretOutcome =
  | {
      ok: true;
      spec: PluginSpec;
      plan: BuildPlan;
      message: string;
      usage: AiUsage;
      attempts: number;
      totals: AiUsage;
    }
  | {
      ok: false;
      code: "UNSUPPORTED" | "INVALID_SPEC" | "ASSISTANT_ERROR";
      message: string;
      /** For UNSUPPORTED: a concrete alternative the customer can accept. */
      alternative?: string;
      validationError?: SpecError | null;
      usage: AiUsage | null;
      attempts: number;
      totals: AiUsage;
    };

export interface InterpretInput {
  mode: "initial" | "refine";
  description: string;
  currentSpec?: PluginSpec | null;
}

function addUsage(a: AiUsage, b: AiUsage | null): AiUsage {
  if (!b) return a;
  return {
    provider: b.provider || a.provider,
    model: b.model || a.model,
    promptTokens: a.promptTokens + b.promptTokens,
    completionTokens: a.completionTokens + b.completionTokens,
    costUsd: Math.round((a.costUsd + b.costUsd) * 1_000_000) / 1_000_000,
    latencyMs: a.latencyMs + b.latencyMs,
  };
}

/**
 * Ask the model for a spec, validate it deterministically, repair on failure.
 * Returns only documents that have already passed the authoritative validation.
 */
export async function interpretToSpec(gateway: AiGateway, input: InterpretInput): Promise<InterpretOutcome> {
  let totals = emptyUsage();
  let validationError: SpecError | null = null;
  let attempts = 0;

  // A clearly impossible request is answered without spending a model call.
  const hint = detectUnsupportedRequest(input.description);
  if (hint) {
    return {
      ok: false,
      code: "UNSUPPORTED",
      message: hint.message,
      alternative: hint.alternative,
      usage: null,
      attempts: 0,
      totals,
    };
  }

  while (attempts < MAX_ATTEMPTS) {
    attempts += 1;
    const response = await gateway.interpret({
      mode: input.mode,
      description: input.description,
      currentSpec: input.currentSpec ?? undefined,
      catalog: catalogForPrompt(),
      constraints: BUILD_CONSTRAINTS,
      validationError: validationError ? describeSpecError(validationError) : undefined,
    });

    totals = addUsage(totals, response.usage);

    if (!response.ok) {
      // A no-JSON or provider blip from the model is worth one more try: it is
      // not a statement about the customer's request. Repeating an unusable
      // answer three times, however, is just spend, so this is capped.
      if (TRANSIENT_GATEWAY_CODES.has(response.code) && attempts < MAX_ATTEMPTS) continue;
      return {
        ok: false,
        code: "ASSISTANT_ERROR",
        message: response.message,
        usage: response.usage,
        attempts,
        totals,
      };
    }

    // An explicit "cannot do that" from the model is an answer, not a failure.
    if (response.spec.unsupported === true) {
      const reason = typeof response.spec.reason === "string" ? response.spec.reason : "This request needs a processor Zarlino cannot build yet.";
      const closest = typeof response.spec.closest === "string" ? response.spec.closest : undefined;
      return {
        ok: false,
        code: "UNSUPPORTED",
        message: reason,
        alternative: closest,
        usage: response.usage,
        attempts,
        totals,
      };
    }

    const parsed = parsePluginSpec(response.spec);
    if (!parsed.ok) {
      validationError = parsed.error;
      continue;
    }

    return {
      ok: true,
      spec: parsed.spec,
      plan: compilePlan(parsed.spec),
      message: response.message || "Here is what Zarlino would build.",
      usage: response.usage,
      attempts,
      totals,
    };
  }

  return {
    ok: false,
    code: "INVALID_SPEC",
    message:
      "I could not turn that into a valid processor design. Try describing the sound, the effect type and the controls you want in a sentence or two.",
    validationError,
    usage: null,
    attempts,
    totals,
  };
}
