import type { Finding } from "../types.js";
import type { RuleCtx } from "./context.js";

/** G101 silent fix: diff evidence exists but the agent never claimed the item. */
function silentFix(ctx: RuleCtx): Finding[] {
  const out: Finding[] = [];
  for (const item of ctx.feedback) {
    const l = ctx.ledger.get(item.id)!;
    if (!l.hasClaim && (l.diffEvidence !== "none" || l.targetTouched)) {
      out.push({
        rule: "G101",
        dim: "hygiene",
        severity: "info",
        item: item.id,
        message: `${item.id} appears addressed in the diff but has no claim entry — intent is unverifiable`,
      });
    }
  }
  return out;
}

/** G102 no pointer: claim says fixed but provides zero evidence references. */
function noPointer(ctx: RuleCtx): Finding[] {
  const out: Finding[] = [];
  for (const item of ctx.feedback) {
    const claim = ctx.claimById.get(item.id);
    if (!claim || claim.status !== "fixed") continue;
    if (!claim.evidence || claim.evidence.length === 0) {
      out.push({
        rule: "G102",
        dim: "hygiene",
        severity: "warn",
        item: item.id,
        message: `${item.id} is claimed fixed without any evidence pointer (file/commit/test) to verify against`,
      });
    }
  }
  return out;
}

/** G103 orphan claim: claim references a feedback id that does not exist. */
function orphanClaim(ctx: RuleCtx): Finding[] {
  const out: Finding[] = [];
  const ids = new Set(ctx.feedback.map((i) => i.id));
  for (const c of ctx.claims.items) {
    if (!ids.has(c.id)) {
      out.push({
        rule: "G103",
        dim: "hygiene",
        severity: "error",
        item: c.id,
        message: `claim references ${c.id} but no feedback item carries that id (ledger mismatch)`,
      });
    }
  }
  return out;
}

/** G104 duplicate claim entries for the same feedback id. */
function duplicateClaim(ctx: RuleCtx): Finding[] {
  const out: Finding[] = [];
  const seen = new Map<string, number>();
  for (const c of ctx.claims.items) {
    const n = (seen.get(c.id) ?? 0) + 1;
    seen.set(c.id, n);
    if (n === 2) {
      out.push({
        rule: "G104",
        dim: "hygiene",
        severity: "warn",
        item: c.id,
        message: `${c.id} has multiple claim entries — resolution status is ambiguous`,
      });
    }
  }
  return out;
}

export function hygieneRules(ctx: RuleCtx): Finding[] {
  return [...silentFix(ctx), ...noPointer(ctx), ...orphanClaim(ctx), ...duplicateClaim(ctx)];
}
