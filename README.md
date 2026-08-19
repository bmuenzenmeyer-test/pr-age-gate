# PR Age Gate

Verifies that a pull request has been open for a configurable minimum
number of hours. Two ways to use it, from one repo, sharing the same
underlying code:

- **As a GitHub Action** — a thin wrapper around the same library that
  additionally *writes* a check run back to the PR (which does need a
  token, since writing always does), keeping a check **red** until the
  minimum age is met, then flipping it **green** on its own via an hourly
  schedule — no new commit required.
- **As a CLI/library** (`pr-age-gate` on npm) — a standalone verifier.
  Works against **any public repo with no token at all**: it's just
  reading `pulls/{number}`, which GitHub serves unauthenticated (rate
  limited to 60 req/hr instead of 5000/hr, but no setup required). Meant
  to be independently runnable by anyone — a contributor, a bot, a third
  party auditing a claim — not just the repo owner.

![A screenshot of the PR status checks](/.github/status.png)

and details...

![A screenshot of the action succeeding after configured PR age is met.](/.github/success.png)

## As a GitHub Action

```yaml
name: PR Age Gate

on:
  pull_request:
    types: [opened, synchronize, reopened, labeled, unlabeled]
  schedule:
    - cron: "0 * * * *" # hourly — re-evaluates every open PR

permissions:
  checks: write
  pull-requests: read

jobs:
  age-gate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4 # required so the action's own code is present to run
      - uses: bmuenzenmeyer/pr-age-gate@v1
        with:
          min-hours: "48"
          bypass-labels: "urgent,hotfix" # optional
          bypass-paths: "docs/**,*.md"   # optional — costs one extra API call per PR, only made if this is set
```

Both triggers point at the **same workflow**, and that's intentional:

- `pull_request` events give fast feedback on the PR itself the moment
  it's opened or pushed to.
- `schedule` has no single PR in context, so it re-evaluates every open
  PR in the repo — this is what actually flips a PR from red to green
  once enough wall-clock time has passed, since nothing else about the
  PR needs to change for that to happen.

Add the check's name (`pr-age-gate` by default) as a required status
check in your branch protection rules to actually block merging on it.

### Action inputs

| Input | Default | Description |
|---|---|---|
| `min-hours` | `48` | Minimum hours a PR must stay open before this check passes. |
| `check-name` | `pr-age-gate` | Name of the check run. Change this if you want more than one age gate (e.g. different thresholds) on the same repo. |
| `bypass-labels` | *(none)* | Comma-separated PR labels that make this check pass immediately, regardless of age. |
| `bypass-paths` | *(none)* | Comma-separated glob patterns — if every file the PR changes matches one, the check passes immediately regardless of age. |
| `github-token` | `${{ github.token }}` | Token used to list PRs and create/update check runs. The default Actions token is sufficient; needs `checks: write` and `pull-requests: read` permissions (see example above). |

## As a CLI

```sh
npx pr-age-gate --owner facebook --repo react --pr 12345 --min-hours 48
```

```json
{
  "passes": false,
  "ageHours": 2.1,
  "minHours": 48,
  "remainingHours": 45.9,
  "owner": "facebook",
  "repo": "react",
  "pullNumber": 12345,
  "headSha": "...",
  "createdAt": "2026-08-18T01:00:00Z"
}
```

Exit codes: `0` = passes (old enough), `1` = fails (too young), `2` =
couldn't determine at all (bad arguments, network/API error) — kept
distinct from 0/1 so a caller can tell "the gate failed" apart from "the
check itself broke."

Flags or environment variables, either works:

| Flag | Env var | Default |
|---|---|---|
| `--owner` | `PR_AGE_GATE_OWNER` | *(required)* |
| `--repo` | `PR_AGE_GATE_REPO` | *(required)* |
| `--pr` | `PR_AGE_GATE_PR` | *(required)* |
| `--min-hours` | `PR_AGE_GATE_MIN_HOURS` | `48` |
| `--token` | `PR_AGE_GATE_TOKEN` / `GITHUB_TOKEN` | *(none — unauthenticated)* |
| `--bypass-labels` | `PR_AGE_GATE_BYPASS_LABELS` | *(none)* — comma-separated, e.g. `urgent,hotfix` |
| `--bypass-paths` | `PR_AGE_GATE_BYPASS_PATHS` | *(none)* — comma-separated globs, e.g. `docs/**,*.md` |

## As a library

```ts
import { checkPrAge } from "pr-age-gate";

const result = await checkPrAge({
  owner: "facebook",
  repo: "react",
  pullNumber: 12345,
  minHours: 48,
  // token: optional — omit for public repos
  bypassLabels: ["urgent"], // optional
  bypassPaths: ["docs/**"], // optional — costs one extra API call, only made if this is set
});

if (!result.passes) {
  console.log(`Needs ${result.remainingHours.toFixed(1)} more hours`);
} else if (result.bypassed) {
  console.log(`Passed via bypass: ${result.bypassReason}`);
}
```

## How it decides pass vs. fail

```
ageHours = now − pr.created_at
passes   = ageHours >= minHours
```

That's it — deliberately simple. It only reads `created_at`; it doesn't
look at draft status, review state, or CI, since this is meant to
compose with those as an independent, separate check rather than
duplicate what they already cover.

## Bypassing the age check

Two independent ways a PR can pass immediately, regardless of age —
available identically as `bypassLabels`/`bypassPaths` (library),
`--bypass-labels`/`--bypass-paths` (CLI), and `bypass-labels`/
`bypass-paths` (Action inputs):

- **By label** — if the PR has any label in the configured list, it
  passes. Free: labels are already present on the same API response used
  for everything else, no extra request.
- **By path** — if *every* file the PR changes matches at least one
  configured glob pattern, it passes. A PR that touches one doc file and
  one source file is **not** bypassed just because part of it looked
  docs-only. Costs one extra API call per PR (`GET .../pulls/{n}/files`),
  only made when `bypass-paths` is actually set.

The glob support is deliberately minimal (see `src/bypass.ts`) — no
external dependency for it:

- `*` matches within one path segment (`*.md` matches `readme.md`, not
  `docs/readme.md`)
- `**` matches across any number of segments, including zero (`docs/**`
  matches `docs/readme.md` and `docs/sub/readme.md`; `**/*.md` matches
  `readme.md` *and* `docs/readme.md`)
- No brace expansion (`{a,b}`), no character classes (`[abc]`), no
  negation

## Why no dependencies, no build step

Both the CLI/library and the Action ship as plain TypeScript with **zero
runtime dependencies** — `action.yml` points `main` directly at
`src/action.ts`, and `package.json`'s `bin`/`exports` point directly at
`src/cli.ts`/`src/check-pr-age.ts`. That works because:

- Node 24 runs `.ts` files natively (type stripping) with no compiler,
  bundler, or `ts-node`/`tsx` in the loop — confirmed locally against
  Node v24.11.1. GitHub-hosted Actions runners moved to Node 24 as the
  default in mid-2026; running this on a self-hosted or pinned-older
  runner needs Node ≥24.11 available as `node24` for `runs.using` to
  resolve. The same version floor applies to anyone `npx`-ing the CLI.
- GitHub talks over plain HTTPS/JSON, so `github-fetch.ts` calls the REST
  API directly with Node's built-in `fetch` instead of Octokit
  (`@actions/github`/`@octokit/rest`). No `npm install` step is needed
  before either the CLI or the Action can run — there's nothing to
  install.
- `typescript` and `@types/node` are **devDependencies only**, used for
  local/CI type-checking (`vlt run typecheck`). Never required at actual
  runtime, for either the CLI or the Action.

`github-fetch.ts`'s request layer retries transient failures (5xx,
network errors) with exponential backoff, but never retries a 4xx — a bad
token or a genuinely missing PR isn't fixed by trying again.

If you fork this to target an older/pinned Node runtime, you'll need to
reintroduce a build step (`tsc`/`esbuild`/`@vercel/ncc` → committed
`dist/`) — that's the traditional pattern this repo deliberately avoids.

## Security & supply chain

- Zero runtime dependencies (above) removes an entire class of
  supply-chain risk — no transitive package can be compromised if there
  are none.
- Third-party GitHub Actions used by this repo's own workflows
  (`actions/checkout`, `actions/setup-node`, `github/codeql-action`) are
  pinned to commit SHAs, not floating version tags.
- [CodeQL](.github/workflows/codeql.yml) runs static analysis on every
  push/PR plus weekly.
- [Dependabot](.github/dependabot.yml) tracks GitHub Actions version
  bumps; see that file's comment on its (limited) understanding of a
  vlt-managed `devDependencies` set.
- See [SECURITY.md](./SECURITY.md) to report a vulnerability.

## Development

Package management is via [vlt](https://vlt.sh), not npm — install the
CLI once if you don't have it:

```sh
npm install -g vlt
```

Node version is pinned in [`.nvmrc`](./.nvmrc) (currently 24.19.0); CI
reads it via `setup-node`'s `node-version-file`. If you use `nvm`/`fnm`,
`nvm use` / `fnm use` picks it up automatically.

```sh
vlt install       # devDependencies only (typescript, @types/node)
vlt run typecheck # tsc --noEmit
vlt run test      # node --test src/**/*.test.ts
```

No build/watch step — `node src/action.ts` or `node src/cli.ts` runs
directly, the same way GitHub Actions / `npx` will.

## Project structure

```
.nvmrc                     Pinned Node version — CI's setup-node reads this via node-version-file
action.yml                 Action metadata — runs: using: node24, main: src/action.ts
package.json                 bin: pr-age-gate → src/cli.ts, exports: "." → src/check-pr-age.ts
src/
  age-gate.ts                 Pure age-vs-threshold logic (no I/O) + check run title/summary text
  age-gate.test.ts
  bypass.ts                     Label/path bypass logic (no I/O) — see "Bypassing the age check" below
  bypass.test.ts
  github-fetch.ts                 Fetch-based GitHub REST client: retries, optional token (public-repo-safe),
                                   fetchPullRequest, listOpenPullRequests, fetchChangedFiles
  github-fetch.test.ts
  github-checks.ts                  Check-run create/update — always needs a write token, Action-only
  github-checks.test.ts
  check-pr-age.ts                     Public library function: checkPrAge(options) — one PR, pass/fail verdict
  check-pr-age.test.ts
  cli.ts                                 npm bin entrypoint: argv/env → checkPrAge() → exit 0/1/2
  cli.test.ts
  actions-io.ts                            Minimal replacement for @actions/core's getInput/info/setFailed
  actions-io.test.ts
  action.ts                                  GitHub Action entrypoint: inputs/event → evaluate → upsertCheckRun
  action.test.ts
  test-helpers.ts                              withMockServer() — shared by every *.test.ts that talks HTTP
.github/
  workflows/ci.yml         Typecheck + test on push/PR
  workflows/codeql.yml       Static analysis (CodeQL), weekly + on push/PR
  dependabot.yml               Version-bump PRs for GitHub Actions + (best-effort) npm deps
```

`action.ts` doesn't call `checkPrAge()` internally — that function does
its own single-PR fetch, right for the CLI's "verify one PR" use case,
but it'd mean N+1 API calls on the Action's scheduled sweep
(`listOpenPullRequests` already returns every open PR's data in one
call). Both paths share `age-gate.ts` and `github-fetch.ts` instead of
one forcing its shape onto the other.

## Publishing

**As an npm package:**

```sh
npm publish
```

(`files` in `package.json` already scopes the published tarball to
`src/`, `action.yml`, `README.md`, `LICENSE` — no build output to worry
about.)

**As a GitHub Action:**

1. Commit and push (this repo is self-contained — no build artifacts to
   generate or commit first).
2. Tag a release: `git tag v1 && git push origin v1` (and re-point `v1`
   at each subsequent compatible commit, per the usual GitHub Actions
   versioning convention).
3. Optionally list it on the GitHub Marketplace from the repo's Releases
   page.

## License

MIT — see [LICENSE](./LICENSE).
