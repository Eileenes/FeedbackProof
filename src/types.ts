export type Severity = "blocker" | "major" | "minor";
export type Dim = "coverage" | "honesty" | "targeting" | "recurrence" | "hygiene";
export type FindingSeverity = "error" | "warn" | "info";
export type EvidenceZone = "targeted" | "elsewhere" | "none";
export type ClaimStatus = "fixed" | "wontfix" | "deferred" | "partial";

export interface FeedbackItem {
  id: string;
  file: string;
  line?: number;
  text: string;
  severity: Severity;
}

export interface ClaimEntry {
  id: string;
  status: ClaimStatus;
  note?: string;
  reason?: string;
  evidence?: string[];
}

export interface ClaimDoc {
  summary?: string;
  items: ClaimEntry[];
}

export interface DiffLine {
  text: string;
  newLine?: number;
}

export interface DiffHunk {
  oldStart: number;
  newStart: number;
  newCount: number;
  added: DiffLine[];
  removed: DiffLine[];
}

export interface DiffFile {
  path: string;
  hunks: DiffHunk[];
  addedLines: DiffLine[];
  removedLines: DiffLine[];
}

export interface ParsedDiff {
  files: DiffFile[];
}

export interface Finding {
  rule: string;
  dim: Dim;
  severity: FindingSeverity;
  item?: string;
  file?: string;
  message: string;
}

export interface ItemLedger {
  id: string;
  file: string;
  severity: Severity;
  hasClaim: boolean;
  claimStatus: ClaimStatus | null;
  claimEvidence: string[];
  diffEvidence: EvidenceZone;
  targetTouched: boolean;
  findings: string[];
}

export interface DimScore {
  name: Dim;
  score: number;
  weight: number;
  findings: number;
}

export interface AuditResult {
  score: number;
  grade: string;
  verdict: "pass" | "warn" | "fail";
  dims: DimScore[];
  findings: Finding[];
  items: ItemLedger[];
  caps: string[];
  counts: { error: number; warn: number; info: number };
}
