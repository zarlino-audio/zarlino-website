/**
 * Turning a failure into something a customer can act on.
 *
 * The rule: the customer never sees a compiler log, a stack trace, a GitHub
 * URL, a runner path or an internal identifier. They see one of a small number
 * of named states, a plain-English explanation and what to do next. The raw
 * evidence stays on the build record (`failure_state`, the sync detail and the
 * published `qa-report.json`) and is available to the founder console and to
 * support — it is simply never the first thing a musician reads.
 *
 * Every message here is written for a non-programmer and never promises a
 * plugin that does not exist.
 */

export type FailureCategory =
  | "UNSUPPORTED_REQUEST"
  | "INVALID_SPECIFICATION"
  | "NOT_ENOUGH_CREDITS"
  | "BUILD_SERVICE_UNAVAILABLE"
  | "COMPILATION_FAILED"
  | "QUALITY_CHECK_FAILED"
  | "BUILD_TIMED_OUT"
  | "BUILD_CANCELLED"
  | "EVIDENCE_INVALID"
  | "UNKNOWN";

export interface ExplainedFailure {
  category: FailureCategory;
  /** Short state label, safe for a badge. */
  title: string;
  /** One or two sentences for the customer. */
  message: string;
  /** What the customer can do next (empty when nothing helps). */
  action: string;
  /** Whether pressing "Build" again could plausibly succeed. */
  retryable: boolean;
}

export function explainFailure(failureState: string | null | undefined): ExplainedFailure {
  switch (String(failureState ?? "").toUpperCase()) {
    case "UNSUPPORTED_REQUEST":
      return {
        category: "UNSUPPORTED_REQUEST",
        title: "Not something we can build yet",
        message: "This request needs a processor that is not in the certified Zarlino module set, so we will not fake it.",
        action: "Ask for the closest supported design, or change the request.",
        retryable: false,
      };

    case "INVALID_SPECIFICATION":
      return {
        category: "INVALID_SPECIFICATION",
        title: "The design could not be validated",
        message: "The processor description did not pass the factory's validation rules, so nothing was built.",
        action: "Refine the description — for example change the control range or remove a stage.",
        retryable: false,
      };

    case "ENTITLEMENT_EXHAUSTED":
      return {
        category: "NOT_ENOUGH_CREDITS",
        title: "No builds left this month",
        message: "Your plan's build allowance for this month is used up, so this build was not started.",
        action: "Upgrade to Pro, or wait for the allowance to reset.",
        retryable: false,
      };

    case "DISPATCH_NOT_CONFIGURED":
    case "DISPATCH_FAILED":
    case "DISPATCH_UNAUTHORIZED":
    case "WORKFLOW_NOT_FOUND":
      return {
        category: "BUILD_SERVICE_UNAVAILABLE",
        title: "Build service unavailable",
        message: "We could not start the build server. This is on our side, and the build was not charged against a working server.",
        action: "Try again in a few minutes. If it keeps happening, contact support.",
        retryable: true,
      };

    case "BUILD_RUN_FAILED":
      return {
        category: "COMPILATION_FAILED",
        title: "The build failed",
        message: "The build server stopped while assembling your plugin. No download is available for a failed build.",
        action: "Try the build again. If it fails twice, simplify the design.",
        retryable: true,
      };

    case "COMPILATION_FAILED":
      return {
        category: "COMPILATION_FAILED",
        title: "The build failed to compile",
        message: "Your design could not be compiled into a plugin. This is a fault on our side — the design itself was valid.",
        action: "Try again, and tell support if it repeats.",
        retryable: true,
      };

    case "QA_GATE_FAILED":
      return {
        category: "QUALITY_CHECK_FAILED",
        title: "Did not pass the quality check",
        message: "The plugin built, but it failed Zarlino's automated audio and stability checks, so it was withheld.",
        action: "Adjust the design (extreme settings are the usual cause) and build again.",
        retryable: true,
      };

    case "BUILD_TIMEOUT":
      return {
        category: "BUILD_TIMED_OUT",
        title: "The build took too long",
        message: "The build server did not finish in the time allowed, so the build was closed. No download is available.",
        action: "Try again. If it repeats, reduce the number of modules.",
        retryable: true,
      };

    case "BUILD_CANCELLED":
      return {
        category: "BUILD_CANCELLED",
        title: "Build cancelled",
        message: "The build was cancelled before it finished.",
        action: "Start a new build when you are ready.",
        retryable: true,
      };

    case "EVIDENCE_INVALID":
      return {
        category: "EVIDENCE_INVALID",
        title: "Build evidence was unreadable",
        message: "The build report uploaded by the build server could not be verified, so the artifact was withheld.",
        action: "Build again.",
        retryable: true,
      };

    default:
      return {
        category: "UNKNOWN",
        title: "Build failed",
        message: "The build did not finish. No download is available for a failed build.",
        action: "Try again, and contact support if it repeats.",
        retryable: true,
      };
  }
}

/** Map of raw QA gate ids (from the quality report) to customer-facing causes. */
const QA_GATE_EXPLANATIONS: Record<string, string> = {
  init: "the plugin could not initialise",
  smoke: "the plugin produced no output",
  silence: "silent input produced noise",
  impulse: "the processor coloured an impulse incorrectly",
  nan: "the output contained an invalid number",
  denormal: "the processor did not handle near-silent input",
  extremes: "an extreme control setting destabilised the output",
  automation: "rapid control changes broke the output",
  channels: "the channel configuration was mishandled",
  samplerate: "a sample rate was mishandled",
  blocksize: "an unusual buffer size was mishandled",
  reprepare: "re-initialising the plugin failed",
  bypass: "bypass did not pass audio through unchanged",
  state: "saving and restoring settings failed",
  latency: "the reported latency did not match the audio",
  gain: "the output level ran away",
  cpu: "the processor used too much CPU",
  tail: "the processor did not settle after input stopped",
  ceiling: "the limiter exceeded its ceiling",
  bundle: "the packaged plugin bundle was incomplete",
};

/**
 * Explain a quality-gate report: which checks failed, in customer words.
 * Unknown gate ids are reported generically rather than leaked verbatim.
 */
export function explainQualityReport(report: unknown): { failedGates: string[]; summary: string } {
  const gates = Array.isArray((report as { gates?: unknown })?.gates)
    ? ((report as { gates: Array<{ name?: string; id?: string; passed?: boolean; ok?: boolean }> }).gates)
    : [];

  const failed = gates.filter((gate) => gate.passed === false || gate.ok === false);
  const names = failed.map((gate) => String(gate.name ?? gate.id ?? "").toLowerCase()).filter(Boolean);
  const described = names.map((name) => QA_GATE_EXPLANATIONS[name] ?? null).filter((text): text is string => Boolean(text));

  if (described.length === 0) {
    return {
      failedGates: names,
      summary: "The plugin failed Zarlino's automated audio and stability checks, so it was withheld.",
    };
  }
  return {
    failedGates: names,
    summary: `The plugin was withheld because ${described.join("; ")}.`,
  };
}
