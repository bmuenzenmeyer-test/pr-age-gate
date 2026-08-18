import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateAgeGate, summaryFor } from "./age-gate.ts";

const now = new Date("2026-01-10T00:00:00Z");

test("fails when younger than the minimum age", () => {
  const createdAt = new Date(now.getTime() - 10 * 60 * 60 * 1000).toISOString(); // 10h old
  const result = evaluateAgeGate(createdAt, 48, now);
  assert.equal(result.passes, false);
  assert.equal(Math.round(result.ageHours), 10);
  assert.equal(Math.round(result.remainingHours), 38);
});

test("passes once older than the minimum age", () => {
  const createdAt = new Date(now.getTime() - 72 * 60 * 60 * 1000).toISOString(); // 72h old
  const result = evaluateAgeGate(createdAt, 48, now);
  assert.equal(result.passes, true);
  assert.equal(result.remainingHours, 0);
});

test("passes exactly at the threshold (inclusive)", () => {
  const createdAt = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString(); // exactly 48h
  const result = evaluateAgeGate(createdAt, 48, now);
  assert.equal(result.passes, true);
});

test("a zero-hour minimum always passes", () => {
  const createdAt = now.toISOString(); // just opened
  const result = evaluateAgeGate(createdAt, 0, now);
  assert.equal(result.passes, true);
});

test("summaryFor produces a failure conclusion with remaining time mentioned", () => {
  const result = evaluateAgeGate(new Date(now.getTime() - 10 * 60 * 60 * 1000).toISOString(), 48, now);
  const output = summaryFor(result);
  assert.equal(output.conclusion, "failure");
  assert.match(output.summary, /38\.0 more hour/);
});

test("summaryFor produces a success conclusion once the age requirement is met", () => {
  const result = evaluateAgeGate(new Date(now.getTime() - 72 * 60 * 60 * 1000).toISOString(), 48, now);
  const output = summaryFor(result);
  assert.equal(output.conclusion, "success");
  assert.match(output.summary, /meeting the 48-hour minimum/);
});

test("summaryFor reports a bypass via label as success, even for a PR that's far too young", () => {
  const result = evaluateAgeGate(now.toISOString(), 48, now); // 0h old, would normally fail
  const output = summaryFor({ ...result, bypassed: true, bypassReason: "label" });
  assert.equal(output.conclusion, "success");
  assert.match(output.title, /Bypassed/);
  assert.match(output.summary, /bypass label/);
});

test("summaryFor reports a bypass via path with its own wording", () => {
  const result = evaluateAgeGate(now.toISOString(), 48, now);
  const output = summaryFor({ ...result, bypassed: true, bypassReason: "path" });
  assert.match(output.summary, /changed paths matching a bypass rule/);
});
