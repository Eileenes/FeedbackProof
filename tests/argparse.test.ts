import { describe, it, expect } from "vitest";
import { parseArgs } from "../src/argparse.js";

describe("CLI argument parsing", () => {
  it("separates command and flags", () => {
    const { cmd, flags } = parseArgs(["audit", "--format", "json", "--fail-on", "warn"]);
    expect(cmd).toBe("audit");
    expect(flags.format).toBe("json");
    expect(flags["fail-on"]).toBe("warn");
  });

  it("does not leak flag values into positionals", () => {
    const { cmd, rest } = parseArgs(["demo", "sloppy-loop", "--format", "json"]);
    expect(cmd).toBe("demo");
    expect(rest).toEqual(["sloppy-loop"]);
  });

  it("treats unknown commands as unknown", () => {
    expect(parseArgs(["bogus"]).cmd).toBe("unknown");
  });

  it("defaults to help with no args", () => {
    expect(parseArgs([]).cmd).toBe("help");
  });

  it("supports boolean flags", () => {
    expect(parseArgs(["serve", "--verbose"]).flags.verbose).toBe(true);
  });
});
