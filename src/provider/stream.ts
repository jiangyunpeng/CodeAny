export type ProviderEvent =
  | { type: "text"; text: string }
  | { type: "tool_use"; name: string; input: unknown }
  | { type: "done" };

export type AnthropicEvent =
  | { type: "content_block_delta"; delta: { type: "text_delta"; text: string } }
  | { type: "content_block_start"; content_block: { type: "tool_use"; name: string; input: unknown } }
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

function isToolUseStartEvent(
  event: AnthropicEvent,
): event is { type: "content_block_start"; content_block: { type: "tool_use"; name: string; input: unknown } } {
  if (event.type !== "content_block_start") {
    return false;
  }

  const contentBlock = (event as { content_block?: unknown }).content_block;
  return (
    typeof contentBlock === "object" &&
    contentBlock !== null &&
    "type" in contentBlock &&
    contentBlock.type === "tool_use" &&
    "name" in contentBlock &&
    typeof contentBlock.name === "string"
  );
}

export function mapAnthropicEvent(event: AnthropicEvent): ProviderEvent[] {
  if (isTextDeltaEvent(event)) {
    return [{ type: "text", text: event.delta.text }];
  }

  if (isToolUseStartEvent(event)) {
    return [{
      type: "tool_use",
      name: event.content_block.name,
      input: event.content_block.input,
    }];
  }

  if (event.type === "message_stop") {
    return [{ type: "done" }];
  }

  return [];
}
