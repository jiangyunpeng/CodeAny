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

        yield { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "src/index.ts defines value" } };
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

  it("returns a blocked message instead of claiming success when write_file requires approval", async () => {
    workspaceRoot = await createTempWorkspace();

    const provider = createAnthropicProvider({
      apiKey: "test",
      streamFactory: async function* () {
        yield {
          type: "content_block_start",
          index: 0,
          content_block: {
            type: "tool_use",
            id: "toolu_write_file",
            name: "write_file",
            input: { path: "index.html", content: "<h1>Hello World</h1>\n" },
          },
        };
        yield { type: "content_block_stop", index: 0 };
        yield { type: "message_stop" };
      },
    });

    const result = await runAgentLoop({
      prompt: "帮我实现一个helo world html",
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

    await expect(fs.access(path.join(workspaceRoot, "index.html"))).rejects.toThrow();
    expect(result.toolCalls).toEqual(["write_file"]);
    expect(result.finalText).toContain("requires approval");
    expect(result.finalText).toContain("no file was created");
  });
});
