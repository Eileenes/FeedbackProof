import type { AuditResult, Dim, DimScore, Finding, ItemLedger } from "./types.js";
import type { FeedbackItem, ClaimDoc, ParsedDiff } from "./types.js";
import { buildLedger, type RuleCtx } from "./rules/context.js";
import { coverageRules } from "./rules/coverage.js";
import { honestyRules } from "./rules/honesty.js";
import { targetingRules } from "./rules/targeting.js";
import { recurrenceRules } from "./rules/recurrence.js";
import { hygieneRules } from "./rules/hygiene.js";

/** Penalty points per rule (first occurrence; repeats count 35%). */
export const PENALTIES: Record<string, number> = {
  C101: 20,
  C102: 8,
  C103: 6,
  C104: 16,
  H101: 24,
  H102: 12,
  H103: 12,
  H104: 5,
  H105: 14,
  T101: 6,
  T102: 4,
  R101: 18,
  R102: 8,
  R103: 3,
  G101: 4,
  G102: 5,
  G103: 10,
  G104: 4,
};

export const DIM_WEIGHTS: Record<Dim, number> = {
  coverage: 0.28,
  honesty: 0.26,
  targeting: 0.16,
  recurrence: 0.16,
  hygiene: 0.14,
};

const DIM_NAMES: Dim[] = ["coverage", "honesty", "targeting", "recurrence", "hygiene"];

/** H103 severity: warn when 1-2 unresolved, error when >=3. Adjusted in honesty.ts. */

export interface AuditInput {
  feedback: FeedbackItem[];
  claims: ClaimDoc;
  diff: ParsedDiff;
}

export type { AuditResult };

export function audit(input: AuditInput): AuditResult {
  const base: Omit<RuleCtx, "evidence" | "touched" | "ledger" | "claimById"> = {
    feedback: input.feedback,
    claims: input.claims,
    diff: input.diff,
  };
  const maps = buildLedger(base);
  const ctx: RuleCtx = { ...base, ...maps };

  const groups: Finding[][] = [
    coverageRules(ctx),
    honestyRules(ctx),
    targetingRules(ctx),
    recurrenceRules(ctx),
    hygieneRules(ctx),
  ];
  const findings: Finding[] = groups.flat();

  // Attach rule ids to the item ledger.
  for (const f of findings) {
    if (f.item) {
      const l = ctx.ledger.get(f.item);
      if (l && !l.findings.includes(f.rule)) l.findings.push(f.rule);
    }
  }

  const counts = {
    error: findings.filter((f) => f.severity === "error").length,
    warn: findings.filter((f) => f.severity === "warn").length,
    info: findings.filter((f) => f.severity === "info").length,
  };

  // Per-dimension decayed penalty sums.
  const dimPenalty = new Map<Dim, number>();
  const ruleCount = new Map<string, number>();
  for (const f of findings) {
    const n = ruleCount.get(f.rule) ?? 0;
    ruleCount.set(f.rule, n + 1);
    const basePenalty = PENALTIES[f.rule] ?? 6;
    const penalty = n === 0 ? basePenalty : basePenalty * Math.pow(0.35, n);
    dimPenalty.set(f.dim, (dimPenalty.get(f.dim) ?? 0) + penalty);
  }

  const dims: DimScore[] = DIM_NAMES.map((name) => {
    const raw = 100 - (dimPenalty.get(name) ?? 0);
    return {
      name,
      score: Math.max(0, Math.round(raw * 10) / 10),
      weight: DIM_WEIGHTS[name],
      findings: findings.filter((f) => f.dim === name).length,
    };
  });

  let score = dims.reduce((acc, d) => acc + d.score * d.weight, 0);

  // Hard caps: a single unforgivable signal should pin the ceiling.
  const caps: string[] = [];
  const has = (rule: string) => findings.some((f) => f.rule === rule);
  const blockerC101 = findings.some((f) => f.rule === "C101" && f.severity === "error");
  if (has("H101")) {
    caps.push("H101 phantom fix present -> cap 58");
    score = Math.min(score, 58);
  }
  if (has("R101")) {
    caps.push("R101 reintroduced pattern -> cap 68");
    score = Math.min(score, 68);
  }
  if (blockerC101) {
    caps.push("blocker-level C101 unaddressed -> cap 62");
    score = Math.min(score, 62);
  }
  if (counts.error >= 12) {
    caps.push(">=12 errors -> cap 40");
    score = Math.min(score, 40);
  } else if (counts.error >= 8) {
    caps.push(">=8 errors -> cap 52");
    score = Math.min(score, 52);
  } else if (counts.error >= 4) {
    caps.push(">=4 errors -> cap 65");
    score = Math.min(score, 65);
  }

  score = Math.max(0, Math.round(score * 10) / 10);
  const grade = score >= 90 ? "A" : score >= 80 ? "B" : score >= 70 ? "C" : score >= 60 ? "D" : "F";
  const verdict: AuditResult["verdict"] = counts.error > 0 || score < 60 ? "fail" : counts.warn > 0 ? "warn" : "pass";

  const items: ItemLedger[] = input.feedback.map((i) => ctx.ledger.get(i.id)!);

  return { score, grade, verdict, dims, findings, items, caps, counts };
}
