#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { audit } from "./engine.js";
import { renderJson, renderText } from "./report.js";
import { loadFeedback, loadClaims, loadDiff, LoadError } from "./load.js";
import { startServer, loadDemo, listDemos, SERVER_META } from "./server.js";
import { parseArgs, type Flags } from "./argparse.js";

const USAGE = `FeedbackProof v${SERVER_META.VERSION} — reconcile AI-agent fix claims against the actual diff

Usage:
  feedbackproof audit --feedback <feedback.json> --claims <claims.json> --diff <diff.patch> [--format text|json] [--fail-on error|warn|never]
  feedbackproof demo [clean-loop|sloppy-loop|phantom-loop] [--format text|json]
  feedbackproof serve [--port N] [--host H]
  feedbackproof help | version
`;

function readInputFile(p: string | undefined, what: string): string {
  if (!p) throw new LoadError(`missing --${what} <file>`);
  const full = path.resolve(p);
  if (!fs.existsSync(full)) throw new LoadError(`file not found: ${full}`);
  return fs.readFileSync(full, "utf8");
}

async function main(): Promise<number> {
  const { cmd, flags, rest } = parseArgs(process.argv.slice(2));

  if (cmd === "version") {
    console.log(SERVER_META.VERSION);
    return 0;
  }
  if (cmd === "help" || cmd === "unknown") {
    if (cmd === "unknown") console.error(`unknown command: ${rest.join(" ")}`);
    console.log(USAGE);
    return cmd === "unknown" ? 1 : 0;
  }

  if (cmd === "serve") {
    const handle = await startServer({
      port: flags.port !== undefined ? Number(flags.port) : undefined,
      host: typeof flags.host === "string" ? flags.host : undefined,
    });
    console.log(`${SERVER_META.NAME} v${SERVER_META.VERSION} listening on http://${typeof flags.host === "string" ? flags.host : process.env.HOST ?? "127.0.0.1"}:${handle.port}`);
    console.log("Console: /   API: /api/health /api/audit /api/demos /api/demo?name=...");
    process.on("SIGINT", () => {
      handle.close();
      process.exit(0);
    });
    return 0;
  }

  const format = flags.format === "json" ? "json" : "text";
  const failOn = typeof flags["fail-on"] === "string" ? (flags["fail-on"] as string) : "error";
  if (!["error", "warn", "never"].includes(failOn)) {
    console.error(`invalid --fail-on value: ${failOn} (expected error|warn|never)`);
    return 2;
  }

  let feedbackRaw: string;
  let claimsRaw: string;
  let diffRaw: string;

  if (cmd === "demo") {
    const name = rest[0] ?? "clean-loop";
    try {
      const d = loadDemo(name);
      feedbackRaw = d.feedback;
      claimsRaw = d.claims;
      diffRaw = d.diff;
    } catch (e) {
      console.error(e instanceof Error ? e.message : String(e));
      console.error(`available demos: ${listDemos().map((x) => x.name).join(", ")}`);
      return 2;
    }
  } else {
    try {
      feedbackRaw = readInputFile(typeof flags.feedback === "string" ? flags.feedback : undefined, "feedback");
      claimsRaw = readInputFile(typeof flags.claims === "string" ? flags.claims : undefined, "claims");
      diffRaw = readInputFile(typeof flags.diff === "string" ? flags.diff : undefined, "diff");
    } catch (e) {
      console.error(e instanceof Error ? e.message : String(e));
      return 2;
    }
  }

  let result;
  try {
    result = audit({
      feedback: loadFeedback(JSON.parse(feedbackRaw)),
      claims: loadClaims(JSON.parse(claimsRaw)),
      diff: loadDiff(diffRaw),
    });
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    return 2;
  }

  console.log(format === "json" ? renderJson(result) : renderText(result));

  if (failOn === "never") return 0;
  if (failOn === "warn" && (result.counts.error > 0 || result.counts.warn > 0)) return 1;
  if (failOn === "error" && result.counts.error > 0) return 1;
  return 0;
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
