import { describe, expect, it } from "vitest";

import { buildToolResultMessage } from "../../src/context/message-builder";

describe("buildToolResultMessage", () => {
  it("drops oversized raw output before building model-visible tool_result", () => {
    const message = buildToolResultMessage({
      toolName: "run_shell",
      status: "completed",
      modelVisibleOutput: "head\n...\ntail",
      rawOutput: "x".repeat(20_000),
      truncation: {
        truncated: true,
        totalChars: 20_000,
        returnedChars: 14,
      },
    });

    expect(JSON.stringify(message)).not.toContain("x".repeat(1000));
    expect(message.content).toContain("head");
  });
});
