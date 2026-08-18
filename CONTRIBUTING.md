# Contributing

Thanks for considering a contribution.

## Setup

Package management is via [vlt](https://vlt.sh) (`npm install -g vlt` if
you don't have it), not npm.

```sh
vlt install       # devDependencies only — typescript, @types/node. Nothing is needed at runtime.
vlt run typecheck # tsc --noEmit
vlt run test      # node --test src/**/*.test.ts
```

Node version is pinned in [`.nvmrc`](./.nvmrc) — `nvm use`/`fnm use` picks
it up. Requires Node ≥24.11 either way (see `engines` in `package.json`)
— this repo runs TypeScript directly via Node's native type stripping,
with no build step.
See the README's "Why no dependencies, no build step" section before
proposing anything that would reintroduce a compiler/bundler or a runtime
dependency; that tradeoff was deliberate, not an oversight.

## Before opening a PR

- `vlt run typecheck` and `vlt run test` should both pass locally (CI
  runs the same two commands).
- New behavior should come with a test. `src/*.test.ts` files sit next to
  the code they test; `src/test-helpers.ts` has a `withMockServer` helper
  for anything that talks to the GitHub API — tests should exercise real
  HTTP against a local mock server, not a mocked `fetch`.
- If you're changing `action.yml` (inputs, `runs`), update the README's
  usage example and inputs table to match.
- Keep the "why no dependencies" constraint in mind: before adding any
  package to `dependencies`, ask whether the same thing is achievable
  with Node's built-ins (`fetch`, `node:test`, etc.) — that's been true
  for everything so far.

## Reporting bugs / requesting features

Open an issue. For anything security-related, see
[SECURITY.md](./SECURITY.md) instead of a public issue.

## Code of conduct

This project follows the [Code of Conduct](./CODE_OF_CONDUCT.md).
