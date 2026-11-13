import { describe, it, expect } from "vitest";
import { runAudit, MINI_DIFF } from "./helpers.js";

describe("recurrence rules", () => {
  it("R101 fires when a quoted hazard is added in another file", () => {
    const fb = [{ id: "F1", file: "src/lib/log.ts", severity: "minor", text: "Replace `console.log` with the structured logger." }];
    const diff = `diff --git a/src/web/track.ts b/src/web/track.ts
--- a/src/web/track.ts
+++ b/src/web/track.ts
@@ -1,1 +1,2 @@
+console.log("page_view", data);
`;
    const claims = { items: [] };
    const r = runAudit(fb, claims, diff);
    expect(r.findings.some((f) => f.rule === "R101" && f.severity === "error")).toBe(true);
  });

  it("R101 does not fire when the quoted id is part of the legitimate fix in the target file", () => {
    const fb = [{ id: "F1", file: "src/app.ts", line: 6, severity: "major", text: "Add a guard for empty `orderId` before calling the API." }];
    const diff = `diff --git a/src/app.ts b/src/app.ts
--- a/src/app.ts
+++ b/src/app.ts
@@ -5,3 +5,5 @@
+  if (!orderId) {
+    throw new Error("orderId is required");
+  }
`;
    const claims = { items: [{ id: "F1", status: "fixed", evidence: ["src/app.ts"] }] };
    const r = runAudit(fb, claims, diff);
    expect(r.findings.some((f) => f.rule === "R101")).toBe(false);
  });

  it("R101 fires when removal was asked but the span was re-added", () => {
    const fb = [{ id: "F1", file: "src/app.ts", severity: "major", text: "Remove the `debugger` statement before shipping." }];
    const diff = `diff --git a/src/app.ts b/src/app.ts
--- a/src/app.ts
+++ b/src/app.ts
@@ -5,3 +5,4 @@
+  debugger;
`;
    const claims = { items: [] };
    const r = runAudit(fb, claims, diff);
    expect(r.findings.some((f) => f.rule === "R101")).toBe(true);
  });

  it("R102 flags the same hazard class appearing in other files", () => {
    const fb = [{ id: "F1", file: "src/pay/charge.ts", severity: "blocker", text: "Remove the hardcoded password before it leaks." }];
    const diff = `diff --git a/src/other.ts b/src/other.ts
--- a/src/other.ts
+++ b/src/other.ts
@@ -1,1 +1,2 @@
+const password = "letmein123";
`;
    const claims = { items: [] };
    const r = runAudit(fb, claims, diff);
    expect(r.findings.some((f) => f.rule === "R102")).toBe(true);
  });

  it("R102 does not fire on env/vault-backed values", () => {
    const fb = [{ id: "F1", file: "src/pay/charge.ts", severity: "blocker", text: "Remove the hardcoded password before it leaks." }];
    const diff = `diff --git a/src/other.ts b/src/other.ts
--- a/src/other.ts
+++ b/src/other.ts
@@ -1,1 +1,2 @@
+const password = await vault.read("pay/db");
`;
    const claims = { items: [] };
    const r = runAudit(fb, claims, diff);
    expect(r.findings.some((f) => f.rule === "R102")).toBe(false);
  });

  it("R103 reports removed-and-re-added anchors as info", () => {
    const fb = [{ id: "F1", file: "src/app.ts", severity: "minor", text: "inline the `fetchWithRetry` helper" }];
    const diff = `diff --git a/src/app.ts b/src/app.ts
--- a/src/app.ts
+++ b/src/app.ts
@@ -5,3 +5,4 @@
-  const resp = await fetchWithRetry(url);
+  const resp = await fetchWithRetry(url, 2);
`;
    const claims = { items: [{ id: "F1", status: "fixed", evidence: ["src/app.ts"] }] };
    const r = runAudit(fb, claims, diff);
    const r103 = r.findings.find((f) => f.rule === "R103");
    expect(r103?.severity).toBe("info");
  });
});
