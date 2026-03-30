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

describe("runAgentLoop", () => {
  it("executes a provider-requested read_file call and returns a final answer", async () => {
    workspaceRoot = await createTempWorkspace();
    await fs.mkdir(path.join(workspaceRoot, "src"), { recursive: true });
    await fs.writeFile(path.join(workspaceRoot, "src", "index.ts"), "export const value = 1;\n", "utf8");

    let callCount = 0;
    let capturedSystem = "";
    const provider = createAnthropicProvider({
      apiKey: "test",
      streamFactory: async function* (input) {
        capturedSystem = input.system ?? "";
        if (callCount === 0) {
          callCount += 1;
          yield {
            type: "content_block_start",
            content_block: {
              type: "tool_use",
              name: "read_file",
              input: { path: "src/index.ts" },
            },
          };
          yield { type: "message_stop" };
          return;
        }

        yield { type: "content_block_delta", delta: { type: "text_delta", text: "src/index.ts defines value" } };
        yield { type: "message_stop" };
      },
    });

    const result = await runAgentLoop({
      prompt: "read file src/index.ts",
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
    });

    expect(result.toolCalls).toEqual(["read_file"]);
    expect(result.finalText).toContain("src/index.ts");
    expect(capturedSystem).toContain("Use search_code to find candidate paths");
    expect(capturedSystem).toContain("Dangerous actions include write_file and run_shell");
  });
});
