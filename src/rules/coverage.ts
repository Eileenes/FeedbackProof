import type { Finding } from "../types.js";
import type { RuleCtx } from "./context.js";
import { sevOf } from "./context.js";

/**
 * Coverage: does the follow-up diff actually touch what each feedback item
 * pointed at, and does the change contain recognizable evidence?
 */
export function coverageRules(ctx: RuleCtx): Finding[] {
  const out: Finding[] = [];

  // C101 unaddressed: no evidence anywhere AND target file untouched.
  for (const item of ctx.feedback) {
    const zone = ctx.evidence.get(item.id)!;
    const touched = ctx.touched.get(item.id)!;
    if (zone === "none" && !touched) {
      out.push({
        rule: "C101",
        dim: "coverage",
        severity: sevOf(item.severity),
        item: item.id,
        file: item.file,
        message: `${item.id} (${item.severity}) has no matching change anywhere in the diff and its target file ${item.file} was not touched`,
      });
    }
  }

  // C102 elsewhere-only: evidence exists but not in the target file.
  for (const item of ctx.feedback) {
    if (ctx.evidence.get(item.id) !== "elsewhere") continue;
    out.push({
      rule: "C102",
      dim: "coverage",
      severity: "warn",
      item: item.id,
      file: item.file,
      message: `${item.id} matched changes only outside its target file ${item.file} — verify the fix actually landed where the feedback pointed`,
    });
  }

  // C103 target untouched but evidence elsewhere: the pointed-at file was never modified.
  for (const item of ctx.feedback) {
    const touched = ctx.touched.get(item.id)!;
    if (!touched && ctx.evidence.get(item.id) === "elsewhere") {
      out.push({
        rule: "C103",
        dim: "coverage",
        severity: "warn",
        item: item.id,
        file: item.file,
        message: `${item.id} targets ${item.file} but that file has zero hunks in the diff`,
      });
    }
  }

  // C104 target touched but nothing recognizable addresses the item.
  for (const item of ctx.feedback) {
    const touched = ctx.touched.get(item.id)!;
    if (touched && ctx.evidence.get(item.id) === "none") {
      out.push({
        rule: "C104",
        dim: "coverage",
        severity: sevOf(item.severity),
        item: item.id,
        file: item.file,
        message: `${item.file} was changed but no line in the diff matches ${item.id} — the item was skipped while nearby code moved`,
      });
    }
  }

  return out;
}
