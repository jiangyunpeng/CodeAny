import { ContextBudgetManager } from "./budget-manager";
import { truncateItems, truncateText, type TruncationMeta } from "./truncation";

export type TextCompressionResult = {
  rawOutput: string;
  modelVisibleOutput: string;
  truncation?: TruncationMeta;
};

export function compressTextResult(
  text: string,
  maxChars: number,
  nextActionHint?: string,
): TextCompressionResult {
  const result = truncateText(text, { maxChars, nextActionHint });
  return {
    rawOutput: text,
    modelVisibleOutput: result.text,
    truncation: result.meta,
  };
}

export function compressFileList(
  entries: string[],
  maxItems: number,
): {
  entries: string[];
  summary: string;
  truncation: TruncationMeta;
} {
  const result = truncateItems(entries, {
    maxItems,
    nextActionHint: "Use read_file on the most relevant paths.",
  });
  return {
    entries: result.items,
    summary: result.items.join("\n"),
    truncation: result.meta,
  };
}

export function compressSearchMatches(
  matches: Array<{ path: string; line: number; preview: string }>,
  maxItems: number,
): {
  matches: Array<{ path: string; line: number; preview: string }>;
  summary: string;
  truncation: TruncationMeta;
} {
  const result = truncateItems(matches, {
    maxItems,
    nextActionHint: "Use read_file on the most relevant paths.",
  });
  return {
    matches: result.items,
    summary: result.items.map((item) => `${item.path}:${item.line} ${item.preview}`).join("\n"),
    truncation: result.meta,
  };
}

export function budgetedTextSummary(
  budgetManager: ContextBudgetManager,
  text: string,
): string {
  return budgetManager.clipText(text).text;
}
