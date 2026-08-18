import { test } from "node:test";
import assert from "node:assert/strict";
import { upsertCheckRun } from "./github-checks.ts";
import { withMockServer } from "./test-helpers.ts";

test("upsertCheckRun creates a new check run when none exists yet for that sha+name", async () => {
  const mock = await withMockServer((req, res) => {
    if (req.method === "GET" && req.url?.includes("/check-runs")) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ check_runs: [] }));
      return;
    }
    if (req.method === "POST" && req.url?.endsWith("/check-runs")) {
      res.writeHead(201, { "content-type": "application/json" });
      res.end(JSON.stringify({ id: 1 }));
      return;
    }
    res.writeHead(404);
    res.end();
  });

  await upsertCheckRun({
    token: "t",
    owner: "acme",
    repo: "widgets",
    sha: "abc",
    name: "pr-age-gate",
    conclusion: "success",
    title: "t",
    summary: "s",
    apiBaseUrl: mock.url,
  });

  const post = mock.calls.find((c) => c.method === "POST");
  assert.ok(post, "expected a POST to create a check run");
  assert.deepEqual(post?.body, {
    name: "pr-age-gate",
    head_sha: "abc",
    status: "completed",
    conclusion: "success",
    output: { title: "t", summary: "s" },
  });
  await mock.close();
});

test("upsertCheckRun updates the existing check run instead of creating a duplicate", async () => {
  const mock = await withMockServer((req, res) => {
    if (req.method === "GET" && req.url?.includes("/check-runs")) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ check_runs: [{ id: 42 }] }));
      return;
    }
    if (req.method === "PATCH" && req.url?.endsWith("/check-runs/42")) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ id: 42 }));
      return;
    }
    res.writeHead(404);
    res.end();
  });

  await upsertCheckRun({
    token: "t",
    owner: "acme",
    repo: "widgets",
    sha: "abc",
    name: "pr-age-gate",
    conclusion: "failure",
    title: "t2",
    summary: "s2",
    apiBaseUrl: mock.url,
  });

  const patch = mock.calls.find((c) => c.method === "PATCH");
  assert.ok(patch, "expected a PATCH to update the existing check run");
  const post = mock.calls.find((c) => c.method === "POST");
  assert.equal(post, undefined, "should not create a second check run when one already exists");
  await mock.close();
});
