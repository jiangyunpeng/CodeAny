import { describe, expect, it } from "vitest";

import { parseCliCommand } from "../../src/cli/commands";

describe("parseCliCommand", () => {
  it("parses /help as a built-in command", () => {
    expect(parseCliCommand("/help")).toEqual({
      kind: "command",
      name: "help",
      args: [],
    });
  });
});
