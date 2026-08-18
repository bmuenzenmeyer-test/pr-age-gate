// GitHub Action entrypoint (action.yml's main). Deliberately doesn't go
// through check-pr-age.ts's checkPrAge() — that function does its own
// single-PR fetch, which is right for the CLI/library's "verify one PR"
// use case but would mean N+1 API calls here on the scheduled sweep
// (listOpenPullRequests already returns createdAt/headSha/labels for
// every open PR in one call). Both paths share the same underlying
// primitives (age-gate.ts, github-fetch.ts, bypass.ts) instead of one
// forcing its shape onto the other.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { getInput, info, setFailed } from "./actions-io.ts";
import { evaluateAgeGate, summaryFor } from "./age-gate.ts";
import { listOpenPullRequests, fetchChangedFiles, type PullRequestTarget } from "./github-fetch.ts";
import { upsertCheckRun } from "./github-checks.ts";
import { isBypassedByLabel, isBypassedByPath, parseCommaSeparated } from "./bypass.ts";

interface PullRequestEventPayload {
  pull_request?: {
    number: number;
    head: { sha: string };
    created_at: string;
    labels?: { name: string }[];
  };
}

function readEventPayload(): PullRequestEventPayload {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath) return {};
  try {
    return JSON.parse(readFileSync(eventPath, "utf8")) as PullRequestEventPayload;
  } catch {
    return {};
  }
}

export async function run(): Promise<void> {
  const minHoursInput = getInput("min-hours") || "48";
  const minHours = Number(minHoursInput);
  if (!Number.isFinite(minHours) || minHours < 0) {
    throw new Error(`"min-hours" must be a non-negative number, got: ${minHoursInput}`);
  }

  const checkName = getInput("check-name") || "pr-age-gate";
  const bypassLabels = parseCommaSeparated(getInput("bypass-labels"));
  const bypassPaths = parseCommaSeparated(getInput("bypass-paths"));

  const token = getInput("github-token") || process.env.GITHUB_TOKEN || "";
  if (!token) {
    throw new Error('No GitHub token available — set the "github-token" input.');
  }

  const repoSlug = process.env.GITHUB_REPOSITORY;
  if (!repoSlug) {
    throw new Error("GITHUB_REPOSITORY is not set — this action must run inside a GitHub Actions workflow.");
  }
  const [owner, repo] = repoSlug.split("/");
  if (!owner || !repo) {
    throw new Error(`Unexpected GITHUB_REPOSITORY value: "${repoSlug}"`);
  }

  const eventName = process.env.GITHUB_EVENT_NAME;
  const payload = readEventPayload();

  // On a pull_request trigger, only that one PR needs evaluating (its
  // data, including labels, is already in the webhook payload, no fetch
  // needed). On a schedule trigger there's no PR in context at all, so
  // every open PR gets re-checked — that's what lets a PR flip from red
  // to green with no new commit once enough real time has passed.
  const targets: PullRequestTarget[] =
    eventName === "pull_request" && payload.pull_request
      ? [
          {
            number: payload.pull_request.number,
            headSha: payload.pull_request.head.sha,
            createdAt: payload.pull_request.created_at,
            labels: (payload.pull_request.labels ?? []).map((l) => l.name),
          },
        ]
      : await listOpenPullRequests(owner, repo, { token });

  info(`Evaluating ${targets.length} open PR(s) against a ${minHours}h minimum age.`);

  for (const target of targets) {
    const ageResult = evaluateAgeGate(target.createdAt, minHours);

    let bypassed = false;
    let bypassReason: "label" | "path" | undefined;
    if (isBypassedByLabel(target.labels, bypassLabels)) {
      bypassed = true;
      bypassReason = "label";
    } else if (bypassPaths.length > 0) {
      const changedFiles = await fetchChangedFiles(owner, repo, target.number, { token });
      if (isBypassedByPath(changedFiles, bypassPaths)) {
        bypassed = true;
        bypassReason = "path";
      }
    }

    const output = summaryFor({ ...ageResult, bypassed, bypassReason });
    await upsertCheckRun({ token, owner, repo, sha: target.headSha, name: checkName, ...output });
    info(
      `PR #${target.number}: ${output.conclusion} (open ${ageResult.ageHours.toFixed(1)}h)` +
        (bypassed ? ` [bypassed via ${bypassReason}]` : "")
    );
  }
}

// Only auto-run when this file is executed directly (as GitHub Actions
// does), not when imported by a test — pathToFileURL keeps the
// comparison correct cross-platform (Windows path separators, etc.).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run().catch((err) => {
    setFailed(err instanceof Error ? err.message : String(err));
  });
}
