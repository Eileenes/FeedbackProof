import type { FeedbackItem, ClaimDoc, ParsedDiff, Finding, ItemLedger, EvidenceZone, Severity, Dim } from "../types.js";
import { anchorsOf, containsToken, findFile, diffFilePaths } from "../util/text.js";

export interface RuleCtx {
  feedback: FeedbackItem[];
  claims: ClaimDoc;
  diff: ParsedDiff;
  /** Per-item evidence zone, computed once and shared. */
  evidence: Map<string, EvidenceZone>;
  /** Per-item target-touched flag (target file has at least one hunk). */
  touched: Map<string, boolean>;
  ledger: Map<string, ItemLedger>;
  claimById: Map<string, ClaimDoc["items"][number]>;
}

export type RuleFn = (ctx: RuleCtx) => Finding[];

export function buildLedger(ctx: Omit<RuleCtx, "evidence" | "touched" | "ledger" | "claimById">): {
  evidence: Map<string, EvidenceZone>;
  touched: Map<string, boolean>;
  ledger: Map<string, ItemLedger>;
  claimById: Map<string, ClaimDoc["items"][number]>;
} {
  const claimById = new Map<string, ClaimDoc["items"][number]>();
  for (const c of ctx.claims.items) claimById.set(c.id, c);

  const evidence = new Map<string, EvidenceZone>();
  const touched = new Map<string, boolean>();
  const ledger = new Map<string, ItemLedger>();

  for (const item of ctx.feedback) {
    const anchors = anchorsOf(item.text);
    const target = findFile(ctx.diff, item.file);
    const targetTouched = !!target && target.hunks.length > 0;

    let zone: EvidenceZone = "none";
    if (targetTouched && matchesFile(target!, anchors)) {
      zone = "targeted";
    } else {
      for (const f of ctx.diff.files) {
        if (target && f.path === target.path) continue;
        if (matchesFile(f, anchors)) {
          zone = "elsewhere";
          break;
        }
      }
    }

    evidence.set(item.id, zone);
    touched.set(item.id, targetTouched);

    const claim = claimById.get(item.id);
    ledger.set(item.id, {
      id: item.id,
      file: item.file,
      severity: item.severity,
      hasClaim: !!claim,
      claimStatus: claim ? claim.status : null,
      claimEvidence: claim?.evidence ?? [],
      diffEvidence: zone,
      targetTouched,
      findings: [],
    });
  }
  return { evidence, touched, ledger, claimById };
}

/** Does this file's diff lines match the anchors (strong token, or >=2 weak words)? */
function matchesFile(file: { addedLines: { text: string }[]; removedLines: { text: string }[] }, anchors: { strong: string[]; weak: string[] }): boolean {
  const all = [...file.addedLines, ...file.removedLines].map((l) => l.text).join("\n");
  const lower = all.toLowerCase();
  for (const s of anchors.strong) {
    if (containsToken(lower, s)) return true;
  }
  let weakHits = 0;
  for (const w of anchors.weak) {
    if (lower.includes(w)) weakHits += 1;
    if (weakHits >= 2) return true;
  }
  return false;
}

export function sevOf(s: Severity): Finding["severity"] {
  return s === "blocker" ? "error" : s === "major" ? "warn" : "info";
}

export function diffPathsSet(ctx: RuleCtx): Set<string> {
  return new Set(diffFilePaths(ctx.diff));
}
