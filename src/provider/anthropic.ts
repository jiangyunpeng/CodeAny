import Anthropic from "@anthropic-ai/sdk";

import { mapAnthropicStreamEvents, type ProviderEvent } from "./stream";
import type { AgentMessage } from "../agent/session";
import type { ToolDefinition } from "../tools/registry";

export type ProviderSendInput = {
  model: string;
  messages: AgentMessage[];
  system?: string;
  tools?: ToolDefinition[];
};

export type ProviderResponse = {
  events: AsyncIterable<ProviderEvent>;
};

export type Provider = {
  send: (input: ProviderSendInput) => Promise<ProviderResponse>;
};

type StreamFactory = (input: ProviderSendInput) => AsyncIterable<unknown>;

export function createAnthropicProvider(input: {
  apiKey: string;
  authToken?: string;
  baseURL?: string;
  streamFactory?: StreamFactory;
}): Provider {
  const streamFactory = input.streamFactory ?? createSdkStreamFactory({
    apiKey: input.apiKey,
    authToken: input.authToken,
    baseURL: input.baseURL,
  });
  return {
    async send(request) {
      const source = streamFactory(request);
      return {
        events: mapAnthropicStreamEvents(source as AsyncIterable<never>),
      };
    },
  };
}

function createSdkStreamFactory(input: {
  apiKey: string;
  authToken?: string;
  baseURL?: string;
}): StreamFactory {
  const client = new Anthropic({
    apiKey: input.apiKey || null,
    authToken: input.authToken || null,
    baseURL: input.baseURL || undefined,
  });
  return (input) =>
    client.messages.stream({
      model: input.model,
      max_tokens: 2_048,
      system: input.system,
      messages: input.messages.map((message) => {
        return {
          role: message.role === "tool" ? "user" : message.role,
          content: (message.providerContent ?? message.content) as Anthropic.MessageParam["content"],
        };
      }),
      tools: input.tools?.map((tool) => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.inputSchema,
      })),
      tool_choice: input.tools?.length
        ? { type: "auto", disable_parallel_tool_use: true }
        : undefined,
    });
}
