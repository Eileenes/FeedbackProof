import type { Finding } from "../types.js";
import type { RuleCtx } from "./context.js";
import { anchorsOf, containsToken, HOTSPOT_CLASSES, findFile } from "../util/text.js";

const REMOVAL_RE = /\b(remove|delete|strip|drop|eliminate|get rid of)\b|删除|移除|去掉|清除/i;

export function recurrenceRules(ctx: RuleCtx): Finding[] {
  const out: Finding[] = [];
  const allAdded = ctx.diff.files.flatMap((f) => f.addedLines.map((l) => ({ file: f.path, ...l })));

  // R101 reintroduced pattern: a code span the feedback quoted verbatim shows up
  // in NEW lines, in one of two guilty shapes:
  //   (a) added in a file OTHER than the item's target (pattern spreading), or
  //   (b) the feedback explicitly asked for removal, and the span was re-added
  //       anywhere (including the target file).
  // A quoted identifier that legitimately appears inside the item's own fix
  // (e.g. a guard referencing `orderId`) is neither and must not fire.
  for (const item of ctx.feedback) {
    const quoted = [...item.text.matchAll(/`([^`]+)`/g)]
      .map((m) => (m[1] ?? "").trim())
      .filter((s) => s.length >= 4);
    if (quoted.length === 0) continue;
    const target = findFile(ctx.diff, item.file);
    const targetPath = target?.path ?? null;
    const askedRemoval = REMOVAL_RE.test(item.text);
    for (const q of quoted) {
      const ql = q.toLowerCase();
      const elsewhere = allAdded.filter((l) => l.file !== targetPath);
      if (containsToken(elsewhere.map((l) => l.text).join("\n"), ql)) {
        out.push({
          rule: "R101",
          dim: "recurrence",
          severity: "error",
          item: item.id,
          message: `${item.id} quoted \`${q}\` but that exact pattern appears in added lines outside ${item.file} (reintroduced while unaddressed)`,
        });
        break;
      }
      const allAddedText = allAdded.map((l) => l.text).join("\n");
      if (askedRemoval && containsToken(allAddedText, ql)) {
        out.push({
          rule: "R101",
          dim: "recurrence",
          severity: "error",
          item: item.id,
          message: `${item.id} asked to remove \`${q}\` but it was re-added in the follow-up diff`,
        });
        break;
      }
    }
  }

  // R102 twin hotspot: feedback flags a hazard class, and the same class shows
  // up in added lines OUTSIDE the feedback's target file.
  for (const item of ctx.feedback) {
    for (const cls of HOTSPOT_CLASSES) {
      if (!cls.cue.test(item.text)) continue;
      const hitFiles = new Set<string>();
      for (const l of allAdded) {
        if (item.file && l.file !== item.file.replace(/^\.\//, "") && cls.re.test(l.text)) {
          hitFiles.add(l.file);
        }
      }
      if (hitFiles.size > 0) {
        out.push({
          rule: "R102",
          dim: "recurrence",
          severity: "warn",
          item: item.id,
          file: [...hitFiles].join(", "),
          message: `${item.id} flags a ${cls.name} hazard in ${item.file}, but new ${cls.name} occurrences were added in: ${[...hitFiles].join(", ")}`,
        });
        break; // one class per item
      }
    }
  }

  // R103 moved-not-removed: anchor removed AND added back within the same file.
  for (const item of ctx.feedback) {
    const { strong } = anchorsOf(item.text);
    if (strong.length === 0) continue;
    for (const f of ctx.diff.files) {
      const addedText = f.addedLines.map((l) => l.text).join("\n").toLowerCase();
      const removedText = f.removedLines.map((l) => l.text).join("\n").toLowerCase();
      const hit = strong.find((s) => containsToken(addedText, s) && containsToken(removedText, s));
      if (hit) {
        out.push({
          rule: "R103",
          dim: "recurrence",
          severity: "info",
          item: item.id,
          file: f.path,
          message: `${item.id}: \`${hit}\` was removed and re-added in ${f.path} — verify this is an intentional relocation, not a cosmetic shuffle`,
        });
        break;
      }
    }
  }

  return out;
}
