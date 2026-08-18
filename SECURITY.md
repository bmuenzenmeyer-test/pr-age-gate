# Security Policy

## Supported versions

Only the latest tagged release is supported. There's no LTS/backport
policy at this stage of the project.

## Reporting a vulnerability

Please report security issues privately using
[GitHub's private vulnerability reporting](../../security/advisories/new)
for this repository (Security tab → "Report a vulnerability"), rather than
opening a public issue.

Include, if possible:

- What you found and why it's a security issue (not just a bug)
- Steps to reproduce, or a minimal example
- Impact: what an attacker could actually do with it

You should get an initial response within a few days. This is a small,
single-maintainer project — there's no formal SLA, but security reports
are treated as priority over other work.

## Scope notes specific to this project

- This action's default `github-token` is the workflow's own
  `${{ github.token }}`; it never handles or stores any other credential.
- The CLI/library (`checkPrAge`) works fully unauthenticated for public
  repos by design — that's not a vulnerability, it's the intended
  "verifiable by anyone" use case (see README). A token, when supplied,
  is only ever sent as an `Authorization` header to `api.github.com` (or
  the configured `GITHUB_API_URL`/`apiBaseUrl` override) — never logged,
  never written to a check-run output.
- This action has zero runtime dependencies (see README's "Why no
  dependencies" section), which removes an entire class of supply-chain
  risk (compromised transitive packages) present in most JS/TS GitHub
  Actions.
