import { describe, expect, it } from "vitest";

import { createAnthropicProvider } from "../../src/provider/anthropic";

describe("createAnthropicProvider", () => {
  it("maps anthropic stream events into internal output events", async () => {
    const provider = createAnthropicProvider({
      apiKey: "test",
      streamFactory: async function* () {
        yield { type: "content_block_delta", delta: { type: "text_delta", text: "hi" } };
        yield { type: "message_stop" };
      },
    });

    const response = await provider.send({
      model: "claude-test",
      messages: [],
    });
    const events = [];
    for await (const event of response.events) {
      events.push(event);
    }

    expect(events).toEqual([
      { type: "text", text: "hi" },
      { type: "done" },
    ]);
  });

  it("passes registered tools and tool results using Anthropic message shapes", async () => {
    let capturedRequest: Record<string, unknown> | undefined;
    const provider = createAnthropicProvider({
      apiKey: "test",
      streamFactory: async function* (input) {
        capturedRequest = input as unknown as Record<string, unknown>;
        yield { type: "message_stop" };
      },
    });

    const response = await provider.send({
      model: "claude-test",
      system: "system",
      tools: [{
        name: "read_file",
        description: "Read a file",
        inputSchema: {
          type: "object",
          properties: {
            path: { type: "string" },
          },
          required: ["path"],
        },
      }],
      messages: [{
        role: "tool",
        toolUseId: "toolu_123",
        content: "{\"status\":\"completed\"}",
      }],
    });

    for await (const _event of response.events) {
      // drain stream
    }

    expect(capturedRequest?.tools).toEqual([{
      name: "read_file",
      description: "Read a file",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string" },
        },
        required: ["path"],
      },
    }]);
    expect(capturedRequest?.messages).toEqual([{
      role: "tool",
      toolUseId: "toolu_123",
      content: "{\"status\":\"completed\"}",
    }]);
  });
});
