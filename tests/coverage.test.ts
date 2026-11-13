import { describe, it, expect } from "vitest";
import { runAudit, MINI_DIFF } from "./helpers.js";

const FB = [
  { id: "F1", file: "src/app.ts", line: 6, severity: "blocker", text: "Remove the hardcoded key `sk-live-abcdefgh1234`." },
];

describe("coverage rules", () => {
  it("no findings when the fix lands in the target file (clean loop)", () => {
    const claims = { items: [{ id: "F1", status: "fixed", evidence: ["src/app.ts"] }] };
    const r = runAudit(FB, claims, MINI_DIFF);
    expect(r.findings.filter((f) => f.dim === "coverage")).toHaveLength(0);
    expect(r.items[0]!.diffEvidence).toBe("targeted");
  });

  it("C101 fires when nothing anywhere matches", () => {
    const diff = `diff --git a/src/other.ts b/src/other.ts
--- a/src/other.ts
+++ b/src/other.ts
@@ -1,1 +1,2 @@
+x
+y`;
    const claims = { items: [{ id: "F1", status: "fixed", evidence: ["src/other.ts"] }] };
    const r = runAudit(FB, claims, diff);
    expect(r.findings.some((f) => f.rule === "C101" && f.severity === "error")).toBe(true);
  });

  it("C102/C103 fire when evidence only exists in another file", () => {
    const diff = `diff --git a/src/other.ts b/src/other.ts
--- a/src/other.ts
+++ b/src/other.ts
@@ -1,1 +1,2 @@
+x
+const apiKey = "sk-live-abcdefgh1234";`;
    const claims = { items: [{ id: "F1", status: "fixed", evidence: ["src/other.ts"] }] };
    const r = runAudit(FB, claims, diff);
    expect(r.findings.some((f) => f.rule === "C102")).toBe(true);
    expect(r.findings.some((f) => f.rule === "C103")).toBe(true);
  });

  it("C104 fires when the target file changed but the item was skipped", () => {
    const diff = `diff --git a/src/app.ts b/src/app.ts
--- a/src/app.ts
+++ b/src/app.ts
@@ -1,1 +1,2 @@
+x
+y`;
    const claims = { items: [{ id: "F1", status: "deferred", reason: "next sprint" }] };
    const r = runAudit(FB, claims, diff);
    expect(r.findings.some((f) => f.rule === "C104")).toBe(true);
  });

  it("C101 severity follows item severity", () => {
    const fb = [{ id: "F9", file: "src/missing.ts", severity: "minor", text: "escape the userContent value" }];
    const claims = { items: [] };
    const r = runAudit(fb, claims, MINI_DIFF);
    const c101 = r.findings.find((f) => f.rule === "C101");
    expect(c101?.severity).toBe("info");
  });

  it("weak-anchor matching needs at least two content words", () => {
    const fb = [{ id: "F1", file: "src/app.ts", severity: "major", text: "improve the throughput characteristics somehow" }];
    const claims = { items: [] };
    const r = runAudit(fb, claims, MINI_DIFF);
    expect(r.items[0]!.diffEvidence).toBe("none");
  });
});
