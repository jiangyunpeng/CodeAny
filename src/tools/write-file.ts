import { writeWorkspaceFile } from "../utils/fs";
import type { ToolContext } from "./registry";

export type WriteFileInput = {
  path: string;
  content: string;
};

export type WriteFileResult = {
  path: string;
  bytesWritten: number;
  rawOutput: string;
  modelVisibleOutput: string;
};

export async function writeFileTool(input: WriteFileInput, ctx: ToolContext): Promise<WriteFileResult> {
  await writeWorkspaceFile(ctx.workspaceRoot, input.path, input.content);
  return {
    path: input.path,
    bytesWritten: Buffer.byteLength(input.content),
    rawOutput: input.content,
    modelVisibleOutput: `Wrote ${input.path} (${Buffer.byteLength(input.content)} bytes)`,
  };
}
