import { useEffect, useState } from "react";

interface Finding {
  rule: string;
  dim: string;
  severity: "error" | "warn" | "info";
  item?: string;
  file?: string;
  message: string;
}

interface ItemLedger {
  id: string;
  file: string;
  severity: string;
  hasClaim: boolean;
  claimStatus: string | null;
  diffEvidence: string;
  targetTouched: boolean;
  findings: string[];
}

interface DimScore {
  name: string;
  score: number;
  weight: number;
  findings: number;
}

interface AuditResult {
  score: number;
  grade: string;
  verdict: "pass" | "warn" | "fail";
  dims: DimScore[];
  findings: Finding[];
  items: ItemLedger[];
  caps: string[];
  counts: { error: number; warn: number; info: number };
}

const GRADE_COLOR: Record<string, string> = {
  A: "#1a7f37",
  B: "#3f7f1a",
  C: "#9a6700",
  D: "#bc4c00",
  F: "#cf222e",
};

function ScoreDial({ score, grade, verdict }: { score: number; grade: string; verdict: string }) {
  const r = 52;
  const circ = 2 * Math.PI * r;
  const filled = (Math.max(0, Math.min(100, score)) / 100) * circ;
  const color = GRADE_COLOR[grade] ?? "#57606a";
  return (
    <div className="dial-wrap">
      <svg width="130" height="130" viewBox="0 0 130 130">
        <circle cx="65" cy="65" r={r} fill="none" stroke="#e5e8ec" strokeWidth="10" />
        <circle
          cx="65"
          cy="65"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${circ - filled}`}
          transform="rotate(-90 65 65)"
        />
        <text x="65" y="62" textAnchor="middle" fontSize="30" fontWeight="700" fill={color}>
          {score.toFixed(0)}
        </text>
        <text x="65" y="84" textAnchor="middle" fontSize="13" fill="#57606a">
          grade {grade} · {verdict}
        </text>
      </svg>
    </div>
  );
}

export function App() {
  const [demos, setDemos] = useState<{ name: string; description: string }[]>([]);
  const [activeDemo, setActiveDemo] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  const [claims, setClaims] = useState("");
  const [diff, setDiff] = useState("");
  const [result, setResult] = useState<AuditResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/demos")
      .then((r) => r.json())
      .then((d) => setDemos(d.demos ?? []))
      .catch(() => setDemos([]));
  }, []);

  async function loadDemo(name: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/demo?name=${encodeURIComponent(name)}`);
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        const fb = await fetch(`/examples/${name}/feedback.json`).then((r) => r.text());
        const cl = await fetch(`/examples/${name}/claims.json`).then((r) => r.text());
        const dp = await fetch(`/examples/${name}/diff.patch`).then((r) => r.text());
        setFeedback(fb);
        setClaims(cl);
        setDiff(dp);
        setResult(data);
        setActiveDemo(name);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function runAudit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedback: JSON.parse(feedback), claims: JSON.parse(claims), diff }),
      });
      const data = await res.json();
      if (data.error) setError(data.error);
      else {
        setResult(data);
        setActiveDemo(null);
      }
    } catch (e) {
      setError("Invalid JSON in feedback or claims: " + String(e));
    } finally {
      setBusy(false);
    }
  }

  const sevBadge: Record<string, string> = { error: "badge err", warn: "badge warn", info: "badge info" };

  return (
    <div className="wrap">
      <header>
        <h1>
          Feedback<span className="accent">Proof</span>
        </h1>
        <p className="tagline">Did the agent really fix what you flagged? Reconcile fix claims against the actual diff.</p>
      </header>

      <section className="demos">
        <span className="demos-label">Calibration demos:</span>
        {demos.map((d) => (
          <button key={d.name} className={activeDemo === d.name ? "demo-btn active" : "demo-btn"} onClick={() => loadDemo(d.name)} title={d.description}>
            {d.name}
          </button>
        ))}
      </section>

      <section className="inputs">
        <div className="input-col">
          <label>feedback.json — what humans flagged</label>
          <textarea value={feedback} onChange={(e) => setFeedback(e.target.value)} rows={9} spellCheck={false} />
        </div>
        <div className="input-col">
          <label>claims.json — what the agent says it did</label>
          <textarea value={claims} onChange={(e) => setClaims(e.target.value)} rows={9} spellCheck={false} />
        </div>
        <div className="input-col">
          <label>diff.patch — what actually changed</label>
          <textarea value={diff} onChange={(e) => setDiff(e.target.value)} rows={9} spellCheck={false} className="mono" />
        </div>
      </section>

      <div className="actions">
        <button className="run" onClick={runAudit} disabled={busy}>
          {busy ? "Auditing…" : "Run audit"}
        </button>
        {error && <span className="error">{error}</span>}
      </div>

      {result && (
        <section className="result">
          <div className="result-top">
            <ScoreDial score={result.score} grade={result.grade} verdict={result.verdict} />
            <div className="dims">
              {result.dims.map((d) => (
                <div key={d.name} className="dim-row">
                  <span className="dim-name">{d.name}</span>
                  <div className="dim-bar">
                    <div className="dim-fill" style={{ width: `${d.score}%`, background: GRADE_COLOR[d.score >= 90 ? "A" : d.score >= 80 ? "B" : d.score >= 70 ? "C" : d.score >= 60 ? "D" : "F"] }} />
                  </div>
                  <span className="dim-score">{d.score.toFixed(1)}</span>
                </div>
              ))}
              <div className="counts">
                {result.counts.error} errors · {result.counts.warn} warnings · {result.counts.info} info
              </div>
            </div>
          </div>

          {result.caps.length > 0 && (
            <div className="caps">
              {result.caps.map((c, i) => (
                <div key={i}>⛔ {c}</div>
              ))}
            </div>
          )}

          <h3>Item ledger</h3>
          <table className="ledger">
            <thead>
              <tr>
                <th>id</th>
                <th>sev</th>
                <th>file</th>
                <th>claim</th>
                <th>diff evidence</th>
                <th>flags</th>
              </tr>
            </thead>
            <tbody>
              {result.items.map((it) => (
                <tr key={it.id}>
                  <td>{it.id}</td>
                  <td>{it.severity}</td>
                  <td className="mono">{it.file}</td>
                  <td>{it.claimStatus ?? (it.hasClaim ? "?" : "no claim")}</td>
                  <td>
                    <span className={`zone ${it.diffEvidence}`}>{it.diffEvidence}</span>
                  </td>
                  <td>{it.findings.length > 0 ? it.findings.join(", ") : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3>Findings</h3>
          {result.findings.length === 0 && <p className="ok">No findings. Every claim is backed by diff evidence.</p>}
          <ul className="findings">
            {[...result.findings]
              .sort((a, b) => (a.severity === "error" ? -1 : b.severity === "error" ? 1 : a.severity === "warn" ? -1 : 1))
              .map((f, i) => (
                <li key={i}>
                  <span className={sevBadge[f.severity]}>{f.severity}</span>
                  <span className="rule">{f.rule}</span>
                  <span className="dim-tag">{f.dim}</span>
                  <span className="msg">
                    {f.item ? <b>{f.item} </b> : null}
                    {f.message}
                  </span>
                </li>
              ))}
          </ul>
        </section>
      )}

      <footer>
        FeedbackProof · deterministic feedback-loop reconciliation · zero runtime dependencies
      </footer>
    </div>
  );
}
