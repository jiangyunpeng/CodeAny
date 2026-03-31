import { ContextBudgetManager } from "./budget-manager";
import type { ToolResultEnvelope } from "../tools/registry";
import type { AgentMessage } from "../agent/session";

function toModelSafeMetadata(metadata: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!metadata) {
    return undefined;
  }

  const safeEntries = Object.entries(metadata).filter(([key]) => !["stdout", "stderr", "rawOutput"].includes(key));
  if (safeEntries.length === 0) {
    return undefined;
  }

  return Object.fromEntries(
    safeEntries.map(([key, value]) => {
      if (typeof value === "string" && value.length > 200) {
        return [key, `${value.slice(0, 120)}...${value.slice(-40)}`];
      }
      return [key, value];
    }),
  );
}

export function buildToolResultMessage(input: ToolResultEnvelope, toolUseId?: string): AgentMessage {
  return {
    role: "tool",
    name: input.toolName,
    toolUseId,
    providerContent: toolUseId ? [{
      type: "tool_result",
      tool_use_id: toolUseId,
      content: JSON.stringify({
        status: input.status,
        summary: input.modelVisibleOutput,
        truncation: input.truncation,
        metadata: toModelSafeMetadata(input.metadata),
      }),
    }] : undefined,
    content: JSON.stringify({
      status: input.status,
      summary: input.modelVisibleOutput,
      truncation: input.truncation,
      metadata: toModelSafeMetadata(input.metadata),
    }),
  };
}

export function buildAssistantToolUseMessage(input: {
  toolUseId: string;
  name: string;
  input: unknown;
  preambleText?: string;
}): AgentMessage {
  const providerContent: Array<Record<string, unknown>> = [];
  if (input.preambleText?.trim()) {
    providerContent.push({
      type: "text",
      text: input.preambleText,
    });
  }
  providerContent.push({
    type: "tool_use",
    id: input.toolUseId,
    name: input.name,
    input: input.input as Record<string, unknown>,
  });

  return {
    role: "assistant",
    content: input.preambleText?.trim()
      ? input.preambleText
      : JSON.stringify({
        toolUseId: input.toolUseId,
        toolName: input.name,
        toolInput: input.input,
      }),
    providerContent,
  };
}

export function buildUserMessage(content: string): AgentMessage {
  return {
    role: "user",
    content,
  };
}

export function buildMessages(
  messages: AgentMessage[],
  budgetManager: ContextBudgetManager,
): AgentMessage[] {
  return budgetManager.clipHistory(
    messages.map((message) => ({
      ...message,
      content: budgetManager.clipText(
        message.content,
        budgetManager.budgets.maxMessageChars,
      ).text,
    })),
  );
}
