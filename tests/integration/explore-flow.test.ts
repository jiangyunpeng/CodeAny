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

describe("explore flow", () => {
  it("uses explore first for broad requests and only passes ExploreReport to the main agent", async () => {
    workspaceRoot = await createTempWorkspace();
    await fs.mkdir(path.join(workspaceRoot, "src"), { recursive: true });
    await fs.writeFile(path.join(workspaceRoot, "src", "chart.ts"), "const raw = 'raw grep noise';\n", "utf8");

    const provider = createAnthropicProvider({
      apiKey: "test",
      streamFactory: async function* () {
        yield { type: "content_block_delta", delta: { type: "text_delta", text: "done" } };
        yield { type: "message_stop" };
      },
    });

    const result = await runAgentLoop({
      prompt: "深入研究项目结构",
      session: createSessionState({
        cwd: workspaceRoot,
        model: "claude-test",
        approvalMode: "default",
      }),
      provider,
      registry: createToolRegistry(),
      toolContext: createDefaultToolContext({
        workspaceRoot,
        approvalMode: "default",
      }),
      exploreAgent: async () => ({
        rewrittenTask: "Search the codebase thoroughly",
        keyQuestions: ["Where is the entrypoint?"],
        candidatePaths: [{ path: "src/chart.ts", reason: "relevant", confidence: 0.8 }],
        searchSummary: [{ tool: "search_code", query: "chart", findings: ["src/chart.ts:1"], truncated: false }],
        recommendedNextReads: [{ path: "src/chart.ts", startLine: 1, endLine: 3, reason: "inspect chart" }],
        risks: [],
      }),
    });

    expect(result.usedExplore).toBe(true);
    expect(result.messagesSentToMainModel.join("\n")).not.toContain("raw grep noise");
  });
});
