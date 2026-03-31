import { describe, expect, it } from "vitest";

import { runReplScript } from "../../src/cli/repl";
import { ContextBudgetManager } from "../../src/context/budget-manager";
import { createAnthropicProvider } from "../../src/provider/anthropic";
import { createSessionState } from "../../src/agent/session";
import { createDefaultToolContext, createToolRegistry } from "../../src/tools/registry";

describe("runReplScript", () => {
  it("renders help output for /help and exits on /exit", async () => {
    const output = await runReplScript(["/help", "/exit"], {
      toolContext: createDefaultToolContext({
        workspaceRoot: process.cwd(),
        approvalMode: "default",
        budgetManager: new ContextBudgetManager(),
      }),
    });

    expect(output).toContain("/tools");
    expect(output).toContain("Goodbye");
  });

  it("renders pending and tool progress lines during agent execution", async () => {
    let callCount = 0;
    const provider = createAnthropicProvider({
      apiKey: "test",
      streamFactory: async function* () {
        if (callCount === 0) {
          callCount += 1;
          yield {
            type: "content_block_start",
            index: 0,
            content_block: {
              type: "tool_use",
              id: "toolu_read_file",
              name: "read_file",
              input: { path: "src/index.ts" },
            },
          };
          yield { type: "content_block_stop", index: 0 };
          yield { type: "message_stop" };
          return;
        }

        yield {
          type: "content_block_delta",
          index: 0,
          delta: {
            type: "text_delta",
            text: "src/index.ts defines value",
          },
        };
        yield { type: "message_stop" };
      },
    });

    const output = await runReplScript(["read file src/index.ts"], {
      session: createSessionState({
        cwd: process.cwd(),
        model: "claude-test",
        approvalMode: "default",
      }),
      registry: createToolRegistry(),
      provider,
      toolContext: createDefaultToolContext({
        workspaceRoot: process.cwd(),
        approvalMode: "default",
        budgetManager: new ContextBudgetManager(),
      }),
    });

    expect(output).toContain("[pending] Thinking...");
    expect(output).toContain("[tool:start] Reading src/index.ts");
    expect(output).toContain("[tool:done] Read src/index.ts");
    expect(output).toContain("src/index.ts defines value");
  });
});
