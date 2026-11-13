import type { FeedbackItem, ClaimDoc, Severity, ClaimStatus, ParsedDiff } from "./types.js";
import { parseDiff } from "./util/text.js";

export class LoadError extends Error {}

function asObject(v: unknown, what: string): Record<string, unknown> {
  if (v === null || typeof v !== "object" || Array.isArray(v)) {
    throw new LoadError(`${what} must be a JSON object`);
  }
  return v as Record<string, unknown>;
}

function asString(v: unknown, what: string): string {
  if (typeof v !== "string" || v.trim() === "") throw new LoadError(`${what} must be a non-empty string`);
  return v.trim();
}

const SEVERITIES: Severity[] = ["blocker", "major", "minor"];
const STATUSES: ClaimStatus[] = ["fixed", "wontfix", "deferred", "partial"];

export function loadFeedback(v: unknown): FeedbackItem[] {
  if (!Array.isArray(v)) throw new LoadError("feedback must be a JSON array");
  const out: FeedbackItem[] = [];
  const seen = new Set<string>();
  for (const raw of v) {
    const o = asObject(raw, "feedback entry");
    const id = asString(o.id, "feedback.id");
    if (seen.has(id)) throw new LoadError(`duplicate feedback id: ${id}`);
    seen.add(id);
    const severity = asString(o.severity ?? "major", "feedback.severity") as Severity;
    if (!SEVERITIES.includes(severity)) throw new LoadError(`feedback ${id}: severity must be blocker|major|minor`);
    const item: FeedbackItem = {
      id,
      file: asString(o.file, "feedback.file").replace(/^\.\//, ""),
      text: asString(o.text, "feedback.text"),
      severity,
    };
    if (o.line !== undefined && o.line !== null) {
      const n = Number(o.line);
      if (!Number.isFinite(n) || n < 0) throw new LoadError(`feedback ${id}: line must be a non-negative number`);
      item.line = n;
    }
    out.push(item);
  }
  if (out.length === 0) throw new LoadError("feedback must contain at least one item");
  return out;
}

export function loadClaims(v: unknown): ClaimDoc {
  const o = asObject(v, "claims");
  const itemsRaw = o.items;
  if (!Array.isArray(itemsRaw)) throw new LoadError("claims.items must be a JSON array");
  const items: ClaimDoc["items"] = [];
  for (const raw of itemsRaw) {
    const c = asObject(raw, "claim entry");
    const id = asString(c.id, "claim.id");
    const status = asString(c.status, "claim.status") as ClaimStatus;
    if (!STATUSES.includes(status)) throw new LoadError(`claim ${id}: status must be fixed|wontfix|deferred|partial`);
    const entry: ClaimDoc["items"][number] = { id, status };
    if (typeof c.note === "string") entry.note = c.note;
    if (typeof c.reason === "string") entry.reason = c.reason;
    if (c.evidence !== undefined && c.evidence !== null) {
      if (!Array.isArray(c.evidence)) throw new LoadError(`claim ${id}: evidence must be an array of paths`);
      entry.evidence = c.evidence.map((e) => String(e).replace(/^\.\//, ""));
    }
    items.push(entry);
  }
  const doc: ClaimDoc = { items };
  if (typeof o.summary === "string") doc.summary = o.summary;
  return doc;
}

export function loadDiff(raw: string): ParsedDiff {
  if (typeof raw !== "string" || raw.trim() === "") throw new LoadError("diff must be a non-empty unified diff string");
  const parsed = parseDiff(raw);
  if (parsed.files.length === 0) throw new LoadError("diff contains no files (expected unified diff format)");
  return parsed;
}
