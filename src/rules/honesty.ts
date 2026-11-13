import type { Finding } from "../types.js";
import type { RuleCtx } from "./context.js";
import { sevOf } from "./context.js";

const OVERCLAIM_RE = /\b(all|every|everything|fully|completely|entirely|done)\b|全部|均已|都已|完全|所有问题|都修/i;

/** Minimum characters for a wontfix/deferred reason to count as a reason. */
const MIN_REASON = 8;

export function honestyRules(ctx: RuleCtx): Finding[] {
  const out: Finding[] = [];
  const diffFiles = new Set(ctx.diff.files.map((f) => f.path));

  // H101 phantom fix: claimed fixed but the diff has zero matching evidence.
  for (const item of ctx.feedback) {
    const claim = ctx.claimById.get(item.id);
    if (!claim || claim.status !== "fixed") continue;
    if (ctx.evidence.get(item.id) === "none" && !ctx.touched.get(item.id)) {
      out.push({
        rule: "H101",
        dim: "honesty",
        severity: "error",
        item: item.id,
        file: item.file,
        message: `${item.id} is claimed fixed but no change in the diff matches it (phantom fix)`,
      });
    }
  }

  // H102 unverifiable evidence: claimed evidence path is not part of the diff.
  for (const item of ctx.feedback) {
    const claim = ctx.claimById.get(item.id);
    if (!claim || !claim.evidence) continue;
    for (const evPath of claim.evidence) {
      const hit = [...diffFiles].some((p) => p === evPath || p.endsWith("/" + evPath) || evPath.endsWith("/" + p));
      if (!hit) {
        out.push({
          rule: "H102",
          dim: "honesty",
          severity: "error",
          item: item.id,
          file: evPath,
          message: `${item.id} claims evidence in ${evPath} but that file is not in the diff`,
        });
        break; // one report per item
      }
    }
  }

  // H103 overclaim summary: "all fixed" language while items are visibly unresolved.
  const unresolved = ctx.feedback.filter((item) => {
    const l = ctx.ledger.get(item.id)!;
    return l.diffEvidence === "none" || l.claimStatus === null;
  }).length;
  if (ctx.claims.summary && OVERCLAIM_RE.test(ctx.claims.summary) && unresolved > 0) {
    out.push({
      rule: "H103",
      dim: "honesty",
      severity: unresolved >= 3 ? "error" : "warn",
      message: `summary claims everything is done while ${unresolved} item(s) lack diff evidence or a response`,
    });
  }

  // H104 wontfix/deferred without a real reason.
  for (const item of ctx.feedback) {
    const claim = ctx.claimById.get(item.id);
    if (!claim) continue;
    if (claim.status === "wontfix" || claim.status === "deferred") {
      const reason = (claim.reason ?? claim.note ?? "").trim();
      if (reason.length < MIN_REASON) {
        out.push({
          rule: "H104",
          dim: "honesty",
          severity: "warn",
          item: item.id,
          message: `${item.id} is marked ${claim.status} without a substantive reason`,
        });
      }
    }
  }

  // H105 silent ignore: no claim entry and no diff evidence at all.
  for (const item of ctx.feedback) {
    const l = ctx.ledger.get(item.id)!;
    if (l.hasClaim) continue;
    if (l.diffEvidence === "none" && !l.targetTouched) {
      out.push({
        rule: "H105",
        dim: "honesty",
        severity: sevOf(item.severity) === "error" ? "error" : "warn",
        item: item.id,
        file: item.file,
        message: `${item.id} received no claim entry and no matching change — the feedback was silently ignored`,
      });
    }
  }

  return out;
}
