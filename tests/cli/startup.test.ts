import { describe, expect, it } from "vitest";

import { handleStartupFlags } from "../../src/cli/startup";

describe("handleStartupFlags", () => {
  it("returns help text for --help", () => {
    const result = handleStartupFlags(["--help"], "0.1.0");
    expect(result).toMatchObject({
      kind: "exit",
    });
    if (result.kind === "exit") {
      expect(result.output).toContain("Usage:");
      expect(result.output).toContain("code-any 0.1.0");
    }
  });

  it("returns version for --version", () => {
    const result = handleStartupFlags(["--version"], "0.1.0");
    expect(result).toEqual({
      kind: "exit",
      output: "0.1.0",
    });
  });
});
