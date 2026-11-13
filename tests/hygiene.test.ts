import { describe, it, expect } from "vitest";
import { runAudit, MINI_DIFF } from "./helpers.js";

const FB = [{ id: "F1", file: "src/app.ts", line: 6, severity: "blocker", text: "Remove the hardcoded key `sk-live-abcdefgh1234`." }];

describe("hygiene rules", () => {
  it("G101 reports a silent fix as info", () => {
    const r = runAudit(FB, { items: [] }, MINI_DIFF);
    const g101 = r.findings.find((f) => f.rule === "G101");
    expect(g101?.severity).toBe("info");
  });

  it("G102 fires for fixed claims without evidence pointers", () => {
    const claims = { items: [{ id: "F1", status: "fixed" }] };
    const r = runAudit(FB, claims, MINI_DIFF);
    expect(r.findings.some((f) => f.rule === "G102" && f.severity === "warn")).toBe(true);
  });

  it("G103 fires for orphan claim ids", () => {
    const claims = { items: [{ id: "F99", status: "fixed", evidence: ["src/app.ts"] }, { id: "F1", status: "fixed", evidence: ["src/app.ts"] }] };
    const r = runAudit(FB, claims, MINI_DIFF);
    const g103 = r.findings.find((f) => f.rule === "G103");
    expect(g103?.severity).toBe("error");
    expect(g103?.item).toBe("F99");
  });

  it("G104 fires on duplicate claim entries", () => {
    const claims = {
      items: [
        { id: "F1", status: "fixed", evidence: ["src/app.ts"] },
        { id: "F1", status: "wontfix", reason: "actually skipping" },
      ],
    };
    const r = runAudit(FB, claims, MINI_DIFF);
    expect(r.findings.some((f) => f.rule === "G104")).toBe(true);
  });

  it("a clean claim set produces no hygiene findings", () => {
    const claims = { items: [{ id: "F1", status: "fixed", evidence: ["src/app.ts"] }] };
    const r = runAudit(FB, claims, MINI_DIFF);
    expect(r.findings.filter((f) => f.dim === "hygiene")).toHaveLength(0);
  });
});
