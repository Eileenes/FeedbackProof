import { describe, it, expect } from "vitest";
import { audit, PENALTIES } from "../src/engine.js";
import { parseDiff } from "../src/util/text.js";
import { runAudit, auditDemo, MINI_DIFF } from "./helpers.js";

describe("engine scoring", () => {
  it("scores a fully clean loop at 100/A/pass with zero findings", () => {
    const r = auditDemo("clean-loop");
    expect(r.score).toBeGreaterThanOrEqual(95);
    expect(r.grade).toBe("A");
    expect(r.verdict).toBe("pass");
    expect(r.findings).toHaveLength(0);
    expect(r.caps).toHaveLength(0);
  });

  it("sloppy-loop lands in the D band and fails", () => {
    const r = auditDemo("sloppy-loop");
    expect(r.score).toBeGreaterThanOrEqual(60);
    expect(r.score).toBeLessThan(70);
    expect(r.grade).toBe("D");
    expect(r.verdict).toBe("fail");
  });

  it("phantom-loop lands in the F band", () => {
    const r = auditDemo("phantom-loop");
    expect(r.score).toBeLessThan(50);
    expect(r.grade).toBe("F");
    expect(r.verdict).toBe("fail");
  });

  it("calibration fixtures are pairwise separated by more than 15 points", () => {
    const clean = auditDemo("clean-loop").score;
    const sloppy = auditDemo("sloppy-loop").score;
    const phantom = auditDemo("phantom-loop").score;
    expect(clean - sloppy).toBeGreaterThan(15);
    expect(sloppy - phantom).toBeGreaterThan(15);
    expect(clean - phantom).toBeGreaterThan(15);
  });

  it("H101 caps the score at 58", () => {
    const fb = [{ id: "F1", file: "src/missing.ts", severity: "major", text: "remove the legacy `cacheAll` prefetch" }];
    const claims = { items: [{ id: "F1", status: "fixed", evidence: ["src/ghost.ts"] }] };
    const diff = `diff --git a/src/app.ts b/src/app.ts
--- a/src/app.ts
+++ b/src/app.ts
@@ -1,1 +1,1 @@
-a
+b`;
    const r = runAudit(fb, claims, diff);
    expect(r.findings.some((f) => f.rule === "H101")).toBe(true);
    expect(r.score).toBeLessThanOrEqual(58);
    expect(r.caps.some((c) => c.includes("H101"))).toBe(true);
  });

  it("error-count layered caps descend with severity", () => {
    const fb = Array.from({ length: 13 }, (_, i) => ({
      id: `F${i + 1}`,
      file: `src/app${i}.ts`,
      severity: "blocker",
      text: `escape the userContent${i} value`,
    }));
    const claims = { summary: "Everything is done.", items: [] };
    const r = runAudit(fb, claims, MINI_DIFF);
    expect(r.counts.error).toBeGreaterThanOrEqual(12);
    expect(r.score).toBeLessThanOrEqual(40);
  });

  it("repeat findings of the same rule decay at 35 percent", () => {
    const fb = [
      { id: "F1", file: "src/g1.ts", severity: "major", text: "escape the userContent value one" },
      { id: "F2", file: "src/g2.ts", severity: "major", text: "escape the userContent value two" },
    ];
    const claims = { items: [] };
    const r = runAudit(fb, claims, MINI_DIFF);
    const c101s = r.findings.filter((f) => f.rule === "C101");
    expect(c101s.length).toBe(2);
  });

  it("dims carry weights and per-dim finding counts", () => {
    const r = auditDemo("phantom-loop");
    const names = r.dims.map((d) => d.name);
    expect(names).toEqual(["coverage", "honesty", "targeting", "recurrence", "hygiene"]);
    const weightSum = r.dims.reduce((a, d) => a + d.weight, 0);
    expect(Math.abs(weightSum - 1)).toBeLessThan(1e-9);
  });

  it("item ledger exposes claim and evidence state", () => {
    const r = auditDemo("sloppy-loop");
    const f3 = r.items.find((i) => i.id === "F3")!;
    expect(f3.claimStatus).toBe("partial");
    expect(f3.diffEvidence).toBe("none");
    expect(f3.findings).toContain("H102");
  });

  it("penalty table covers every emitted rule", () => {
    for (const demo of ["clean-loop", "sloppy-loop", "phantom-loop"]) {
      const r = auditDemo(demo);
      for (const f of r.findings) {
        expect(PENALTIES[f.rule]).toBeDefined();
      }
    }
  });

  it("audit accepts already-parsed input objects", () => {
    const r = audit({
      feedback: [{ id: "F1", file: "src/app.ts", severity: "blocker", text: "Remove the hardcoded key `sk-live-abcdefgh1234`." }],
      claims: { items: [{ id: "F1", status: "fixed", evidence: ["src/app.ts"] }] },
      diff: parseDiff(MINI_DIFF),
    });
    expect(r.score).toBe(100);
  });
});
