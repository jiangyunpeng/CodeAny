export type TruncationMeta = {
  truncated: boolean;
  totalCount?: number;
  returnedCount?: number;
  totalChars?: number;
  returnedChars?: number;
  nextActionHint?: string;
};

export function truncateItems<T>(
  items: T[],
  options: {
    maxItems: number;
    nextActionHint?: string;
  },
): {
  items: T[];
  meta: TruncationMeta;
} {
  const result = items.slice(0, options.maxItems);
  return {
    items: result,
    meta: {
      truncated: items.length > result.length,
      totalCount: items.length,
      returnedCount: result.length,
      nextActionHint: items.length > result.length ? options.nextActionHint : undefined,
    },
  };
}

export function truncateText(
  text: string,
  options: {
    maxChars: number;
    nextActionHint?: string;
  },
): {
  text: string;
  meta: TruncationMeta;
} {
  if (text.length <= options.maxChars) {
    return {
      text,
      meta: {
        truncated: false,
        totalChars: text.length,
        returnedChars: text.length,
      },
    };
  }

  const visibleWindow = Math.max(8, Math.min(32, Math.floor((options.maxChars - 32) / 2)));
  const value = [
    `[truncated output: ${text.length} chars]`,
    text.slice(0, visibleWindow),
    "...",
    text.slice(-visibleWindow),
  ].join("\n");
  return {
    text: value,
    meta: {
      truncated: true,
      totalChars: text.length,
      returnedChars: value.length,
      nextActionHint: options.nextActionHint,
    },
  };
}
