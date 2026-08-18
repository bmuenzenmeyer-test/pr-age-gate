import { test } from "node:test";
import assert from "node:assert/strict";
import { checkPrAge } from "./check-pr-age.ts";
import { withMockServer } from "./test-helpers.ts";

test("checkPrAge works with no token at all, for a public repo", async () => {
  const mock = await withMockServer((req, res) => {
    assert.equal(req.headers.authorization, undefined);
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        number: 5,
        head: { sha: "deadbeef" },
        created_at: new Date(Date.now() - 100 * 3600 * 1000).toISOString(), // 100h old
      })
    );
  });

  const result = await checkPrAge({
    owner: "acme",
    repo: "widgets",
    pullNumber: 5,
    minHours: 48,
    apiBaseUrl: mock.url,
    // no token — this is the point
  });

  assert.equal(result.passes, true);
  assert.equal(result.bypassed, false);
  assert.equal(result.pullNumber, 5);
  assert.equal(result.headSha, "deadbeef");
  await mock.close();
});

test("checkPrAge reports failing for a PR younger than the threshold", async () => {
  const mock = await withMockServer((req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        number: 6,
        head: { sha: "cafef00d" },
        created_at: new Date(Date.now() - 2 * 3600 * 1000).toISOString(), // 2h old
      })
    );
  });

  const result = await checkPrAge({
    owner: "acme",
    repo: "widgets",
    pullNumber: 6,
    minHours: 48,
    apiBaseUrl: mock.url,
  });

  assert.equal(result.passes, false);
  assert.equal(result.bypassed, false);
  assert.ok(result.remainingHours > 45);
  await mock.close();
});

test("checkPrAge bypasses via label without needing to look at changed files at all", async () => {
  const mock = await withMockServer((req, res) => {
    if (req.url?.endsWith("/files")) {
      throw new Error("should not fetch changed files when a label bypass already matched");
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        number: 8,
        head: { sha: "labelsha" },
        created_at: new Date(Date.now() - 1 * 3600 * 1000).toISOString(), // 1h old — would normally fail
        labels: [{ name: "urgent" }],
      })
    );
  });

  const result = await checkPrAge({
    owner: "acme",
    repo: "widgets",
    pullNumber: 8,
    minHours: 48,
    apiBaseUrl: mock.url,
    bypassLabels: ["urgent"],
  });

  assert.equal(result.passes, true);
  assert.equal(result.bypassed, true);
  assert.equal(result.bypassReason, "label");
  await mock.close();
});

test("checkPrAge bypasses via path when every changed file matches a bypass pattern", async () => {
  const mock = await withMockServer((req, res) => {
    if (req.url?.includes("/files")) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify([{ filename: "docs/a.md" }, { filename: "docs/b.md" }]));
      return;
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        number: 9,
        head: { sha: "pathsha" },
        created_at: new Date(Date.now() - 1 * 3600 * 1000).toISOString(),
        labels: [],
      })
    );
  });

  const result = await checkPrAge({
    owner: "acme",
    repo: "widgets",
    pullNumber: 9,
    minHours: 48,
    apiBaseUrl: mock.url,
    bypassPaths: ["docs/**"],
  });

  assert.equal(result.passes, true);
  assert.equal(result.bypassed, true);
  assert.equal(result.bypassReason, "path");
  await mock.close();
});

test("checkPrAge does NOT fetch changed files when bypassPaths is not configured", async () => {
  const mock = await withMockServer((req, res) => {
    if (req.url?.includes("/files")) {
      throw new Error("should not fetch changed files when bypassPaths is empty");
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        number: 10,
        head: { sha: "nofetchsha" },
        created_at: new Date(Date.now() - 1 * 3600 * 1000).toISOString(),
        labels: [],
      })
    );
  });

  const result = await checkPrAge({
    owner: "acme",
    repo: "widgets",
    pullNumber: 10,
    minHours: 48,
    apiBaseUrl: mock.url,
  });

  assert.equal(result.bypassed, false);
  await mock.close();
});

test("checkPrAge is not bypassed when a changed file falls outside the bypass path patterns", async () => {
  const mock = await withMockServer((req, res) => {
    if (req.url?.includes("/files")) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify([{ filename: "docs/a.md" }, { filename: "src/index.ts" }]));
      return;
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        number: 11,
        head: { sha: "mixedsha" },
        created_at: new Date(Date.now() - 1 * 3600 * 1000).toISOString(),
        labels: [],
      })
    );
  });

  const result = await checkPrAge({
    owner: "acme",
    repo: "widgets",
    pullNumber: 11,
    minHours: 48,
    apiBaseUrl: mock.url,
    bypassPaths: ["docs/**"],
  });

  assert.equal(result.bypassed, false);
  assert.equal(result.passes, false); // still too young, and not bypassed
  await mock.close();
});
