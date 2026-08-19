# Contributing

Thanks for considering a contribution.

## Setup

Package management is via [vlt](https://vlt.sh) (`npm install -g vlt` if
you don't have it), not npm.

```sh
vlt install       # devDependencies only: typescript, @types/node. Nothing is needed at runtime.
vlt run typecheck # tsc --noEmit
vlt run test      # node --test src/**/*.test.ts
```

Node version is pinned in [`.nvmrc`](./.nvmrc); `nvm use`/`fnm use` picks
it up. Requires Node ≥24.11 either way (see `engines` in `package.json`),
since this repo runs TypeScript directly via Node's native type
stripping, with no build step.

This repo ships with zero runtime dependencies, deliberately. Before
adding one, check whether the same thing is achievable with a Node
built-in (`fetch`, `node:test`, etc.) instead; that's been true for
everything so far.

## Before opening a PR

- `vlt run typecheck` and `vlt run test` should both pass locally (CI
  runs the same two commands).
- New behavior should come with a test. `src/*.test.ts` files sit next to
  the code they test; `src/test-helpers.ts` has a `withMockServer` helper
  for anything that talks to the GitHub API. Tests should exercise real
  HTTP against a local mock server, not a mocked `fetch`.
- If you're changing `action.yml` (inputs, `runs`), update the README's
  usage example and inputs table to match.

## Publishing

**As an npm package:**

```sh
npm publish
```

(`files` in `package.json` already scopes the published tarball to
`src/`, `action.yml`, `README.md`, `LICENSE`; no build output to worry
about.)

**As a GitHub Action:**

1. Commit and push (this repo is self-contained, no build artifacts to
   generate or commit first).
2. Tag a release: `git tag v1 && git push origin v1` (and re-point `v1`
   at each subsequent compatible commit, per the usual GitHub Actions
   versioning convention).
3. Optionally list it on the GitHub Marketplace from the repo's Releases
   page.

## Reporting bugs / requesting features

Open an issue. For anything security-related, see
[SECURITY.md](./SECURITY.md) instead of a public issue.

## Code of conduct

This project follows the [Code of Conduct](./CODE_OF_CONDUCT.md).
