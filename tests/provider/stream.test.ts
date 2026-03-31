import { describe, expect, it } from "vitest";

import { mapAnthropicStreamEvents } from "../../src/provider/stream";

describe("mapAnthropicStreamEvents", () => {
  it("assembles tool inputs from input_json_delta events", async () => {
    const events = [];

    for await (const event of mapAnthropicStreamEvents((async function* () {
      yield {
        type: "content_block_start",
        index: 0,
        content_block: {
          type: "tool_use",
          id: "toolu_123",
          name: "search_code",
          input: {},
        },
      } as const;
      yield {
        type: "content_block_delta",
        index: 0,
        delta: {
          type: "input_json_delta",
          partial_json: "{\"query\":\"chart\",\"maxResults\":5}",
        },
      } as const;
      yield { type: "content_block_stop", index: 0 } as const;
      yield { type: "message_stop" } as const;
    })())) {
      events.push(event);
    }

    expect(events).toEqual([
      {
        type: "tool_use",
        toolUseId: "toolu_123",
        name: "search_code",
        input: { query: "chart", maxResults: 5 },
      },
      { type: "done" },
    ]);
  });
});
