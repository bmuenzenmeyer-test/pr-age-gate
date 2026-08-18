import { test } from "node:test";
import assert from "node:assert/strict";
import { isBypassedByLabel, isBypassedByPath, globToRegExp, parseCommaSeparated } from "./bypass.ts";

test("isBypassedByLabel: true when a PR label matches one of the configured bypass labels", () => {
  assert.equal(isBypassedByLabel(["bug", "urgent"], ["urgent", "hotfix"]), true);
});

test("isBypassedByLabel: false when no label matches", () => {
  assert.equal(isBypassedByLabel(["bug"], ["urgent", "hotfix"]), false);
});

test("isBypassedByLabel: false when no bypass labels are configured at all", () => {
  assert.equal(isBypassedByLabel(["urgent"], []), false);
});

test("globToRegExp: * matches within one path segment, not across /", () => {
  const re = globToRegExp("*.md");
  assert.equal(re.test("readme.md"), true);
  assert.equal(re.test("docs/readme.md"), false);
});

test("globToRegExp: ** matches across any number of path segments", () => {
  const re = globToRegExp("docs/**");
  assert.equal(re.test("docs/readme.md"), true);
  assert.equal(re.test("docs/sub/deep/file.md"), true);
  assert.equal(re.test("src/readme.md"), false);
});

test("globToRegExp: **/*.ext matches at any depth including root", () => {
  const re = globToRegExp("**/*.md");
  assert.equal(re.test("readme.md"), true);
  assert.equal(re.test("docs/readme.md"), true);
  assert.equal(re.test("docs/sub/readme.md"), true);
  assert.equal(re.test("docs/readme.txt"), false);
});

test("globToRegExp: literal regex characters in a pattern are escaped, not treated as regex", () => {
  const re = globToRegExp("file (1).txt");
  assert.equal(re.test("file (1).txt"), true);
  assert.equal(re.test("file X1Y.txt"), false); // would match if "(1)" were live regex
});

test("isBypassedByPath: true only when every changed file matches a bypass pattern", () => {
  assert.equal(isBypassedByPath(["docs/a.md", "docs/b.md"], ["docs/**"]), true);
});

test("isBypassedByPath: false when even one changed file falls outside the bypass patterns", () => {
  assert.equal(isBypassedByPath(["docs/a.md", "src/index.ts"], ["docs/**"]), false);
});

test("isBypassedByPath: false when no bypass paths are configured", () => {
  assert.equal(isBypassedByPath(["docs/a.md"], []), false);
});

test("isBypassedByPath: false when there are no changed files to check (avoids vacuous true)", () => {
  assert.equal(isBypassedByPath([], ["docs/**"]), false);
});

test("parseCommaSeparated: trims whitespace and drops empty entries", () => {
  assert.deepEqual(parseCommaSeparated(" urgent ,hotfix,, skip-gate "), ["urgent", "hotfix", "skip-gate"]);
});

test("parseCommaSeparated: undefined/empty input yields an empty array", () => {
  assert.deepEqual(parseCommaSeparated(undefined), []);
  assert.deepEqual(parseCommaSeparated(""), []);
});
