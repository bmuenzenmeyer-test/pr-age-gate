#!/usr/bin/env node
// Exit codes: 0 = passes (old enough, or bypassed), 1 = fails (too young),
// 2 = couldn't determine at all (bad args, network/API error). Keeping 2
// distinct from 0/1 matters: a caller scripting against this should be
// able to tell "the gate failed" apart from "the check itself broke,"
// since those call for different responses (block a merge vs.
// investigate/retry).
import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { checkPrAge } from "./check-pr-age.ts";
import { parseCommaSeparated } from "./bypass.ts";

export function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg?.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith("--")) {
      out[key] = next;
      i++;
    } else {
      out[key] = "true";
    }
  }
  return out;
}

function usage(): string {
  return [
    "Usage: pr-age-gate --owner <owner> --repo <repo> --pr <number> [--min-hours 48] [--token <token>]",
    "                    [--bypass-labels urgent,hotfix] [--bypass-paths docs/**,*.md]",
    "",
    "Also readable from the environment instead of flags:",
    "  PR_AGE_GATE_OWNER, PR_AGE_GATE_REPO, PR_AGE_GATE_PR, PR_AGE_GATE_MIN_HOURS, GITHUB_TOKEN,",
    "  PR_AGE_GATE_BYPASS_LABELS, PR_AGE_GATE_BYPASS_PATHS",
    "",
    "Exit codes: 0 = PR is old enough (or bypassed), 1 = not old enough yet, 2 = couldn't determine (bad input / API error).",
  ].join("\n");
}

export async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));

  const owner = args.owner ?? process.env.PR_AGE_GATE_OWNER;
  const repo = args.repo ?? process.env.PR_AGE_GATE_REPO;
  const pullNumberRaw = args.pr ?? process.env.PR_AGE_GATE_PR;
  const minHoursRaw = args["min-hours"] ?? process.env.PR_AGE_GATE_MIN_HOURS ?? "48";
  const token = args.token ?? process.env.PR_AGE_GATE_TOKEN ?? process.env.GITHUB_TOKEN;
  const bypassLabels = parseCommaSeparated(args["bypass-labels"] ?? process.env.PR_AGE_GATE_BYPASS_LABELS);
  const bypassPaths = parseCommaSeparated(args["bypass-paths"] ?? process.env.PR_AGE_GATE_BYPASS_PATHS);

  const pullNumber = Number(pullNumberRaw);
  const minHours = Number(minHoursRaw);

  if (!owner || !repo || !pullNumberRaw || !Number.isFinite(pullNumber)) {
    console.error(usage());
    return 2;
  }
  if (!Number.isFinite(minHours) || minHours < 0) {
    console.error(`Invalid --min-hours: "${minHoursRaw}"\n\n${usage()}`);
    return 2;
  }

  const result = await checkPrAge({ owner, repo, pullNumber, minHours, token, bypassLabels, bypassPaths });
  console.log(JSON.stringify(result, null, 2));
  return result.passes ? 0 : 1;
}

// Only auto-run when this file is executed directly, not when imported by a
// test. argv[1] has to be realpath'd first: npm installs `bin` entries as a
// symlink (node_modules/.bin/pr-age-gate -> ../pr-age-gate/dist/cli.js), and
// import.meta.url is always the resolved target. Comparing the two unresolved
// makes the installed CLI silently exit 0 without doing anything.
function isDirectRun(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return import.meta.url === pathToFileURL(realpathSync(entry)).href;
  } catch {
    return false; // argv[1] isn't a real path (e.g. `node --eval`)
  }
}

if (isDirectRun()) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((err) => {
      console.error(err instanceof Error ? err.message : String(err));
      process.exitCode = 2;
    });
}
