export interface AgeGateResult {
  passes: boolean;
  ageHours: number;
  minHours: number;
  remainingHours: number;
}

/** Pure age-vs-threshold decision — no I/O, so it's trivial to unit test. */
export function evaluateAgeGate(createdAt: string, minHours: number, now: Date = new Date()): AgeGateResult {
  const ageHours = (now.getTime() - new Date(createdAt).getTime()) / (1000 * 60 * 60);
  const passes = ageHours >= minHours;
  return {
    passes,
    ageHours,
    minHours,
    remainingHours: Math.max(0, minHours - ageHours),
  };
}

export interface CheckOutput {
  conclusion: "success" | "failure";
  title: string;
  summary: string;
}

export type BypassReason = "label" | "path";

export interface BypassInfo {
  bypassed?: boolean;
  bypassReason?: BypassReason;
}

/** "hour" for exactly 1, "hours" otherwise — applied to the same rounded value that gets displayed. */
function hourWord(value: number): string {
  return value === 1 ? "hour" : "hours";
}

export function summaryFor(result: AgeGateResult & BypassInfo): CheckOutput {
  const age = result.ageHours.toFixed(1);

  if (result.bypassed) {
    const via = result.bypassReason === "path" ? "changed paths matching a bypass rule" : "a bypass label";
    return {
      conclusion: "success",
      title: `Bypassed via ${via}`,
      summary: `This pull request bypasses the age requirement (${via}), so this check passes regardless of how long it's been open (currently ${age}h).`,
    };
  }

  if (result.passes) {
    return {
      conclusion: "success",
      title: `Open for ${age}h — minimum ${result.minHours}h met`,
      summary: `This pull request has been open for ${age} ${hourWord(Number(age))}, meeting the ${result.minHours}-hour minimum age requirement.`,
    };
  }
  const remaining = result.remainingHours.toFixed(1);
  return {
    conclusion: "failure",
    title: `Open for ${age}h — needs ${result.minHours}h (${remaining}h remaining)`,
    summary:
      `This pull request must stay open for at least ${result.minHours} ${hourWord(result.minHours)} before this check passes. ` +
      `It has been open for ${age} ${hourWord(Number(age))}; about ${remaining} more ${hourWord(Number(remaining))} ` +
      `${Number(remaining) === 1 ? "remains" : "remain"}. ` +
      `This check re-evaluates on a schedule, so it will flip to green on its own once the minimum age is reached — no new commit needed.`,
  };
}
