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

  clipHistory<T>(messages: T[]): T[] {
    return messages.slice(-this.budgets.maxHistoryMessages);
  }
}
