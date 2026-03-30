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
});
