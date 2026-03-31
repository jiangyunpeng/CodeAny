import path from "node:path";
import { promises as fs } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";

import { runExploreSubagent } from "../../src/agent/subagents/explore-runner";
import { createAnthropicProvider } from "../../src/provider/anthropic";
import { createDefaultToolContext } from "../../src/tools/registry";
import { createTempWorkspace, removeTempWorkspace } from "../helpers";

let workspaceRoot = "";

afterEach(async () => {
  if (workspaceRoot) {
    await removeTempWorkspace(workspaceRoot);
    workspaceRoot = "";
  }
});

describe("runExploreSubagent", () => {
  it("runs a model-driven read-only tool loop and returns ExploreReport", async () => {
    workspaceRoot = await createTempWorkspace();
    await fs.mkdir(path.join(workspaceRoot, "src"), { recursive: true });
    await fs.writeFile(path.join(workspaceRoot, "src", "chart.ts"), "export const chart = true;\n", "utf8");

    let callCount = 0;
    const seenSystems: string[] = [];
    const provider = createAnthropicProvider({
      apiKey: "test",
      streamFactory: async function* (input) {
        seenSystems.push(input.system ?? "");
        if (callCount === 0) {
          callCount += 1;
          yield {
            type: "content_block_start",
            index: 0,
            content_block: {
              type: "tool_use",
              id: "toolu_search_code",
              name: "search_code",
              input: { query: "chart", maxResults: 5 },
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
            text: JSON.stringify({
              rewrittenTask: "Search the codebase thoroughly for chart",
              keyQuestions: ["Where is chart implemented?"],
              candidatePaths: [{ path: "src/chart.ts", reason: "Matched chart", confidence: 0.9 }],
              searchSummary: [{ tool: "search_code", query: "chart", findings: ["src/chart.ts:1"], truncated: false }],
              recommendedNextReads: [{ path: "src/chart.ts", startLine: 1, endLine: 1, reason: "Inspect chart implementation" }],
              risks: [],
            }),
          },
        };
        yield { type: "message_stop" };
      },
    });

    const report = await runExploreSubagent({
      prompt: "深入研究 chart 实现",
      model: "claude-explore-test",
      provider,
      toolContext: createDefaultToolContext({
        workspaceRoot,
        approvalMode: "never",
      }),
    });

    expect(report.candidatePaths[0]?.path).toBe("src/chart.ts");
    expect(seenSystems[0]).toContain("read-only");
    expect(seenSystems[0]).toContain("valid JSON");
  });
});
