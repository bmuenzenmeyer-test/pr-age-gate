# Contributing

Thanks for considering a contribution.

## Setup

Package management is via [vlt](https://vlt.sh) (`npm install -g vlt` if
you don't have it), not npm.

```sh
vlt install       # devDependencies only: typescript, @types/node. Nothing is needed at runtime.
vlt run typecheck # tsc --noEmit
vlt run test      # node --test __tests__/**/*.test.ts
vlt run build     # tsc -p tsconfig.build.json — only needed when publishing to npm
```

Node version is pinned in [`.nvmrc`](./.nvmrc); `nvm use`/`fnm use` picks
it up. Requires Node ≥24.11 either way (see `engines` in `package.json`),
since this repo runs TypeScript directly via Node's native type
stripping.

This repo ships with zero runtime dependencies, deliberately. Before
adding one, check whether the same thing is achievable with a Node
built-in (`fetch`, `node:test`, etc.) instead; that's been true for
everything so far.

## Before opening a PR

- `vlt run typecheck` and `vlt run test` should both pass locally (CI
  runs those two plus `vlt run build`, which only checks that the
  publish build still emits).
- New behavior should come with a test. Tests live in `__tests__/`, a
  sibling of `src/`, one file per module (`__tests__/bypass.test.ts`
  covers `src/bypass.ts`) and importing across with `../src/bypass.ts`.
  `__tests__/test-helpers.ts` has a `withMockServer` helper for anything
  that talks to the GitHub API. Tests should exercise real HTTP against a
  local mock server, not a mocked `fetch`.
- If you're changing `action.yml` (inputs, `runs`), update the README's
  usage example and inputs table to match.

## Publishing

**As an npm package:**

```sh
vlt run build   # emits dist/; `npm publish` also runs it via prepack
npm publish
```

The tarball ships compiled JS, since Node won't strip types under
`node_modules`. [`tsconfig.build.json`](./tsconfig.build.json) compiles
`src/` to `dist/` (JS + `.d.ts`); `files` in `package.json` scopes the
tarball to `dist/`, `action.yml`, `README.md`, `LICENSE`. `dist/` is
gitignored.

**As a GitHub Action:**

1. Commit and push. The Action runs `src/action.ts` from the repo, so
   there's nothing to build or commit first.
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
