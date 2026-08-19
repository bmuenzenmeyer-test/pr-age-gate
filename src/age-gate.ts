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

/** Splits an hours value into whole hours + minutes, rounded to the nearest minute. */
function toHoursAndMinutes(hours: number): { h: number; m: number } {
  const totalMinutes = Math.round(hours * 60);
  return { h: Math.floor(totalMinutes / 60), m: totalMinutes % 60 };
}

/** Compact form for titles, e.g. "2h 6m", "45m", "3h". */
function formatCompact(hours: number): string {
  const { h, m } = toHoursAndMinutes(hours);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/** Prose form for summary text, e.g. "2 hours and 6 minutes", "45 minutes", "1 hour". */
function formatWords(hours: number): string {
  const { h, m } = toHoursAndMinutes(hours);
  const hPart = h > 0 ? `${h} ${h === 1 ? "hour" : "hours"}` : "";
  const mPart = m > 0 || h === 0 ? `${m} ${m === 1 ? "minute" : "minutes"}` : "";
  return hPart && mPart ? `${hPart} and ${mPart}` : hPart || mPart;
}

/** "remains" only for a single hour or single minute total — "0 minutes"/"2 hours"/compounds all take "remain". */
function remainVerb(hours: number): string {
  const { h, m } = toHoursAndMinutes(hours);
  const isSingleUnit = (h === 1 && m === 0) || (h === 0 && m === 1);
  return isSingleUnit ? "remains" : "remain";
}

export function summaryFor(result: AgeGateResult & BypassInfo): CheckOutput {
  const age = formatCompact(result.ageHours);

  if (result.bypassed) {
    const via = result.bypassReason === "path" ? "changed paths matching a bypass rule" : "a bypass label";
    return {
      conclusion: "success",
      title: `Bypassed via ${via}`,
      summary: `This pull request bypasses the age requirement (${via}), so this check passes regardless of how long it's been open (currently ${age}).`,
    };
  }

  if (result.passes) {
    return {
      conclusion: "success",
      title: `Open for ${age} — minimum ${formatCompact(result.minHours)} met`,
      summary: `This pull request has been open for ${formatWords(result.ageHours)}, meeting the minimum age requirement of ${formatWords(result.minHours)}.`,
    };
  }
  const remaining = formatCompact(result.remainingHours);
  return {
    conclusion: "failure",
    title: `Open for ${age} — needs ${formatCompact(result.minHours)} (${remaining} remaining)`,
    summary:
      `This pull request must stay open for at least ${formatWords(result.minHours)} before this check passes. ` +
      `It has been open for ${formatWords(result.ageHours)}; about ${formatWords(result.remainingHours)} ${remainVerb(result.remainingHours)}. ` +
      `This check re-evaluates on a schedule, so it will flip to green on its own once the minimum age is reached — no new commit needed.`,
  };
}
