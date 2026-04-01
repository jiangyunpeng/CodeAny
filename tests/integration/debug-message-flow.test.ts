/**
 * Diagnostic test: replays the exact tool-call sequence from a real session
 * ("你看下调用来源这个折线图是如何实现的") and dumps the messages sent to the
 * main model at each iteration so we can compare with pi-mono's message flow.
 *
 * Run with:  npx vitest run tests/integration/debug-message-flow.test.ts
 */
import path from "node:path";
import { promises as fs } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";

import { runAgentLoop } from "../../src/agent/run-agent-loop";
import { createSessionState } from "../../src/agent/session";
import { createAnthropicProvider } from "../../src/provider/anthropic";
import { createToolRegistry, createDefaultToolContext } from "../../src/tools/registry";
import { createTempWorkspace, removeTempWorkspace } from "../helpers";

let workspaceRoot = "";

afterEach(async () => {
  if (workspaceRoot) {
    await removeTempWorkspace(workspaceRoot);
    workspaceRoot = "";
  }
});

/**
 * Simulate the exact tool-call sequence observed in the real session:
 *
 * Iteration 0: list_files(".")
 * Iteration 1: list_files("console")
 * Iteration 2: search_code("调用来源")
 * Iteration 3: read_file("docs/call-source-line-analysis.md") → ENOENT
 *              read_file("console/...MetricsSummaryController.java") → OK
 * Iteration 4: search_code("buildDurationByNewRule")
 * Iteration 5: read_file("console/...MetricsQueryUtil.java") → OK (large file)
 * Iteration 6: (model should answer, not ask follow-up)
 */
describe("debug message flow", () => {
  it("dumps messages sent to model at each iteration for the '调用来源' scenario", async () => {
    workspaceRoot = await createTempWorkspace();

    // Create realistic file structure
    const consoleSrc = path.join(workspaceRoot, "console", "src", "main", "java", "com", "wacai");
    await fs.mkdir(consoleSrc, { recursive: true });
    await fs.writeFile(
      path.join(consoleSrc, "MetricsSummaryController.java"),
      "// 调用来源折线图\npublic class MetricsSummaryController {\n  public void queryLineFrom() { buildDurationByNewRule(); }\n}\n",
      "utf8",
    );
    await fs.writeFile(
      path.join(consoleSrc, "MetricsQueryUtil.java"),
      "// MetricsQueryUtil\npublic class MetricsQueryUtil {\n  public static Duration buildDurationByNewRule() { return null; }\n  public static void aggrMinutesIfNeed() {}\n}\n" +
      "// padding to simulate large file\n".repeat(50),
      "utf8",
    );

    let callCount = 0;
    const capturedInputs: Array<{ iteration: number; messageCount: number; systemLength: number; messagesPreview: string[] }> = [];

    const provider = createAnthropicProvider({
      apiKey: "test",
      streamFactory: async function* (input) {
        const iteration = callCount;
        callCount += 1;

        // Capture what was sent to the model
        const messages = input.messages ?? [];
        capturedInputs.push({
          iteration,
          messageCount: messages.length,
          systemLength: (input.system ?? "").length,
          messagesPreview: messages.map((m: any) => {
            const role = m.role;
            const content = typeof m.content === "string" ? m.content : JSON.stringify(m.content);
            return `[${role}] (${content.length} chars) ${content.slice(0, 120)}`;
          }),
        });

        // Simulate the observed tool-call sequence
        if (iteration === 0) {
          // list_files(".")
          yield {
            type: "content_block_start",
            index: 0,
            content_block: { type: "tool_use", id: "toolu_list_0", name: "list_files", input: { path: "." } },
          };
          yield { type: "content_block_stop", index: 0 };
          yield { type: "message_stop" };
          return;
        }

        if (iteration === 1) {
          // list_files("console")
          yield {
            type: "content_block_start",
            index: 0,
            content_block: { type: "tool_use", id: "toolu_list_1", name: "list_files", input: { path: "console" } },
          };
          yield { type: "content_block_stop", index: 0 };
          yield { type: "message_stop" };
          return;
        }

        if (iteration === 2) {
          // search_code("调用来源")
          yield {
            type: "content_block_start",
            index: 0,
            content_block: { type: "tool_use", id: "toolu_search_0", name: "search_code", input: { query: "调用来源", maxResults: 20 } },
          };
          yield { type: "content_block_stop", index: 0 };
          yield { type: "message_stop" };
          return;
        }

        if (iteration === 3) {
          // read_file (ENOENT)
          yield {
            type: "content_block_start",
            index: 0,
            content_block: { type: "tool_use", id: "toolu_read_0", name: "read_file", input: { path: "docs/call-source-line-analysis.md" } },
          };
          yield { type: "content_block_stop", index: 0 };
          yield { type: "message_stop" };
          return;
        }

        if (iteration === 4) {
          // read_file (MetricsSummaryController.java)
          yield {
            type: "content_block_start",
            index: 0,
            content_block: {
              type: "tool_use",
              id: "toolu_read_1",
              name: "read_file",
              input: { path: "console/src/main/java/com/wacai/MetricsSummaryController.java" },
            },
          };
          yield { type: "content_block_stop", index: 0 };
          yield { type: "message_stop" };
          return;
        }

        if (iteration === 5) {
          // search_code("buildDurationByNewRule")
          yield {
            type: "content_block_start",
            index: 0,
            content_block: { type: "tool_use", id: "toolu_search_1", name: "search_code", input: { query: "buildDurationByNewRule", maxResults: 5 } },
          };
          yield { type: "content_block_stop", index: 0 };
          yield { type: "message_stop" };
          return;
        }

        if (iteration === 6) {
          // read_file (MetricsQueryUtil.java - large)
          yield {
            type: "content_block_start",
            index: 0,
            content_block: {
              type: "tool_use",
              id: "toolu_read_2",
              name: "read_file",
              input: { path: "console/src/main/java/com/wacai/MetricsQueryUtil.java" },
            },
          };
          yield { type: "content_block_stop", index: 0 };
          yield { type: "message_stop" };
          return;
        }

        // Iteration 7: model should give a final answer
        yield {
          type: "content_block_delta",
          index: 0,
          delta: {
            type: "text_delta",
            text: "调用来源折线图的实现分析：MetricsSummaryController.queryLineFrom 调用 MetricsQueryUtil.buildDurationByNewRule 构建时间范围...",
          },
        };
        yield { type: "message_stop" };
      },
    });

    const result = await runAgentLoop({
      prompt: "你看下调用来源这个折线图是如何实现的",
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
      }),
      debug: true,
    });

    // Dump captured inputs for analysis
    console.log("\n\n========== MESSAGE FLOW ANALYSIS ==========\n");
    for (const capture of capturedInputs) {
      console.log(`--- Iteration ${capture.iteration} ---`);
      console.log(`  Messages sent to model: ${capture.messageCount}`);
      console.log(`  System prompt length: ${capture.systemLength} chars`);
      for (const preview of capture.messagesPreview) {
        console.log(`  ${preview}`);
      }
      console.log();
    }

    // Key assertions
    console.log("========== BUDGET ANALYSIS ==========\n");
    const lastCapture = capturedInputs[capturedInputs.length - 1];
    console.log(`Final iteration (${lastCapture.iteration}):`);
    console.log(`  Total messages: ${lastCapture.messageCount}`);
    console.log(`  maxHistoryMessages budget: 12`);

    // Check: does the user's original question survive to the final iteration?
    const lastMessages = lastCapture.messagesPreview;
    const hasUserQuestion = lastMessages.some((m) => m.includes("调用来源"));
    console.log(`  User's original question present: ${hasUserQuestion}`);

    // Check: how many tool results are visible?
    const toolResultCount = lastMessages.filter((m) => m.startsWith("[tool]") || m.startsWith("[user]")).length;
    console.log(`  Tool/user messages visible: ${toolResultCount}`);

    console.log("\n========== SESSION MESSAGES ==========\n");
    console.log(`Total session messages: ${result.session.messages.length}`);
    for (let i = 0; i < result.session.messages.length; i++) {
      const msg = result.session.messages[i];
      console.log(`  [${i}] role=${msg.role} name=${msg.name ?? "-"} chars=${msg.content.length}`);
    }

    // The model should have answered, not asked a follow-up
    expect(result.finalText).toContain("调用来源");
    expect(result.finalText).not.toContain("你想继续做什么");
    expect(result.finalText).not.toContain("你想做什么");

    // The user's original question should be present in the final iteration
    expect(hasUserQuestion).toBe(true);
  });
});
