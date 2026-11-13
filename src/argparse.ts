export interface Flags {
  [k: string]: string | boolean;
}

export interface ParsedArgs {
  cmd: string;
  flags: Flags;
  rest: string[];
}

const COMMANDS = ["audit", "demo", "serve", "help", "version"];
const FLAG_WITH_VALUE = new Set(["--format", "--fail-on", "--port", "--host", "--feedback", "--claims", "--diff", "--name"]);

/**
 * Parse CLI arguments. Flag values are consumed so they never leak into
 * positionals (the classic `--port 8790` bug), and the first non-flag token
 * must be a known command or the result is `unknown`.
 */
export function parseArgs(argv: string[]): ParsedArgs {
  const flags: Flags = {};
  const rest: string[] = [];
  const consumed = new Set<number>();

  for (let i = 0; i < argv.length; i++) {
    if (consumed.has(i)) continue;
    const a = argv[i]!;
    if (FLAG_WITH_VALUE.has(a) && i + 1 < argv.length) {
      flags[a.slice(2)] = argv[i + 1]!;
      consumed.add(i + 1);
      i += 1;
    } else if (a.startsWith("--")) {
      flags[a.slice(2)] = true;
    } else {
      rest.push(a);
    }
  }

  const first = rest[0];
  const cmd = first === undefined ? "help" : COMMANDS.includes(first) ? first : "unknown";
  return { cmd, flags, rest: cmd === "unknown" ? rest : rest.slice(1) };
}
