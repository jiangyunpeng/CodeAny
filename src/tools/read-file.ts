import { readWorkspaceFile } from "../utils/fs";
import type { ToolContext } from "./registry";

export type ReadFileInput = {
  path: string;
  startLine?: number;
  endLine?: number;
};

export type ReadFileResult = {
  path: string;
  startLine: number;
  endLine: number;
  content: string;
  rawOutput: string;
  modelVisibleOutput: string;
};

export async function readFileTool(input: ReadFileInput, ctx: ToolContext): Promise<ReadFileResult> {
  const content = await readWorkspaceFile(ctx.workspaceRoot, input.path);
  const lines = content.split("\n");
  const startLine = input.startLine ?? 1;
  const endLine = input.endLine ?? lines.length;
  const selected = lines.slice(startLine - 1, endLine).map((line, index) => `${startLine + index}: ${line}`);
  const rendered = selected.join("\n");

  return {
    path: input.path,
    startLine,
    endLine,
    content: rendered,
    rawOutput: content,
    modelVisibleOutput: rendered,
  };
}
