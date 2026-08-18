import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { run } from "./action.ts";
import { withMockServer } from "./test-helpers.ts";

function writeEventFile(payload: unknown): string {
  const dir = mkdtempSync(path.join(tmpdir(), "pr-age-gate-test-"));
  const file = path.join(dir, "event.json");
  writeFileSync(file, JSON.stringify(payload));
  return file;
}

interface EnvOverrides {
  [key: string]: string | undefined;
}

async function withEnv<T>(overrides: EnvOverrides, fn: () => Promise<T>): Promise<T> {
  const previous: EnvOverrides = {};
  for (const key of Object.keys(overrides)) previous[key] = process.env[key];
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return await fn();
  } finally {
    for (const key of Object.keys(overrides)) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
}

test("run() throws a clear error when no token is available", async () => {
  const eventFile = writeEventFile({});
  await assert.rejects(
    () =>
      withEnv(
        {
          GITHUB_REPOSITORY: "acme/widgets",
          GITHUB_EVENT_NAME: "schedule",
          GITHUB_EVENT_PATH: eventFile,
          "INPUT_GITHUB-TOKEN": "",
          GITHUB_TOKEN: "",
        },
        run
      ),
    /No GitHub token available/
  );
  rmSync(path.dirname(eventFile), { recursive: true, force: true });
});

test("run() on a pull_request trigger evaluates only the PR from the webhook payload (no listing call)", async () => {
  const mock = await withMockServer((req, res) => {
    if (req.method === "GET" && req.url?.startsWith("/repos/acme/widgets/pulls?")) {
      throw new Error("should not list all PRs on a pull_request-triggered run");
    }
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

  const eventFile = writeEventFile({
    pull_request: {
      number: 55,
      head: { sha: "sha55" },
      created_at: new Date(Date.now() - 100 * 3600 * 1000).toISOString(),
      labels: [],
    },
  });

  await withEnv(
    {
      GITHUB_API_URL: mock.url,
      GITHUB_REPOSITORY: "acme/widgets",
      GITHUB_EVENT_NAME: "pull_request",
      GITHUB_EVENT_PATH: eventFile,
      "INPUT_MIN-HOURS": "48",
      "INPUT_GITHUB-TOKEN": "t",
    },
    run
  );

  const post = mock.calls.find((c) => c.method === "POST");
  assert.equal((post?.body as { conclusion?: string } | null)?.conclusion, "success");
  await mock.close();
  rmSync(path.dirname(eventFile), { recursive: true, force: true });
});

test("run() on a schedule trigger sweeps every open PR and skips fetching changed files when no bypass-paths is set", async () => {
  const mock = await withMockServer((req, res, calls) => {
    if (req.method === "GET" && req.url?.startsWith("/repos/acme/widgets/pulls?state=open")) {
      const page = new URL(req.url, "http://x").searchParams.get("page");
      res.writeHead(200, { "content-type": "application/json" });
      if (page === "1") {
        res.end(
          JSON.stringify([
            { number: 1, head: { sha: "s1" }, created_at: new Date(Date.now() - 100 * 3600 * 1000).toISOString(), labels: [] },
            { number: 2, head: { sha: "s2" }, created_at: new Date(Date.now() - 1 * 3600 * 1000).toISOString(), labels: [] },
          ])
        );
      } else res.end("[]");
      return;
    }
    if (req.url?.includes("/files")) {
      throw new Error("should not fetch changed files when bypass-paths is not configured");
    }
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

  const eventFile = writeEventFile({});

  await withEnv(
    {
      GITHUB_API_URL: mock.url,
      GITHUB_REPOSITORY: "acme/widgets",
      GITHUB_EVENT_NAME: "schedule",
      GITHUB_EVENT_PATH: eventFile,
      "INPUT_MIN-HOURS": "48",
      "INPUT_GITHUB-TOKEN": "t",
    },
    run
  );

  const posts = mock.calls.filter((c) => c.method === "POST");
  assert.equal(posts.length, 2);
  const conclusions = posts.map((p) => (p.body as { conclusion?: string } | null)?.conclusion).sort();
  assert.deepEqual(conclusions, ["failure", "success"]);
  await mock.close();
  rmSync(path.dirname(eventFile), { recursive: true, force: true });
});

test("run() bypasses via bypass-paths input when every changed file matches", async () => {
  const mock = await withMockServer((req, res) => {
    if (req.url?.includes("/files")) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify([{ filename: "docs/a.md" }]));
      return;
    }
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

  const eventFile = writeEventFile({
    pull_request: {
      number: 88,
      head: { sha: "sha88" },
      created_at: new Date().toISOString(),
      labels: [],
    },
  });

  await withEnv(
    {
      GITHUB_API_URL: mock.url,
      GITHUB_REPOSITORY: "acme/widgets",
      GITHUB_EVENT_NAME: "pull_request",
      GITHUB_EVENT_PATH: eventFile,
      "INPUT_MIN-HOURS": "48",
      "INPUT_BYPASS-PATHS": "docs/**",
      "INPUT_GITHUB-TOKEN": "t",
    },
    run
  );

  const post = mock.calls.find((c) => c.method === "POST");
  assert.equal((post?.body as { conclusion?: string } | null)?.conclusion, "success");
  await mock.close();
  rmSync(path.dirname(eventFile), { recursive: true, force: true });
});

test("run() throws a clear error on an invalid min-hours input", async () => {
  const eventFile = writeEventFile({});
  await assert.rejects(
    () =>
      withEnv(
        {
          GITHUB_REPOSITORY: "acme/widgets",
          GITHUB_EVENT_NAME: "schedule",
          GITHUB_EVENT_PATH: eventFile,
          "INPUT_MIN-HOURS": "not-a-number",
          "INPUT_GITHUB-TOKEN": "t",
        },
        run
      ),
    /"min-hours" must be a non-negative number/
  );
  rmSync(path.dirname(eventFile), { recursive: true, force: true });
});

test("run() throws a clear error when GITHUB_REPOSITORY is missing", async () => {
  const eventFile = writeEventFile({});
  await assert.rejects(
    () =>
      withEnv(
        {
          GITHUB_REPOSITORY: undefined,
          GITHUB_EVENT_NAME: "schedule",
          GITHUB_EVENT_PATH: eventFile,
          "INPUT_GITHUB-TOKEN": "t",
        },
        run
      ),
    /GITHUB_REPOSITORY is not set/
  );
  rmSync(path.dirname(eventFile), { recursive: true, force: true });
});

test("run() throws a clear error when GITHUB_REPOSITORY is malformed", async () => {
  const eventFile = writeEventFile({});
  await assert.rejects(
    () =>
      withEnv(
        {
          GITHUB_REPOSITORY: "not-a-valid-slug",
          GITHUB_EVENT_NAME: "schedule",
          GITHUB_EVENT_PATH: eventFile,
          "INPUT_GITHUB-TOKEN": "t",
        },
        run
      ),
    /Unexpected GITHUB_REPOSITORY value/
  );
  rmSync(path.dirname(eventFile), { recursive: true, force: true });
});

test("run() tolerates a malformed GITHUB_EVENT_PATH file by treating it as an empty payload", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "pr-age-gate-test-"));
  const eventFile = path.join(dir, "event.json");
  writeFileSync(eventFile, "not valid json{{{");

  const mock = await withMockServer((req, res) => {
    if (req.method === "GET" && req.url?.startsWith("/repos/acme/widgets/pulls?state=open")) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end("[]");
      return;
    }
    res.writeHead(404);
    res.end();
  });

  // Malformed event file -> readEventPayload() falls back to {} -> since
  // eventName is "schedule" here anyway this just confirms no crash.
  await withEnv(
    {
      GITHUB_API_URL: mock.url,
      GITHUB_REPOSITORY: "acme/widgets",
      GITHUB_EVENT_NAME: "schedule",
      GITHUB_EVENT_PATH: eventFile,
      "INPUT_GITHUB-TOKEN": "t",
    },
    run
  );

  await mock.close();
  rmSync(dir, { recursive: true, force: true });
});

test("run() bypasses via bypass-labels input, parsed from a comma-separated string", async () => {
  const mock = await withMockServer((req, res) => {
    if (req.method === "GET" && req.url?.includes("/check-runs") && req.method === "GET") {
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

  const eventFile = writeEventFile({
    pull_request: {
      number: 77,
      head: { sha: "sha77" },
      created_at: new Date().toISOString(), // brand new — would fail without a bypass
      labels: [{ name: "urgent" }],
    },
  });

  await withEnv(
    {
      GITHUB_API_URL: mock.url,
      GITHUB_REPOSITORY: "acme/widgets",
      GITHUB_EVENT_NAME: "pull_request",
      GITHUB_EVENT_PATH: eventFile,
      "INPUT_MIN-HOURS": "48",
      "INPUT_BYPASS-LABELS": "urgent,hotfix",
      "INPUT_GITHUB-TOKEN": "t",
    },
    run
  );

  const post = mock.calls.find((c) => c.method === "POST");
  assert.equal((post?.body as { conclusion?: string } | null)?.conclusion, "success");
  await mock.close();
  rmSync(path.dirname(eventFile), { recursive: true, force: true });
});
