import Anthropic from "@anthropic-ai/sdk";

import { mapAnthropicEvent, type ProviderEvent } from "./stream";
import type { AgentMessage } from "../agent/session";

export type ProviderSendInput = {
  model: string;
  messages: AgentMessage[];
  system?: string;
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
  streamFactory?: StreamFactory;
}): Provider {
  const streamFactory = input.streamFactory ?? createSdkStreamFactory(input.apiKey);
  return {
    async send(request) {
      const source = streamFactory(request);
      return {
        events: (async function* () {
          for await (const event of source) {
            for (const mapped of mapAnthropicEvent(event as never)) {
              yield mapped;
            }
          }
        })(),
      };
    },
  };
}

function createSdkStreamFactory(apiKey: string): StreamFactory {
  const client = new Anthropic({ apiKey });
  return (input) =>
    client.messages.stream({
      model: input.model,
      max_tokens: 2_048,
      system: input.system,
      messages: input.messages.map((message) => ({
        role: message.role === "tool" ? "user" : message.role,
        content: message.content,
      })),
    });
}
