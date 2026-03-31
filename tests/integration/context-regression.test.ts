import { afterEach, describe, expect, it } from "vitest";

import { runAgentLoop } from "../../src/agent/run-agent-loop";
import { createSessionState } from "../../src/agent/session";
import { createAnthropicProvider } from "../../src/provider/anthropic";
import { ContextBudgetManager } from "../../src/context/budget-manager";
import { createToolRegistry, createDefaultToolContext } from "../../src/tools/registry";
import { createTempWorkspace, removeTempWorkspace } from "../helpers";

let workspaceRoot = "";

afterEach(async () => {
  if (workspaceRoot) {
    await removeTempWorkspace(workspaceRoot);
    workspaceRoot = "";
  }
});

describe("context regression", () => {
  it("persists the latest ExploreReport and recent tool results across repl turns", async () => {
    workspaceRoot = await createTempWorkspace();

    let callCount = 0;
    const provider = createAnthropicProvider({
      apiKey: "test",
      streamFactory: async function* () {
        if (callCount === 0) {
          callCount += 1;
          yield {
            type: "content_block_delta",
            delta: {
              type: "text_delta",
              text: JSON.stringify({
                rewrittenTask: "Search logs",
                keyQuestions: ["Where do logs come from?"],
                candidatePaths: [],
                searchSummary: [],
                recommendedNextReads: [],
                risks: [],
              }),
            },
          };
          yield { type: "message_stop" };
          return;
        }
        if (callCount === 1) {
          callCount += 1;
          yield {
            type: "content_block_start",
            index: 0,
            content_block: {
              type: "tool_use",
              id: "toolu_run_shell",
              name: "run_shell",
              input: { command: "printf 'VERY_LONG_RAW_OUTPUT_BLOCK%.0s' {1..300}" },
            },
          };
          yield { type: "content_block_stop", index: 0 };
          yield { type: "message_stop" };
          return;
        }

        yield { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "final" } };
        yield { type: "message_stop" };
      },
    });

    const result = await runAgentLoop({
      prompt: "深入研究日志输出",
      session: createSessionState({
        cwd: workspaceRoot,
        model: "claude-test",
        approvalMode: "never",
      }),
      provider,
      registry: createToolRegistry(),
      toolContext: createDefaultToolContext({
        workspaceRoot,
        approvalMode: "never",
        budgetManager: new ContextBudgetManager({ maxShellChars: 120 }),
      }),
    });

    expect(result.session.latestExploreReport).toBeDefined();
    expect(result.session.recentToolResults.length).toBeGreaterThan(0);
    expect(result.messagesSentToMainModel.join("\n")).not.toContain("VERY_LONG_RAW_OUTPUT_BLOCKVERY_LONG_RAW_OUTPUT_BLOCK");
  });
});
