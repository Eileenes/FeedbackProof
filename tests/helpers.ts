import { audit, type AuditResult } from "../src/engine.js";
import type { FeedbackItem, ClaimDoc } from "../src/types.js";
import { parseDiff } from "../src/util/text.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const testsRoot = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(testsRoot, "..");

export function runAudit(feedback: unknown, claims: unknown, diff: string): AuditResult {
  return audit({
    feedback: feedback as FeedbackItem[],
    claims: claims as ClaimDoc,
    diff: parseDiff(diff),
  });
}

export function loadDemoFixture(name: string): { feedback: unknown; claims: unknown; diff: string } {
  const dir = path.join(repoRoot, "examples", name);
  return {
    feedback: JSON.parse(fs.readFileSync(path.join(dir, "feedback.json"), "utf8")),
    claims: JSON.parse(fs.readFileSync(path.join(dir, "claims.json"), "utf8")),
    diff: fs.readFileSync(path.join(dir, "diff.patch"), "utf8"),
  };
}

export function auditDemo(name: string): AuditResult {
  const f = loadDemoFixture(name);
  return runAudit(f.feedback, f.claims, f.diff);
}

export const MINI_DIFF = `diff --git a/src/app.ts b/src/app.ts
index aaaa..bbbb 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -5,4 +5,6 @@ export function boot() {
   const port = 8080;
-  const apiKey = "sk-live-abcdefgh1234";
+  const apiKey = process.env.APP_API_KEY;
   serve(port);
`;
