import type { Finding } from "../types.js";
import type { RuleCtx } from "./context.js";
import { findFile } from "../util/text.js";

const NEAR_HUNK_LINES = 50;
const MAX_CREEP = 5;

/** Extract path-ish tokens mentioned in claim notes (for scope-creep whitelist). */
function notePaths(ctx: RuleCtx): Set<string> {
  const out = new Set<string>();
  for (const c of ctx.claims.items) {
    for (const p of c.evidence ?? []) out.add(p);
    if (c.note) {
      for (const m of c.note.matchAll(/[\w@./-]+\.(?:ts|tsx|js|jsx|mjs|py|go|rs|json|ya?ml|md|css|html|sh|sql)\b/gi)) {
        out.add(m[0].replace(/^\.\//, ""));
      }
    }
  }
  return out;
}

export function targetingRules(ctx: RuleCtx): Finding[] {
  const out: Finding[] = [];

  // T101 fix far from feedback location.
  for (const item of ctx.feedback) {
    if (item.line === undefined || ctx.evidence.get(item.id) !== "targeted") continue;
    const file = findFile(ctx.diff, item.file);
    if (!file) continue;
    let nearest = Infinity;
    for (const h of file.hunks) {
      const start = h.newStart;
      const end = h.newStart + Math.max(h.newCount, h.added.length + 1);
      if (item.line >= start - 1 && item.line <= end + 1) {
        nearest = 0;
        break;
      }
      nearest = Math.min(nearest, Math.min(Math.abs(start - item.line), Math.abs(end - item.line)));
    }
    if (nearest > NEAR_HUNK_LINES) {
      out.push({
        rule: "T101",
        dim: "targeting",
        severity: "warn",
        item: item.id,
        file: item.file,
        message: `${item.id} pointed at ${item.file}:${item.line} but the nearest hunk is ${nearest} lines away`,
      });
    }
  }

  // T102 scope creep: changed files no feedback or claim ever mentioned.
  const referenced = new Set<string>(ctx.feedback.map((i) => i.file.replace(/^\.\//, "")));
  for (const p of notePaths(ctx)) referenced.add(p.replace(/^\.\//, ""));
  let creep = 0;
  for (const f of ctx.diff.files) {
    const norm = f.path.replace(/^\.\//, "");
    if ([...referenced].some((r) => r === norm || norm.endsWith("/" + r) || r.endsWith("/" + norm))) continue;
    if (creep >= MAX_CREEP) break;
    creep += 1;
    out.push({
      rule: "T102",
      dim: "targeting",
      severity: "warn",
      file: f.path,
      message: `${f.path} was changed but no feedback item or claim mentions it (unrequested change)`,
    });
  }

  return out;
}
