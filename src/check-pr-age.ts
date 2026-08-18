// The public library API — this is what `import { checkPrAge } from
// "pr-age-gate"` gets. Deliberately independent of the GitHub Action:
// no check-run writing, no Actions inputs/context, just "is this PR old
// enough (or bypassed)" for a single named PR. Works with no token at all
// against public repos (rate-limited to 60 req/hr instead of 5000/hr, but
// no setup required) — that's the point: anyone can independently verify
// a public PR's age without needing write access, or any credential at
// all.

import { evaluateAgeGate, type AgeGateResult, type BypassReason } from "./age-gate.ts";
import { fetchPullRequest, fetchChangedFiles } from "./github-fetch.ts";
import { isBypassedByLabel, isBypassedByPath } from "./bypass.ts";

export interface CheckPrAgeOptions {
  owner: string;
  repo: string;
  pullNumber: number;
  /** Hours the PR must have been open for `passes` to be true. */
  minHours: number;
  /** Omit for public repos. Required for private repos, or to raise the unauthenticated rate limit. */
  token?: string;
  /** Override for GitHub Enterprise Server, or for pointing at a mock server in tests. */
  apiBaseUrl?: string;
  /** PR labels that make this check pass immediately, regardless of age. */
  bypassLabels?: string[];
  /** Glob patterns (see bypass.ts) — if every changed file matches one, the check passes immediately regardless of age. Costs one extra API call, only made when this is non-empty. */
  bypassPaths?: string[];
}

export interface CheckPrAgeResult extends AgeGateResult {
  owner: string;
  repo: string;
  pullNumber: number;
  headSha: string;
  createdAt: string;
  bypassed: boolean;
  bypassReason?: BypassReason;
}

export async function checkPrAge(options: CheckPrAgeOptions): Promise<CheckPrAgeResult> {
  const fetchOptions = { token: options.token, apiBaseUrl: options.apiBaseUrl };
  const pr = await fetchPullRequest(options.owner, options.repo, options.pullNumber, fetchOptions);
  const ageResult = evaluateAgeGate(pr.createdAt, options.minHours);

  const bypassLabels = options.bypassLabels ?? [];
  const bypassPaths = options.bypassPaths ?? [];

  let bypassed = false;
  let bypassReason: BypassReason | undefined;

  if (isBypassedByLabel(pr.labels, bypassLabels)) {
    bypassed = true;
    bypassReason = "label";
  } else if (bypassPaths.length > 0) {
    const changedFiles = await fetchChangedFiles(options.owner, options.repo, options.pullNumber, fetchOptions);
    if (isBypassedByPath(changedFiles, bypassPaths)) {
      bypassed = true;
      bypassReason = "path";
    }
  }

  return {
    ...ageResult,
    passes: bypassed ? true : ageResult.passes,
    bypassed,
    bypassReason,
    owner: options.owner,
    repo: options.repo,
    pullNumber: options.pullNumber,
    headSha: pr.headSha,
    createdAt: pr.createdAt,
  };
}
