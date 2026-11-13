import { describe, it, expect } from "vitest";
import { loadFeedback, loadClaims, loadDiff, LoadError } from "../src/load.js";

describe("loadFeedback", () => {
  it("loads valid items and normalizes ./ paths", () => {
    const items = loadFeedback([{ id: "F1", file: "./src/a.ts", text: "fix it", severity: "blocker" }]);
    expect(items[0]!.file).toBe("src/a.ts");
    expect(items[0]!.severity).toBe("blocker");
  });

  it("defaults severity to major and keeps optional line", () => {
    const items = loadFeedback([{ id: "F1", file: "a.ts", text: "x" }]);
    expect(items[0]!.severity).toBe("major");
    expect(items[0]!.line).toBeUndefined();
  });

  it("rejects duplicate ids", () => {
    expect(() => loadFeedback([{ id: "F1", file: "a.ts", text: "x" }, { id: "F1", file: "b.ts", text: "y" }])).toThrow(LoadError);
  });

  it("rejects unknown severity", () => {
    expect(() => loadFeedback([{ id: "F1", file: "a.ts", text: "x", severity: "huge" }])).toThrow(LoadError);
  });

  it("rejects empty arrays and non-arrays", () => {
    expect(() => loadFeedback([])).toThrow(LoadError);
    expect(() => loadFeedback({})).toThrow(LoadError);
  });

  it("rejects negative or non-numeric line", () => {
    expect(() => loadFeedback([{ id: "F1", file: "a.ts", text: "x", line: -3 }])).toThrow(LoadError);
    expect(() => loadFeedback([{ id: "F1", file: "a.ts", text: "x", line: "abc" }])).toThrow(LoadError);
  });
});

describe("loadClaims", () => {
  it("loads entries with evidence", () => {
    const doc = loadClaims({ items: [{ id: "F1", status: "fixed", evidence: ["a.ts"] }] });
    expect(doc.items[0]!.evidence).toEqual(["a.ts"]);
  });

  it("rejects unknown status", () => {
    expect(() => loadClaims({ items: [{ id: "F1", status: "maybe" }] })).toThrow(LoadError);
  });

  it("rejects non-array evidence", () => {
    expect(() => loadClaims({ items: [{ id: "F1", status: "fixed", evidence: "a.ts" }] })).toThrow(LoadError);
  });

  it("keeps summary and optional fields", () => {
    const doc = loadClaims({ summary: "done", items: [{ id: "F1", status: "wontfix", reason: "not needed" }] });
    expect(doc.summary).toBe("done");
    expect(doc.items[0]!.reason).toBe("not needed");
  });
});

describe("loadDiff", () => {
  it("parses a valid diff", () => {
    const d = loadDiff("diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -1,1 +1,1 @@\n-a\n+b\n");
    expect(d.files).toHaveLength(1);
  });

  it("rejects empty strings and non-diffs", () => {
    expect(() => loadDiff("")).toThrow(LoadError);
    expect(() => loadDiff("hello world")).toThrow(LoadError);
  });
});
