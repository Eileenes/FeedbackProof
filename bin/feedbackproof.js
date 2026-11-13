#!/usr/bin/env node
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const cliPath = path.join(here, "..", "dist", "cli.js");

try {
  createRequire(import.meta.url).resolve(cliPath);
} catch {
  console.error("FeedbackProof is not built. Run: npm install && npm run build");
  process.exit(1);
}

await import(pathToFileURL(cliPath).href);
