import { compressFileList } from "../context/result-compressor";
import { listWorkspaceFiles } from "../utils/fs";
import type { ToolContext } from "./registry";

export type ListFilesInput = {
  path?: string;
  maxDepth?: number;
  glob?: string;
};

export type ListFilesResult = {
  entries: string[];
  totalCount: number;
  returnedCount: number;
  truncated: boolean;
  nextActionHint?: string;
  rawOutput: string;
  modelVisibleOutput: string;
};

export async function listFilesTool(input: ListFilesInput, ctx: ToolContext): Promise<ListFilesResult> {
  const entries = await listWorkspaceFiles({
    workspaceRoot: ctx.workspaceRoot,
    targetPath: input.path,
    maxDepth: input.maxDepth ?? 3,
    glob: input.glob,
  });
  const compressed = compressFileList(entries, ctx.budgetManager.budgets.maxHistoryMessages);
  return {
    entries: compressed.entries,
    totalCount: entries.length,
    returnedCount: compressed.entries.length,
    truncated: compressed.truncation.truncated,
    nextActionHint: compressed.truncation.nextActionHint,
    rawOutput: entries.join("\n"),
    modelVisibleOutput: compressed.summary,
  };
}
