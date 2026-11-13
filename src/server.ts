import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AuditResult } from "./engine.js";
import { audit } from "./engine.js";
import { loadFeedback, loadClaims, loadDiff, LoadError } from "./load.js";
import { pkgRoot } from "./util/here.js";

const NAME = "FeedbackProof";
const VERSION = "1.0.0";

export interface ServerHandle {
  port: number;
  close: () => void;
}

interface DemoInfo {
  name: string;
  description: string;
}

function demoRoot(): string {
  return path.join(pkgRoot(), "examples");
}

export function listDemos(): DemoInfo[] {
  const dir = demoRoot();
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => {
      let description = "";
      const readme = path.join(dir, d.name, "README.md");
      if (fs.existsSync(readme)) description = fs.readFileSync(readme, "utf8").trim().split("\n")[0] ?? "";
      return { name: d.name, description };
    });
}

export function loadDemo(name: string): { feedback: string; claims: string; diff: string } {
  const dir = path.join(demoRoot(), path.basename(name));
  if (!fs.existsSync(dir)) throw new LoadError(`unknown demo: ${name}`);
  return {
    feedback: fs.readFileSync(path.join(dir, "feedback.json"), "utf8"),
    claims: fs.readFileSync(path.join(dir, "claims.json"), "utf8"),
    diff: fs.readFileSync(path.join(dir, "diff.patch"), "utf8"),
  };
}

export function runAuditPayload(feedbackRaw: unknown, claimsRaw: unknown, diffRaw: string): AuditResult {
  const feedback = loadFeedback(feedbackRaw);
  const claims = loadClaims(claimsRaw);
  const diff = loadDiff(diffRaw);
  return audit({ feedback, claims, diff });
}

function sendJson(res: http.ServerResponse, code: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > 5 * 1024 * 1024) {
        reject(new LoadError("request body too large (5MB limit)"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function serveStatic(res: http.ServerResponse, urlPath: string): void {
  const root = path.join(pkgRoot(), "static");
  let rel = urlPath === "/" ? "index.html" : urlPath.replace(/^\/+/, "");
  let file = path.normalize(path.join(root, rel));
  if (!file.startsWith(root)) {
    sendJson(res, 403, { error: "forbidden" });
    return;
  }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    file = path.join(root, "index.html");
  }
  if (!fs.existsSync(file)) {
    sendJson(res, 404, { error: "console not built; run npm run console" });
    return;
  }
  const ext = path.extname(file);
  const types: Record<string, string> = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".ico": "image/x-icon",
    ".json": "application/json; charset=utf-8",
  };
  const body = fs.readFileSync(file);
  res.writeHead(200, { "Content-Type": types[ext] ?? "application/octet-stream", "Content-Length": body.length });
  res.end(body);
}

export function startServer(opts: { port?: number; host?: string } = {}): Promise<ServerHandle> {
  const port = opts.port ?? Number(process.env.PORT ?? 8788);
  const host = opts.host ?? process.env.HOST ?? "127.0.0.1";

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const p = url.pathname;
    try {
      if (p === "/api/health" && req.method === "GET") {
        sendJson(res, 200, { ok: true, name: NAME, version: VERSION });
        return;
      }
      if (p === "/api/audit") {
        if (req.method !== "POST") {
          sendJson(res, 405, { error: "method not allowed; use POST /api/audit" });
          return;
        }
        const raw = await readBody(req);
        let parsed: unknown;
        try {
          parsed = JSON.parse(raw || "{}");
        } catch {
          sendJson(res, 400, { error: "request body must be valid JSON" });
          return;
        }
        const obj = (parsed ?? {}) as Record<string, unknown>;
        try {
          const result = runAuditPayload(obj.feedback, obj.claims, String(obj.diff ?? ""));
          sendJson(res, 200, result);
        } catch (e) {
          sendJson(res, 400, { error: e instanceof Error ? e.message : String(e) });
        }
        return;
      }
      if (p === "/api/demos" && req.method === "GET") {
        sendJson(res, 200, { demos: listDemos() });
        return;
      }
      if (p === "/api/demo" && req.method === "GET") {
        const name = url.searchParams.get("name") ?? "";
        try {
          const d = loadDemo(name);
          const result = runAuditPayload(JSON.parse(d.feedback), JSON.parse(d.claims), d.diff);
          sendJson(res, 200, result);
        } catch (e) {
          sendJson(res, 400, { error: e instanceof Error ? e.message : String(e) });
        }
        return;
      }
      if (p.startsWith("/api/")) {
        const known = ["/api/health", "/api/audit", "/api/demos", "/api/demo"];
        if (known.some((k) => p === k)) {
          sendJson(res, 405, { error: "method not allowed" });
        } else {
          sendJson(res, 404, { error: `unknown API endpoint: ${p}` });
        }
        return;
      }
      if (req.method === "GET" || req.method === "HEAD") {
        serveStatic(res, p);
        return;
      }
      sendJson(res, 405, { error: "method not allowed" });
    } catch (e) {
      sendJson(res, 500, { error: e instanceof Error ? e.message : String(e) });
    }
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      const addr = server.address();
      const actual = typeof addr === "object" && addr ? addr.port : port;
      resolve({ port: actual, close: () => server.close() });
    });
  });
}

export const SERVER_META = { NAME, VERSION };
