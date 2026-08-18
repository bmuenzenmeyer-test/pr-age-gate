// Check-run creation/update — unlike everything in github-fetch.ts, this
// always requires a write-scoped token, so it's kept separate: this file
// is the "Action-only, authenticated write" half; github-fetch.ts is the
// "library-safe, works unauthenticated for public repos" half.

import { githubRequest, type RequestOptions } from "./github-fetch.ts";

interface RawCheckRun {
  id: number;
}

export interface UpsertCheckRunParams {
  token: string;
  owner: string;
  repo: string;
  sha: string;
  name: string;
  conclusion: "success" | "failure";
  title: string;
  summary: string;
  apiBaseUrl?: string;
}

/**
 * Creates the named check run on first run, updates the same one on later
 * runs (matched by name + sha) rather than creating a new one each time —
 * this is what lets the check flip from red to green in place on a
 * schedule, without a new commit, instead of piling up duplicate checks.
 */
export async function upsertCheckRun(params: UpsertCheckRunParams): Promise<void> {
  const { token, owner, repo, sha, name, conclusion, title, summary, apiBaseUrl } = params;
  const output = { title, summary };
  const baseOptions: RequestOptions = { token, apiBaseUrl };

  const existing = await githubRequest<{ check_runs: RawCheckRun[] }>(
    `/repos/${owner}/${repo}/commits/${sha}/check-runs?check_name=${encodeURIComponent(name)}&per_page=1`,
    baseOptions
  );

  const existingRun = existing.check_runs[0];
  if (existingRun) {
    await githubRequest(`/repos/${owner}/${repo}/check-runs/${existingRun.id}`, {
      ...baseOptions,
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "completed", conclusion, output }),
    });
    return;
  }

  await githubRequest(`/repos/${owner}/${repo}/check-runs`, {
    ...baseOptions,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, head_sha: sha, status: "completed", conclusion, output }),
  });
}
