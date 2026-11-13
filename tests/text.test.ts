import { describe, it, expect } from "vitest";
import { anchorsOf, containsToken, parseDiff, SECRET_RE, HOTSPOT_CLASSES, findFile } from "../src/util/text.js";

describe("anchorsOf", () => {
  it("extracts backtick spans as strong anchors", () => {
    const a = anchorsOf("Remove `sk-live-9f3Xk2Pq8LmN4bTr` please");
    expect(a.strong).toContain("sk-live-9f3xk2pq8lmn4btr");
  });

  it("extracts camelCase identifiers", () => {
    const a = anchorsOf("check the userId field");
    expect(a.strong).toContain("userid");
  });

  it("extracts snake_case identifiers", () => {
    const a = anchorsOf("rename max_retry_count");
    expect(a.strong).toContain("max_retry_count");
  });

  it("extracts dotted method calls", () => {
    const a = anchorsOf("replace `console.log` with logger");
    expect(a.strong).toContain("console.log");
  });

  it("requires >=4 chars for digit-bearing anchors so 429 is not an anchor", () => {
    const a = anchorsOf("retry on 429 responses");
    expect(a.strong).not.toContain("429");
  });

  it("keeps longer digit tokens like hunter2", () => {
    const a = anchorsOf("remove the password `hunter2-prod`");
    expect(a.strong).toContain("hunter2");
  });

  it("filters stopwords out of weak anchors", () => {
    const a = anchorsOf("the use of this code should be instead");
    expect(a.weak).not.toContain("the");
    expect(a.weak).not.toContain("instead");
  });

  it("does not duplicate a strong anchor into weak", () => {
    const a = anchorsOf("fix `parseTimeout`");
    expect(a.weak).not.toContain("parsetimeout");
  });
});

describe("containsToken", () => {
  it("matches standalone tokens", () => {
    expect(containsToken("if (!orderId) {", "orderid")).toBe(true);
  });

  it("does not match a token embedded in a longer identifier", () => {
    expect(containsToken("export function parseTimeoutMs() {}", "parsetimeout")).toBe(false);
  });

  it("respects trailing boundary", () => {
    expect(containsToken("console.log2(", "console.log")).toBe(false);
  });

  it("matches across punctuation boundaries", () => {
    expect(containsToken("await vault.read('k')", "vault.read")).toBe(true);
  });
});

describe("parseDiff", () => {
  const SAMPLE = `diff --git a/src/a.ts b/src/a.ts
index 111..222 100644
--- a/src/a.ts
+++ b/src/a.ts
@@ -10,4 +10,6 @@ ctx
 keep
-removed line
+added line
+added line 2
 context
diff --git a/src/b.ts b/src/b.ts
index 333..444 100644
--- a/src/b.ts
+++ b/src/b.ts
@@ -1,2 +1,2 @@
-old one
+new one`;

  it("parses both files", () => {
    const d = parseDiff(SAMPLE);
    expect(d.files).toHaveLength(2);
    expect(d.files[0]!.path).toBe("src/a.ts");
    expect(d.files[1]!.path).toBe("src/b.ts");
  });

  it("tracks added and removed lines with new line numbers", () => {
    const d = parseDiff(SAMPLE);
    const f = d.files[0]!;
    expect(f.addedLines).toHaveLength(2);
    expect(f.addedLines[0]!.newLine).toBe(11);
    expect(f.addedLines[1]!.newLine).toBe(12);
    expect(f.removedLines[0]!.text).toBe("removed line");
  });

  it("records hunk ranges", () => {
    const d = parseDiff(SAMPLE);
    const h = d.files[0]!.hunks[0]!;
    expect(h.newStart).toBe(10);
    expect(h.newCount).toBe(6);
  });

  it("supports diffs without the diff --git header", () => {
    const d = parseDiff("--- a/x.py\n+++ b/x.py\n@@ -1,1 +1,1 @@\n-a\n+b\n");
    expect(d.files).toHaveLength(1);
    expect(d.files[0]!.path).toBe("x.py");
    expect(d.files[0]!.addedLines[0]!.text).toBe("b");
  });

  it("ignores \\ No newline markers", () => {
    const d = parseDiff(`diff --git a/f.txt b/f.txt
--- a/f.txt
+++ b/f.txt
@@ -1 +1 @@
-old
+new
\\ No newline at end of file
`);
    expect(d.files[0]!.addedLines).toHaveLength(1);
  });
});

describe("SECRET_RE", () => {
  it("flags hardcoded secrets", () => {
    expect(SECRET_RE.test('const password = "hunter2";')).toBe(true);
    expect(SECRET_RE.test("token: 'abc123def'")).toBe(true);
    expect(SECRET_RE.test("sk-live-abcdefgh1234")).toBe(true);
  });

  it("does not flag env/vault-backed values", () => {
    expect(SECRET_RE.test("const apiKey = process.env.ORDER_API_KEY;")).toBe(false);
    expect(SECRET_RE.test("const password = await vault.read('pay/db');")).toBe(false);
    expect(SECRET_RE.test("token: secrets.manager.get()")).toBe(false);
  });

  it("does not flag plain identifiers without assignment", () => {
    expect(SECRET_RE.test("const apiKey = config.key;")).toBe(false);
  });
});

describe("HOTSPOT_CLASSES", () => {
  it("console-log class matches new console.log calls", () => {
    const cls = HOTSPOT_CLASSES.find((c) => c.name === "console-log")!;
    expect(cls.re.test('console.log("x")')).toBe(true);
    expect(cls.re.test("logger.log('x')")).toBe(false);
  });

  it("insecure-http class ignores localhost", () => {
    const cls = HOTSPOT_CLASSES.find((c) => c.name === "insecure-http")!;
    expect(cls.re.test('fetch("http://localhost:3000")')).toBe(false);
    expect(cls.re.test('fetch("http://evil.example.com")')).toBe(true);
  });
});

describe("findFile", () => {
  const d = parseDiff(`diff --git a/src/deep/mod.ts b/src/deep/mod.ts
--- a/src/deep/mod.ts
+++ b/src/deep/mod.ts
@@ -1 +1 @@
-a
+b`);
  it("resolves exact and suffix paths", () => {
    expect(findFile(d, "src/deep/mod.ts")?.path).toBe("src/deep/mod.ts");
    expect(findFile(d, "deep/mod.ts")?.path).toBe("src/deep/mod.ts");
    expect(findFile(d, "missing.ts")).toBeUndefined();
  });
});
