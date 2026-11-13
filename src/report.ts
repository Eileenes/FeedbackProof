import type { AuditResult } from "./engine.js";

export function renderText(r: AuditResult): string {
  const lines: string[] = [];
  lines.push("FeedbackProof — feedback-loop audit");
  lines.push("");
  lines.push(`Score: ${r.score.toFixed(1)}  Grade: ${r.grade}  Verdict: ${r.verdict.toUpperCase()}`);
  lines.push(
    `Findings: ${r.counts.error} error / ${r.counts.warn} warn / ${r.counts.info} info`
  );
  if (r.caps.length > 0) {
    lines.push("Caps applied:");
    for (const c of r.caps) lines.push(`  - ${c}`);
  }
  lines.push("");
  lines.push("Dimensions:");
  for (const d of r.dims) {
    lines.push(`  ${d.name.padEnd(11)} ${String(d.score).padStart(6)}  (w=${d.weight}, findings=${d.findings})`);
  }
  lines.push("");
  lines.push("Item ledger:");
  for (const i of r.items) {
    const status = i.claimStatus ?? (i.hasClaim ? "?" : "no-claim");
    lines.push(
      `  ${i.id.padEnd(5)} ${i.severity.padEnd(8)} ${i.file}  claim=${status}  evidence=${i.diffEvidence}${i.findings.length ? "  [" + i.findings.join(",") + "]" : ""}`
    );
  }
  if (r.findings.length > 0) {
    lines.push("");
    lines.push("Findings:");
    const order: Record<string, number> = { error: 0, warn: 1, info: 2 };
    const sorted = [...r.findings].sort((a, b) => (order[a.severity] ?? 3) - (order[b.severity] ?? 3));
    for (const f of sorted) {
      lines.push(`  [${f.severity.toUpperCase()}] ${f.rule} ${f.dim}${f.item ? " " + f.item : ""}${f.file ? " " + f.file : ""}: ${f.message}`);
    }
  }
  return lines.join("\n");
}

export function renderJson(r: AuditResult): string {
  return JSON.stringify(r, null, 2);
}
