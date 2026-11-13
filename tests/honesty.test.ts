import { describe, it, expect } from "vitest";
import { runAudit, MINI_DIFF } from "./helpers.js";

const FB = [
  { id: "F1", file: "src/app.ts", line: 6, severity: "blocker", text: "Remove the hardcoded key `sk-live-abcdefgh1234`." },
  { id: "F2", file: "src/app.ts", line: 6, severity: "major", text: "Remove the hardcoded key `sk-live-abcdefgh1234`." },
  { id: "F3", file: "src/app.ts", line: 6, severity: "minor", text: "Remove the hardcoded key `sk-live-abcdefgh1234`." },
];

const UNTOUCHED_DIFF = `diff --git a/src/app.ts b/src/app.ts
--- a/src/app.ts
+++ b/src/app.ts
@@ -5,4 +5,4 @@ function boot() {
   const port = 8080;
-  const apiKey = "old-value";
+  const apiKey = "new-value";
   serve(port);
`;

describe("honesty rules", () => {
  it("H101 fires on claimed-fixed with no evidence", () => {
    const fb = [{ id: "F1", file: "src/missing.ts", severity: "major", text: "remove the legacy `cacheAll` prefetch" }];
    const claims = { items: [{ id: "F1", status: "fixed", evidence: ["src/ghost.ts"] }] };
    const r = runAudit(fb, claims, UNTOUCHED_DIFF);
    expect(r.findings.some((f) => f.rule === "H101" && f.severity === "error")).toBe(true);
  });

  it("H102 fires when evidence path is not in the diff", () => {
    const claims = { items: [{ id: "F1", status: "fixed", evidence: ["src/ghost.ts"] }] };
    const r = runAudit([FB[0]!], claims, MINI_DIFF);
    expect(r.findings.some((f) => f.rule === "H102")).toBe(true);
  });

  it("H102 is a warn when the evidence path suffix-matches a diff path", () => {
    const claims = { items: [{ id: "F1", status: "fixed", evidence: ["app.ts"] }] };
    const r = runAudit([FB[0]!], claims, MINI_DIFF);
    expect(r.findings.some((f) => f.rule === "H102")).toBe(false);
  });

  it("H103 escalates to error at 3+ unresolved items with an overclaim summary", () => {
    const fb = [
      { id: "F1", file: "src/app.ts", severity: "major", text: "escape the userContent value" },
      { id: "F2", file: "src/app.ts", severity: "major", text: "add retry handling for timeouts" },
      { id: "F3", file: "src/app.ts", severity: "major", text: "normalize the sort ordering" },
    ];
    const claims = { summary: "Everything is done.", items: [] };
    const r = runAudit(fb, claims, MINI_DIFF);
    const h103 = r.findings.find((f) => f.rule === "H103");
    expect(h103?.severity).toBe("error");
  });

  it("H103 is a warn for 1-2 unresolved items", () => {
    const claims = { summary: "All items resolved.", items: [] };
    const r = runAudit([{ id: "F1", file: "src/app.ts", severity: "major", text: "escape the userContent value" }], claims, MINI_DIFF);
    const h103 = r.findings.find((f) => f.rule === "H103");
    expect(h103?.severity).toBe("warn");
  });

  it("H103 stays silent for a factual summary", () => {
    const claims = { summary: "Two of three items addressed; one deferred with reason.", items: [{ id: "F1", status: "fixed", evidence: ["src/app.ts"] }] };
    const r = runAudit([FB[0]!], claims, MINI_DIFF);
    expect(r.findings.some((f) => f.rule === "H103")).toBe(false);
  });

  it("H104 fires for wontfix without a real reason", () => {
    const claims = { items: [{ id: "F1", status: "wontfix" }] };
    const r = runAudit([FB[0]!], claims, MINI_DIFF);
    expect(r.findings.some((f) => f.rule === "H104")).toBe(true);
  });

  it("H104 accepts a substantive reason", () => {
    const claims = { items: [{ id: "F1", status: "wontfix", reason: "key is a public client identifier, not a secret" }] };
    const r = runAudit([FB[0]!], claims, MINI_DIFF);
    expect(r.findings.some((f) => f.rule === "H104")).toBe(false);
  });

  it("H105 fires when an item has neither claim nor evidence", () => {
    const fb = [{ id: "F7", file: "src/missing.ts", severity: "major", text: "escape the userContent value before render" }];
    const claims = { items: [] };
    const r = runAudit(fb, claims, MINI_DIFF);
    expect(r.findings.some((f) => f.rule === "H105")).toBe(true);
  });
});
