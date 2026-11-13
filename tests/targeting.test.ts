import { describe, it, expect } from "vitest";
import { runAudit } from "./helpers.js";

const FB = [
  { id: "F1", file: "src/app.ts", line: 40, severity: "major", text: "add a guard for empty `userId` before the request" },
];

const DIFF = `diff --git a/src/app.ts b/src/app.ts
--- a/src/app.ts
+++ b/src/app.ts
@@ -5,3 +5,6 @@ function boot() {
   const port = 8080;
+  if (!userId) {
+    throw new Error("userId is required");
+  }
   serve(port);
`;

describe("targeting rules", () => {
  it("T101 fires when the fix lands far from the feedback line", () => {
    const claims = { items: [{ id: "F1", status: "fixed", evidence: ["src/app.ts"] }] };
    const fb = [{ id: "F1", file: "src/app.ts", line: 300, severity: "major", text: "add a guard for empty `userId` before the request" }];
    const r = runAudit(fb, claims, DIFF);
    const t101 = r.findings.find((f) => f.rule === "T101");
    expect(t101).toBeDefined();
    expect(t101!.message).toContain("lines away");
  });

  it("T101 stays silent when the hunk covers the feedback line", () => {
    const claims = { items: [{ id: "F1", status: "fixed", evidence: ["src/app.ts"] }] };
    const fb = [{ id: "F1", file: "src/app.ts", line: 6, severity: "major", text: "add a guard for empty `userId` before the request" }];
    const r = runAudit(fb, claims, DIFF);
    expect(r.findings.some((f) => f.rule === "T101")).toBe(false);
  });

  it("T102 flags changed files nobody asked about", () => {
    const diff = DIFF + `diff --git a/src/sneaky.ts b/src/sneaky.ts
--- a/src/sneaky.ts
+++ b/src/sneaky.ts
@@ -1,1 +1,2 @@
+refactor();
`;
    const claims = { items: [{ id: "F1", status: "fixed", evidence: ["src/app.ts"] }] };
    const r = runAudit(FB, claims, diff);
    const t102 = r.findings.filter((f) => f.rule === "T102");
    expect(t102).toHaveLength(1);
    expect(t102[0]!.file).toBe("src/sneaky.ts");
  });

  it("T102 accepts files mentioned in claim notes", () => {
    const diff = DIFF + `diff --git a/src/sneaky.ts b/src/sneaky.ts
--- a/src/sneaky.ts
+++ b/src/sneaky.ts
@@ -1,1 +1,2 @@
+refactor();
`;
    const claims = { items: [{ id: "F1", status: "fixed", evidence: ["src/app.ts"], note: "also fixed imports in sneaky.ts" }] };
    const r = runAudit(FB, claims, diff);
    expect(r.findings.some((f) => f.rule === "T102")).toBe(false);
  });

  it("T102 caps at five files", () => {
    let diff = DIFF;
    for (let i = 0; i < 8; i++) {
      diff += `diff --git a/src/extra${i}.ts b/src/extra${i}.ts
--- a/src/extra${i}.ts
+++ b/src/extra${i}.ts
@@ -1,1 +1,2 @@
+noise${i}();
`;
    }
    const claims = { items: [{ id: "F1", status: "fixed", evidence: ["src/app.ts"] }] };
    const r = runAudit(FB, claims, diff);
    expect(r.findings.filter((f) => f.rule === "T102").length).toBeLessThanOrEqual(5);
  });
});
