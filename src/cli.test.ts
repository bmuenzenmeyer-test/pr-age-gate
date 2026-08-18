import { test } from "node:test";
import assert from "node:assert/strict";
import { parseArgs, main } from "./cli.ts";
import { withMockServer } from "./test-helpers.ts";

test("parseArgs pairs --flag value, and treats a flag with no value as true", () => {
  assert.deepEqual(parseArgs(["--owner", "acme", "--repo", "widgets", "--dry-run"]), {
    owner: "acme",
    repo: "widgets",
    "dry-run": "true",
  });
});

test("parseArgs ignores bare positional args that aren't --flags", () => {
  assert.deepEqual(parseArgs(["positional", "--pr", "5"]), { pr: "5" });
});

async function withArgv<T>(args: string[], fn: () => Promise<T>): Promise<T> {
  const original = process.argv;
  process.argv = [original[0] ?? "node", original[1] ?? "cli.ts", ...args];
  try {
    return await fn();
  } finally {
    process.argv = original;
  }
}

test("main() exits 2 with usage when required args are missing", async () => {
  const code = await withArgv([], () => main());
  assert.equal(code, 2);
});

test("main() exits 2 on an invalid --min-hours", async () => {
  const code = await withArgv(["--owner", "a", "--repo", "b", "--pr", "1", "--min-hours", "not-a-number"], () =>
    main()
  );
  assert.equal(code, 2);
});

test("main() exits 0 for a PR old enough to pass, using --token (not env)", async () => {
  const mock = await withMockServer((req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        number: 1,
        head: { sha: "s" },
        created_at: new Date(Date.now() - 100 * 3600 * 1000).toISOString(),
      })
    );
  });

  const code = await withArgv(
    ["--owner", "acme", "--repo", "widgets", "--pr", "1", "--min-hours", "48", "--token", "t"],
    () => {
      process.env.GITHUB_API_URL = mock.url;
      return main();
    }
  );
  delete process.env.GITHUB_API_URL;

  assert.equal(code, 0);
  await mock.close();
});

test("main() exits 1 for a PR that's too young", async () => {
  const mock = await withMockServer((req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        number: 2,
        head: { sha: "s" },
        created_at: new Date(Date.now() - 1 * 3600 * 1000).toISOString(),
      })
    );
  });

  const code = await withArgv(["--owner", "acme", "--repo", "widgets", "--pr", "2", "--min-hours", "48"], () => {
    process.env.GITHUB_API_URL = mock.url;
    return main();
  });
  delete process.env.GITHUB_API_URL;

  assert.equal(code, 1);
  await mock.close();
});

test("main() exits 0 when a bypass label makes an otherwise-too-young PR pass", async () => {
  const mock = await withMockServer((req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        number: 3,
        head: { sha: "s" },
        created_at: new Date().toISOString(),
        labels: [{ name: "urgent" }],
      })
    );
  });

  const code = await withArgv(
    ["--owner", "acme", "--repo", "widgets", "--pr", "3", "--min-hours", "48", "--bypass-labels", "urgent,hotfix"],
    () => {
      process.env.GITHUB_API_URL = mock.url;
      return main();
    }
  );
  delete process.env.GITHUB_API_URL;

  assert.equal(code, 0);
  await mock.close();
});
