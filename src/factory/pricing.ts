/**
 * The ONE authoritative pricing and entitlement configuration.
 *
 * Nothing else in the codebase may contain a plan price, a plan limit or a
 * token price: every screen, check, invoice and report reads this module.
 * Changing a number here changes the product everywhere at once.
 *
 * Two separate concerns live here and must not be confused:
 *
 *   1. PLANS - what a customer gets, and what they pay for it.
 *   2. VARIABLE_COST - what a build and an AI call cost Zarlino, used to
 *      compute contribution margin and to decide whether pricing works.
 *
 * Free and Pro run the SAME certified DSP at the SAME quality. They differ in
 * capacity (builds, AI, projects, retention) and in rights (commercial use),
 * never in audio quality.
 */

export const PRICING_VERSION = "2026-10-21.1";

export const PLAN_IDS = ["free", "pro"] as const;
export type PlanId = (typeof PLAN_IDS)[number];

export function isPlanId(value: unknown): value is PlanId {
  return typeof value === "string" && (PLAN_IDS as readonly string[]).includes(value);
}

export interface PlanEntitlements {
  /** Paid builds per calendar month; a reused identical build does not count. */
  buildsPerMonth: number;
  /** Interpret/refine requests per calendar month. */
  aiRequestsPerMonth: number;
  /** Model tokens per calendar month, input+output, a hard ceiling. */
  aiTokensPerMonth: number;
  /** Live builds at once. */
  concurrentBuilds: number;
  /** Stored projects. */
  projects: number;
  /** How long build artifacts stay downloadable. */
  retentionDays: number;
  /** Right to sell or redistribute the plugins you build. */
  commercialUse: boolean;
  /** Whether a build is dispatched ahead of free-tier builds. */
  priorityBuilds: boolean;
  /** Builds longer than this are cancelled (runaway protection). */
  maxBuildMinutes: number;
}

export interface PlanDefinition {
  id: PlanId;
  name: string;
  tagline: string;
  /** `null` for a free plan; otherwise minor units of `ANGEL_PRICING.currency`. */
  price: { amountMinor: number; currency: string; interval: "month" | "year" } | null;
  /** Optional discounted yearly price shown next to the monthly one. */
  annual: { amountMinor: number; currency: string; interval: "year" } | null;
  entitlements: PlanEntitlements;
  features: string[];
}

const FREE_ENTITLEMENTS: PlanEntitlements = {
  buildsPerMonth: 2,
  aiRequestsPerMonth: 40,
  aiTokensPerMonth: 120_000,
  concurrentBuilds: 1,
  projects: 3,
  retentionDays: 14,
  commercialUse: false,
  priorityBuilds: false,
  maxBuildMinutes: 30,
};

const PRO_ENTITLEMENTS: PlanEntitlements = {
  buildsPerMonth: 30,
  aiRequestsPerMonth: 600,
  aiTokensPerMonth: 2_000_000,
  concurrentBuilds: 2,
  projects: 50,
  retentionDays: 180,
  commercialUse: true,
  priorityBuilds: true,
  maxBuildMinutes: 30,
};

export const PLANS: Record<PlanId, PlanDefinition> = {
  free: {
    id: "free",
    name: "Free",
    tagline: "Build a real plugin and hear it in your DAW. Same DSP, same quality.",
    price: null,
    annual: null,
    entitlements: FREE_ENTITLEMENTS,
    features: [
      "2 builds per month",
      "Every certified Zarlino module",
      "All three interfaces (Minimal, Standard, Advanced)",
      "Personal use only (no selling your plugins)",
      "Downloads kept for 14 days",
    ],
  },
  pro: {
    id: "pro",
    name: "Pro",
    tagline: "Build more, keep longer, and sell what you make.",
    price: { amountMinor: 19900, currency: "GHS", interval: "month" },
    annual: { amountMinor: 199000, currency: "GHS", interval: "year" },
    entitlements: PRO_ENTITLEMENTS,
    features: [
      "30 builds per month",
      "Commercial rights — sell and redistribute the plugins you build",
      "2 builds at once, priority queue",
      "Downloads kept for 180 days",
      "50 projects",
    ],
  },
};

/** The anchor currency/plan a checkout defaults to when the caller is silent. */
export const PRICING = {
  version: PRICING_VERSION,
  currency: "GHS",
  defaultPlan: "pro" as PlanId,
  plans: PLANS,
} as const;

export function planDefinition(planId: string): PlanDefinition {
  return PLANS[isPlanId(planId) ? planId : "free"];
}

export function entitlementsFor(planId: string): PlanEntitlements {
  return planDefinition(planId).entitlements;
}

/** Monthly-equivalent price in minor units, for comparison tables. */
export function monthlyEquivalentMinor(planId: string): number | null {
  const plan = planDefinition(planId);
  if (!plan.price) return null;
  return plan.price.interval === "month" ? plan.price.amountMinor : Math.round(plan.price.amountMinor / 12);
}

// ---------------------------------------------------------------------------
// Variable cost model
// ---------------------------------------------------------------------------

/**
 * Measured/known provider costs. `githubWindowsMinuteUsd` is the
 * windows-2022 Actions rate; AI prices are DeepSeek's list prices per million
 * tokens (the same figures the Executive OS meters against); R2 is the
 * standard storage rate.
 *
 * These are ESTIMATES for margin reporting, not invoice-accurate accounting.
 */
export const VARIABLE_COST = {
  githubWindowsMinuteUsd: 0.16,
  /** Actions queue + artifact upload/download overhead, per build. */
  buildOverheadUsd: 0.01,
  r2StorageGbMonthUsd: 0.015,
  aiInputPerMillionUsd: 0.27,
  aiOutputPerMillionUsd: 1.1,
} as const;

export interface BuildCostInput {
  compileSeconds: number;
  testSeconds: number;
  packageSeconds?: number;
  artifactBytes?: number;
  aiCostUsd?: number;
}

/**
 * Estimated variable cost of one build in USD. Wall time is billed per started
 * minute, rounded up, as GitHub does.
 */
export function estimateBuildVariableCost(input: BuildCostInput): number {
  const seconds = Math.max(0, input.compileSeconds) + Math.max(0, input.testSeconds) + Math.max(0, input.packageSeconds ?? 0);
  const minutes = Math.ceil(seconds / 60);
  const compute = minutes * VARIABLE_COST.githubWindowsMinuteUsd;
  const storage = ((input.artifactBytes ?? 0) / 1e9) * VARIABLE_COST.r2StorageGbMonthUsd;
  const total = compute + VARIABLE_COST.buildOverheadUsd + storage + Math.max(0, input.aiCostUsd ?? 0);
  return round6(total);
}

/** Estimated variable cost of one AI call in USD. */
export function estimateAiCostUsd(promptTokens: number, completionTokens: number): number {
  const cost =
    (Math.max(0, promptTokens) / 1_000_000) * VARIABLE_COST.aiInputPerMillionUsd +
    (Math.max(0, completionTokens) / 1_000_000) * VARIABLE_COST.aiOutputPerMillionUsd;
  return round6(cost);
}

/** Gross margin in USD for a paid month, given measured costs. */
export function contributionMarginUsd(priceMinor: number, currency: string, variableCostUsd: number, usdPerCurrency: number): number {
  const revenueUsd = (priceMinor / 100) * (currency === "USD" ? 1 : usdPerCurrency);
  return round6(revenueUsd - variableCostUsd);
}

function round6(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

// ---------------------------------------------------------------------------
// Entitlement evaluation (pure; the caller supplies the measured usage)
// ---------------------------------------------------------------------------

export interface UsageSnapshot {
  buildsThisMonth: number;
  aiRequestsThisMonth: number;
  aiTokensThisMonth: number;
  activeBuilds: number;
  projects: number;
}

export type EntitlementAction =
  | { kind: "build" }
  | { kind: "ai"; estimatedTokens?: number }
  | { kind: "create-project" }
  | { kind: "download"; artifactAgeDays: number };

export type EntitlementDecision =
  | { allowed: true; plan: PlanId }
  | { allowed: false; plan: PlanId; reason: EntitlementReason; message: string; upgrade: boolean };

export type EntitlementReason =
  | "BUILD_ALLOWANCE"
  | "CONCURRENT_BUILDS"
  | "AI_ALLOWANCE"
  | "TOKEN_ALLOWANCE"
  | "PROJECT_LIMIT"
  | "RETENTION_EXPIRED";

/**
 * Decide whether an expensive action is allowed under a plan.
 * Fail closed: an unknown plan is treated as Free.
 */
export function evaluateEntitlement(
  planId: string,
  usage: UsageSnapshot,
  action: EntitlementAction,
): EntitlementDecision {
  const plan = isPlanId(planId) ? planId : "free";
  const limits = entitlementsFor(plan);
  const deny = (reason: EntitlementReason, message: string): EntitlementDecision => ({
    allowed: false,
    plan,
    reason,
    message,
    upgrade: plan === "free",
  });

  switch (action.kind) {
    case "build":
      if (usage.buildsThisMonth >= limits.buildsPerMonth) {
        return deny(
          "BUILD_ALLOWANCE",
          `Your ${planDefinition(plan).name} plan includes ${limits.buildsPerMonth} build${limits.buildsPerMonth === 1 ? "" : "s"} per month and you have used all of them.`,
        );
      }
      if (usage.activeBuilds >= limits.concurrentBuilds) {
        return deny(
          "CONCURRENT_BUILDS",
          `You already have ${usage.activeBuilds} build${usage.activeBuilds === 1 ? "" : "s"} running. Your plan allows ${limits.concurrentBuilds} at a time — wait for one to finish.`,
        );
      }
      return { allowed: true, plan };

    case "ai": {
      if (usage.aiRequestsThisMonth >= limits.aiRequestsPerMonth) {
        return deny(
          "AI_ALLOWANCE",
          `Your ${planDefinition(plan).name} plan includes ${limits.aiRequestsPerMonth} assistant requests per month and you have used all of them.`,
        );
      }
      const estimate = Math.max(0, action.estimatedTokens ?? 0);
      if (usage.aiTokensThisMonth + estimate > limits.aiTokensPerMonth) {
        return deny(
          "TOKEN_ALLOWANCE",
          `This request would exceed your monthly assistant allowance (${limits.aiTokensPerMonth.toLocaleString("en-US")} tokens).`,
        );
      }
      return { allowed: true, plan };
    }

    case "create-project":
      if (usage.projects >= limits.projects) {
        return deny(
          "PROJECT_LIMIT",
          `Your ${planDefinition(plan).name} plan holds ${limits.projects} project${limits.projects === 1 ? "" : "s"}. Delete one or upgrade to keep building.`,
        );
      }
      return { allowed: true, plan };

    case "download":
      if (action.artifactAgeDays > limits.retentionDays) {
        return deny(
          "RETENTION_EXPIRED",
          `This build is older than your ${limits.retentionDays}-day download window. Rebuild the project to get a fresh artifact.`,
        );
      }
      return { allowed: true, plan };

    default:
      return deny("BUILD_ALLOWANCE", "Unknown action.");
  }
}

/** Human-readable allowance summary for the dashboard. */
export function entitlementSummary(planId: string, usage: UsageSnapshot): {
  plan: PlanId;
  planName: string;
  builds: { used: number; limit: number };
  aiRequests: { used: number; limit: number };
  projects: { used: number; limit: number };
  commercialUse: boolean;
  retentionDays: number;
} {
  const plan = isPlanId(planId) ? planId : "free";
  const limits = entitlementsFor(plan);
  return {
    plan,
    planName: planDefinition(plan).name,
    builds: { used: usage.buildsThisMonth, limit: limits.buildsPerMonth },
    aiRequests: { used: usage.aiRequestsThisMonth, limit: limits.aiRequestsPerMonth },
    projects: { used: usage.projects, limit: limits.projects },
    commercialUse: limits.commercialUse,
    retentionDays: limits.retentionDays,
  };
}
