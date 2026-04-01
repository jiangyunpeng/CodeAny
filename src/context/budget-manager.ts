import { truncateText } from "./truncation";

export type BudgetConfig = {
  maxToolChars: number;
  maxShellChars: number;
  maxDiffChars: number;
  maxHistoryMessages: number;
  maxMessageChars: number;
};

export const DEFAULT_BUDGETS: BudgetConfig = {
  maxToolChars: 4_000,
  maxShellChars: 3_000,
  maxDiffChars: 3_000,
  maxHistoryMessages: 12,
  maxMessageChars: 6_000,
};

export class ContextBudgetManager {
  readonly budgets: BudgetConfig;

  constructor(overrides: Partial<BudgetConfig> = {}) {
    this.budgets = { ...DEFAULT_BUDGETS, ...overrides };
  }

  clipText(text: string, maxChars = this.budgets.maxToolChars, nextActionHint?: string): {
    text: string;
    truncated: boolean;
  } {
    const result = truncateText(text, { maxChars, nextActionHint });
    return {
      text: result.text,
      truncated: result.meta.truncated,
    };
  }

  clipHistory<T extends { role: string }>(messages: T[]): T[] {
    const max = this.budgets.maxHistoryMessages;
    if (messages.length <= max) {
      return messages;
    }

    // Always preserve the first user message (the original question)
    const first = messages[0];
    const hasUserFirst = first && first.role === "user";
    const tailBudget = hasUserFirst ? max - 1 : max;

    // Find a safe cut point: tail must not start with a "tool" message
    // (which would be an orphan tool_result without its preceding assistant tool_use)
    let cutIndex = messages.length - tailBudget;
    while (cutIndex < messages.length && messages[cutIndex].role === "tool") {
      cutIndex -= 1; // include the preceding assistant message
    }

    const tail = messages.slice(cutIndex);
    if (hasUserFirst && cutIndex > 0) {
      return [first, ...tail];
    }
    return tail;
  }
}
