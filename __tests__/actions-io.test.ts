import { test } from "node:test";
import assert from "node:assert/strict";
import { getInput, setFailed } from "../src/actions-io.ts";

test("getInput reads the INPUT_<NAME> convention with hyphens preserved (not underscored)", () => {
  process.env["INPUT_MIN-HOURS"] = "72";
  try {
    assert.equal(getInput("min-hours"), "72");
  } finally {
    delete process.env["INPUT_MIN-HOURS"];
  }
});

test("getInput returns an empty string for an unset input, not undefined", () => {
  assert.equal(getInput("totally-unset-input"), "");
});

test("getInput trims surrounding whitespace", () => {
  process.env["INPUT_CHECK-NAME"] = "  my-check  ";
  try {
    assert.equal(getInput("check-name"), "my-check");
  } finally {
    delete process.env["INPUT_CHECK-NAME"];
  }
});

test("setFailed sets a non-zero exit code", () => {
  const before = process.exitCode;
  try {
    setFailed("something broke");
    assert.notEqual(process.exitCode, 0);
  } finally {
    process.exitCode = before;
  }
});
