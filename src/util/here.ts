import { fileURLToPath } from "node:url";
import path from "node:path";

/** Absolute dir of the module calling this (works from src/ and dist/). */
export function here(...parts: string[]): string {
  return path.join(path.dirname(fileURLToPath(import.meta.url)), ...parts);
}

/** Project root: dist/util/here.js -> up 2, src/util/here.ts -> up 2. */
export function pkgRoot(): string {
  return path.resolve(here(), "..", "..");
}
