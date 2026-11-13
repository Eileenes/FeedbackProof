import type { ParsedDiff, DiffFile, DiffHunk, DiffLine } from "../types.js";

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "if", "then", "else", "when", "with",
  "without", "for", "from", "this", "that", "these", "those", "is", "are",
  "was", "were", "be", "been", "being", "to", "of", "in", "on", "at", "by",
  "it", "its", "as", "into", "about", "after", "before", "over", "under",
  "not", "no", "do", "does", "did", "can", "could", "should", "would", "will",
  "shall", "may", "might", "must", "have", "has", "had", "you", "your", "we",
  "our", "they", "their", "them", "there", "here", "what", "which", "who",
  "how", "why", "add", "use", "using", "make", "made", "instead", "before",
  "please", "current", "currently", "code", "line", "lines",
  "这个", "那个", "这些", "那些", "一下", "改成", "换成", "加上", "去掉",
  "应该", "需要", "建议", "最好", "这里", "那里", "代码", "改成",
]);

export interface Anchors {
  /** Strong: quoted spans, backtick spans, paths, identifiers, constants. */
  strong: string[];
  /** Weak: content words for fuzzy matching. */
  weak: string[];
}

/**
 * Extract match anchors from feedback text.
 * Strong anchors must appear verbatim (with token boundaries) in the diff.
 * Weak anchors require >=2 distinct hits in the same file.
 */
export function anchorsOf(text: string): Anchors {
  const strong = new Set<string>();
  const weak = new Set<string>();

  // Backtick spans first.
  for (const m of text.matchAll(/`([^`]+)`/g)) {
    const v = (m[1] ?? "").trim();
    if (v.length >= 2) strong.add(v.toLowerCase());
  }
  // Double/single quoted spans.
  for (const m of text.matchAll(/["']([^"']{3,})["']/g)) {
    const v = (m[1] ?? "").trim();
    if (v.length >= 3 && !/^\s/.test(v)) strong.add(v.toLowerCase());
  }
  // Paths with extensions (but not bare sentence words).
  for (const m of text.matchAll(/\b[\w@./-]+\.(?:ts|tsx|js|jsx|mjs|py|go|rs|java|rb|json|ya?ml|toml|md|css|scss|html|sh|sql)\b/gi)) {
    strong.add(m[0].toLowerCase());
  }
  // Identifiers: camelCase, snake_case, SCREAMING_CASE, dotted calls, digits.
  // Digit-bearing tokens require >=4 chars so "429" or "2" cannot match everywhere.
  for (const m of text.matchAll(/\b[a-z]+[A-Z][A-Za-z0-9]*\b|\b[a-z]+(?:_[a-z0-9]+)+\b|\b[A-Z]{2,}(?:_[A-Z0-9]+)*\b/g)) {
    if (m[0].length >= 3) strong.add(m[0].toLowerCase());
  }
  for (const m of text.matchAll(/\b\w*\d\w*\b/g)) {
    if (m[0].length >= 4) strong.add(m[0].toLowerCase());
  }
  // Dotted method calls e.g. console.log / fs.readFile.
  for (const m of text.matchAll(/\b[a-zA-Z_$][\w$]*\.[a-zA-Z_$][\w$]*\b/g)) {
    strong.add(m[0].toLowerCase());
  }

  // Weak: content words.
  for (const w of text.toLowerCase().split(/[^a-z0-9\u4e00-\u9fff]+/)) {
    if (w.length >= 3 && w.length <= 24 && !STOPWORDS.has(w) && !/^\d+$/.test(w)) {
      weak.add(w);
    }
  }

  // Do not let a weak word duplicate a strong anchor.
  for (const s of strong) weak.delete(s);
  return { strong: [...strong], weak: [...weak].slice(0, 8) };
}

/** Standalone token boundary match for `needle` inside `haystack`. */
export function containsToken(haystack: string, needle: string): boolean {
  if (!needle) return false;
  const esc = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(?<![A-Za-z0-9_$])${esc}(?![A-Za-z0-9_$])`, "i");
  return re.test(haystack);
}

export function countToken(haystack: string, needle: string): number {
  if (!needle) return 0;
  const esc = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(?<![A-Za-z0-9_$])${esc}(?![A-Za-z0-9_$])`, "gi");
  return (haystack.match(re) ?? []).length;
}

/** Secret-shaped literals that must never appear as new added lines. */
// prettier-ignore
export const SECRET_RE = new RegExp(
  "(?<![A-Za-z0-9_])" +
  "(?:" +
  "(?:sk|pk|rk)-[A-Za-z0-9_-]{8,}" +
  "|AKIA[0-9A-Z]{16}" +
  "|ghp_[A-Za-z0-9]{20,}" +
  "|(?:password|passwd|pwd|secret|token|api[_-]?key|access[_-]?key)\\s*[:=]\\s*[\"']?(?!(?:process\\.env|os\\.environ|getenv|System\\.get|await vault|vault\\.|secrets\\.|dotenv|config\\.|ctx\\.|props\\.|env\\.|os\\.))[A-Za-z0-9_./-]{4,}" +
  ")",
  "i"
);

export const SECRET_CUE_RE = /password|passwd|secret|api[ _-]?key|apikey|token|credential|密钥|密码|凭据|令牌/i;

export interface HotspotClass {
  name: string;
  re: RegExp;
  cue: RegExp;
}

export const HOTSPOT_CLASSES: HotspotClass[] = [
  { name: "secret", re: SECRET_RE, cue: SECRET_CUE_RE },
  { name: "console-log", re: /(?<![A-Za-z0-9_$.])console\.log\(/, cue: /console\.log|print|logging|日志|打印/i },
  { name: "todo", re: /\b(?:TODO|FIXME|HACK|XXX)\b/, cue: /todo|fixme|hack\b/i },
  { name: "eval", re: /(?<![A-Za-z0-9_$.])eval\s*\(|exec\s*\(\s*f?["']/, cue: /eval|exec|动态执行/i },
  { name: "as-any", re: /as any\b|@ts-ignore|@ts-nocheck/, cue: /as any|ts-ignore|类型断言|type cast/i },
  { name: "insecure-http", re: /http:\/\/(?!localhost|127\.0\.0\.1)/, cue: /http:\/\/|明文|insecure/i },
];

/** Parse a unified diff into structured files/hunks. */
export function parseDiff(raw: string): ParsedDiff {
  const files: DiffFile[] = [];
  let cur: DiffFile | null = null;
  let curHunk: DiffHunk | null = null;
  let newLine = 0;

  for (const rawLine of raw.split(/\r?\n/)) {
    if (rawLine.startsWith("diff --git ")) {
      cur = null;
      curHunk = null;
      const m = rawLine.match(/diff --git a\/(.+?) b\/(.+)$/);
      const f: DiffFile = { path: m?.[2] ? m[2] : rawLine.slice(11).trim(), hunks: [], addedLines: [], removedLines: [] };
      cur = f;
      files.push(f);
      continue;
    }
    if (!cur) {
      // Tolerate diffs without "diff --git" header: start on "--- a/".
      const m = rawLine.match(/^--- a\/(.+)$/);
      if (m?.[1]) {
        const f: DiffFile = { path: m[1], hunks: [], addedLines: [], removedLines: [] };
        cur = f;
        files.push(f);
      }
      continue;
    }
    const file = cur as DiffFile;
    if (rawLine.startsWith("--- ")) continue;
    if (rawLine.startsWith("+++ ")) {
      const m = rawLine.match(/^\+\+\+ b?\/?(.+)$/);
      if (m?.[1] && m[1] !== "/dev/null") file.path = m[1].replace(/^b\//, "");
      continue;
    }
    if (rawLine.startsWith("new file mode") || rawLine.startsWith("deleted file mode") || rawLine.startsWith("index ") || rawLine.startsWith("similarity ") || rawLine.startsWith("rename ")) {
      continue;
    }
    const hunkM = rawLine.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,(\d+))? @@/);
    if (hunkM) {
      curHunk = {
        oldStart: Number(hunkM[1] ?? "0"),
        newStart: Number(hunkM[2] ?? "0"),
        newCount: hunkM[3] !== undefined ? Number(hunkM[3]) : 1,
        added: [],
        removed: [],
      };
      file.hunks.push(curHunk);
      newLine = curHunk.newStart;
      continue;
    }
    const hunk = curHunk as DiffHunk | null;
    if (!hunk) continue;
    if (rawLine.startsWith("+")) {
      const dl: DiffLine = { text: rawLine.slice(1), newLine };
      hunk.added.push(dl);
      file.addedLines.push(dl);
      newLine += 1;
    } else if (rawLine.startsWith("-")) {
      const dl: DiffLine = { text: rawLine.slice(1) };
      hunk.removed.push(dl);
      file.removedLines.push(dl);
    } else if (rawLine.startsWith(" ") || rawLine === "") {
      newLine += 1;
    }
    // "\ No newline at end of file" and others ignored.
  }
  return { files };
}

export function diffFilePaths(diff: ParsedDiff): string[] {
  return diff.files.map((f) => f.path);
}

export function findFile(diff: ParsedDiff, path: string): DiffFile | undefined {
  const norm = path.replace(/^\.\//, "");
  return diff.files.find((f) => f.path === norm || f.path === `./${norm}` || norm.endsWith(f.path) || f.path.endsWith(norm));
}
