import { compressTextResult } from "../context/result-compressor";
import type { ToolContext } from "./registry";

export type DiffWorkspaceResult = {
  rawOutput: string;
  modelVisibleOutput: string;
  truncation?: {
    truncated: boolean;
    totalChars?: number;
    returnedChars?: number;
    nextActionHint?: string;
  };
};

export async function diffWorkspaceTool(ctx: ToolContext): Promise<DiffWorkspaceResult> {
  const result = await ctx.shell.run("git diff --stat --patch --unified=3", {
    cwd: ctx.workspaceRoot,
    timeoutMs: 10_000,
  });
  const output = [result.stdout.trim(), result.stderr.trim()].filter(Boolean).join("\n");
  const compressed = compressTextResult(
    output,
    ctx.budgetManager.budgets.maxDiffChars,
    "Use git diff on a narrower path if more detail is needed.",
  );
  return {
    rawOutput: output,
    modelVisibleOutput: compressed.modelVisibleOutput,
    truncation: compressed.truncation,
  };
}
