import http from "node:http";

export interface MockServer {
  url: string;
  calls: { method: string; url: string; body: unknown }[];
  close: () => Promise<void>;
}

/** Spins up a real local HTTP server so tests exercise actual network calls, not mocked fetch. */
export async function withMockServer(
  handler: (req: http.IncomingMessage, res: http.ServerResponse, calls: MockServer["calls"]) => void
): Promise<MockServer> {
  const calls: MockServer["calls"] = [];
  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      let body: unknown = null;
      if (raw) {
        try {
          body = JSON.parse(raw);
        } catch {
          body = raw;
        }
      }
      calls.push({ method: req.method ?? "GET", url: req.url ?? "", body });
      handler(req, res, calls);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  return {
    url: `http://127.0.0.1:${port}`,
    calls,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
