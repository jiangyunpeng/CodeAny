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
    expect(capturedSystem).toContain("Use search_code and list_files to locate relevant files");
    expect(capturedSystem).toContain("write_file and run_shell are dangerous actions");
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

  it("returns tool failures to the model so it can retry with a corrected path", async () => {
    workspaceRoot = await createTempWorkspace();
    await fs.mkdir(path.join(workspaceRoot, "src"), { recursive: true });
    await fs.writeFile(path.join(workspaceRoot, "src", "index.ts"), "export const value = 1;\n", "utf8");

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
              id: "toolu_read_missing",
              name: "read_file",
              input: { path: "docs/call-source-line-analysis.md" },
            },
          };
          yield { type: "content_block_stop", index: 0 };
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
              id: "toolu_read_existing",
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
            text: "重试后成功读到了 src/index.ts",
          },
        };
        yield { type: "message_stop" };
      },
    });

    const result = await runAgentLoop({
      prompt: "看下调用来源这个折线图是如何实现的",
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

    expect(result.toolCalls).toEqual(["read_file", "read_file"]);
    expect(result.finalText).toContain("重试后成功");
    expect(result.session.recentToolResults[0]?.status).toBe("failed");
    expect(result.session.recentToolResults[0]?.modelVisibleOutput).toContain("ENOENT");
    expect(result.session.recentToolResults[1]?.status).toBe("completed");
  });
});
