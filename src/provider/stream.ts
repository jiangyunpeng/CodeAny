export type ProviderEvent =
  | { type: "text"; text: string }
  | { type: "tool_use"; toolUseId: string; name: string; input: unknown }
  | { type: "done" };

export type AnthropicEvent =
  | { type: "content_block_delta"; index: number; delta: { type: "text_delta"; text: string } | { type: "input_json_delta"; partial_json: string } }
  | { type: "content_block_start"; index: number; content_block: { type: "tool_use"; id: string; name: string; input: unknown } }
  | { type: "content_block_stop"; index: number }
  | { type: "message_stop" }
  | { type: string; [key: string]: unknown };

function isTextDeltaEvent(
  event: AnthropicEvent,
): event is { type: "content_block_delta"; delta: { type: "text_delta"; text: string } } {
  if (event.type !== "content_block_delta") {
    return false;
  }

  const delta = (event as { delta?: unknown }).delta;
  return (
    typeof delta === "object" &&
    delta !== null &&
    "type" in delta &&
    delta.type === "text_delta" &&
    "text" in delta &&
    typeof delta.text === "string"
  );
}

function isInputJsonDeltaEvent(
  event: AnthropicEvent,
): event is { type: "content_block_delta"; index: number; delta: { type: "input_json_delta"; partial_json: string } } {
  if (event.type !== "content_block_delta") {
    return false;
  }

  const delta = (event as { delta?: unknown }).delta;
  return (
    typeof delta === "object" &&
    delta !== null &&
    "type" in delta &&
    delta.type === "input_json_delta" &&
    "partial_json" in delta &&
    typeof delta.partial_json === "string"
  );
}

function isToolUseStartEvent(
  event: AnthropicEvent,
): event is { type: "content_block_start"; index: number; content_block: { type: "tool_use"; id: string; name: string; input: unknown } } {
  if (event.type !== "content_block_start") {
    return false;
  }

  const contentBlock = (event as { content_block?: unknown }).content_block;
  return (
    typeof contentBlock === "object" &&
    contentBlock !== null &&
    "type" in contentBlock &&
    contentBlock.type === "tool_use" &&
    "id" in contentBlock &&
    typeof contentBlock.id === "string" &&
    "name" in contentBlock &&
    typeof contentBlock.name === "string"
  );
}

function isContentBlockStopEvent(
  event: AnthropicEvent,
): event is { type: "content_block_stop"; index: number } {
  return event.type === "content_block_stop" && typeof (event as { index?: unknown }).index === "number";
}

type PendingToolUse = {
  toolUseId: string;
  name: string;
  input: unknown;
  inputJson: string;
};

export async function* mapAnthropicStreamEvents(source: AsyncIterable<AnthropicEvent>): AsyncIterable<ProviderEvent> {
  const pendingToolUses = new Map<number, PendingToolUse>();

  for await (const event of source) {
    if (isTextDeltaEvent(event)) {
      yield { type: "text", text: event.delta.text };
      continue;
    }

    if (isToolUseStartEvent(event)) {
      pendingToolUses.set(event.index, {
        toolUseId: event.content_block.id,
        name: event.content_block.name,
        input: event.content_block.input,
        inputJson: "",
      });
      continue;
    }

    if (isInputJsonDeltaEvent(event)) {
      const pending = pendingToolUses.get(event.index);
      if (pending) {
        pending.inputJson += event.delta.partial_json;
      }
      continue;
    }

    if (isContentBlockStopEvent(event)) {
      const pending = pendingToolUses.get(event.index);
      if (pending) {
        pendingToolUses.delete(event.index);
        yield {
          type: "tool_use",
          toolUseId: pending.toolUseId,
          name: pending.name,
          input: parseToolInput(pending),
        };
      }
      continue;
    }

    if (event.type === "message_stop") {
      yield { type: "done" };
      continue;
    }
  }
}

function parseToolInput(pending: PendingToolUse): unknown {
  if (!pending.inputJson.trim()) {
    return pending.input;
  }

  try {
    return JSON.parse(pending.inputJson);
  } catch {
    return pending.input;
  }
}
