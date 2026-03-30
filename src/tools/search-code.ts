import { compressSearchMatches } from "../context/result-compressor";
import { listWorkspaceFiles, readWorkspaceFile } from "../utils/fs";
import type { ToolContext } from "./registry";

export type SearchCodeInput = {
  query: string;
  maxResults?: number;
  glob?: string;
};

export type SearchCodeResult = {
  query: string;
  totalMatches: number;
  returnedMatches: number;
  truncated: boolean;
  matches: Array<{
    path: string;
    line: number;
    preview: string;
  }>;
  nextActionHint?: string;
  rawOutput: string;
  modelVisibleOutput: string;
};

export async function searchCodeTool(input: SearchCodeInput, ctx: ToolContext): Promise<SearchCodeResult> {
  const files = await listWorkspaceFiles({
    workspaceRoot: ctx.workspaceRoot,
    maxDepth: 8,
    glob: input.glob,
  });
  const matches: Array<{ path: string; line: number; preview: string }> = [];

  for (const file of files) {
    const content = await readWorkspaceFile(ctx.workspaceRoot, file);
    const lines = content.split("\n");
    for (let index = 0; index < lines.length; index += 1) {
      if (lines[index].includes(input.query)) {
        matches.push({
          path: file,
          line: index + 1,
          preview: lines[index].trim(),
        });
      }
    }
  }

  const compressed = compressSearchMatches(matches, input.maxResults ?? 20);
  return {
    query: input.query,
    totalMatches: matches.length,
    returnedMatches: compressed.matches.length,
    truncated: compressed.truncation.truncated,
    matches: compressed.matches,
    nextActionHint: compressed.truncation.nextActionHint,
    rawOutput: matches.map((item) => `${item.path}:${item.line}:${item.preview}`).join("\n"),
    modelVisibleOutput: compressed.summary,
  };
}
