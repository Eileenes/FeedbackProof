import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startServer, type ServerHandle } from "../src/server.js";

let h: ServerHandle;
let base: string;

beforeAll(async () => {
  h = await startServer({ port: 0, host: "127.0.0.1" });
  base = `http://127.0.0.1:${h.port}`;
});

afterAll(() => {
  h.close();
});

describe("API server", () => {
  it("GET /api/health returns ok with name and version", async () => {
    const res = await fetch(`${base}/api/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.name).toBe("FeedbackProof");
    expect(typeof body.version).toBe("string");
  });

  it("POST /api/audit returns a full result for valid input", async () => {
    const res = await fetch(`${base}/api/audit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        feedback: [{ id: "F1", file: "src/app.ts", severity: "blocker", text: "Remove the hardcoded key `sk-live-abcdefgh1234`." }],
        claims: { items: [{ id: "F1", status: "fixed", evidence: ["src/app.ts"] }] },
        diff: "diff --git a/src/app.ts b/src/app.ts\n--- a/src/app.ts\n+++ b/src/app.ts\n@@ -5,4 +5,4 @@\n-  const apiKey = \"sk-live-abcdefgh1234\";\n+  const apiKey = process.env.APP_API_KEY;\n",
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.score).toBe(100);
    expect(body.items).toHaveLength(1);
  });

  it("POST /api/audit returns 400 for malformed payloads", async () => {
    const res = await fetch(`${base}/api/audit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ feedback: [], claims: { items: [] }, diff: "not a diff" }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBeDefined();
  });

  it("POST /api/audit returns 400 for invalid JSON body", async () => {
    const res = await fetch(`${base}/api/audit`, { method: "POST", body: "{nope" });
    expect(res.status).toBe(400);
  });

  it("GET /api/audit is 405", async () => {
    const res = await fetch(`${base}/api/audit`);
    expect(res.status).toBe(405);
  });

  it("GET /api/demos lists the calibration fixtures", async () => {
    const res = await fetch(`${base}/api/demos`);
    const body = await res.json();
    const names = body.demos.map((d: { name: string }) => d.name);
    expect(names).toContain("clean-loop");
    expect(names).toContain("sloppy-loop");
    expect(names).toContain("phantom-loop");
  });

  it("GET /api/demo returns the phantom result", async () => {
    const res = await fetch(`${base}/api/demo?name=phantom-loop`);
    const body = await res.json();
    expect(body.grade).toBe("F");
  });

  it("GET /api/demo with unknown name returns 400", async () => {
    const res = await fetch(`${base}/api/demo?name=nope`);
    expect(res.status).toBe(400);
  });

  it("unknown /api paths return 404", async () => {
    const res = await fetch(`${base}/api/bogus`);
    expect(res.status).toBe(404);
  });

  it("serves the console index at /", async () => {
    const res = await fetch(`${base}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    const text = await res.text();
    expect(text).toContain("FeedbackProof");
  });

  it("serves console assets and falls back to the SPA without escaping the root", async () => {
    const asset = await fetch(`${base}/assets/index.js`);
    expect(asset.status).toBe(200);
    const fallback = await fetch(`${base}/some/unknown/route`);
    expect(fallback.status).toBe(200);
    expect(fallback.headers.get("content-type")).toContain("text/html");
    const trav = await fetch(`${base}/..%2Fetc%2Fpasswd`);
    expect(trav.status).toBe(200);
    expect((await trav.text())).not.toContain("root:");
  });

  it("POST to a static path returns 405", async () => {
    const res = await fetch(`${base}/`, { method: "POST" });
    expect(res.status).toBe(405);
  });
});
