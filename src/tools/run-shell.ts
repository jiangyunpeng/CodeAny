import { compressTextResult } from "../context/result-compressor";
import type { ToolContext } from "./registry";

export type RunShellInput = {
  command: string;
  timeoutMs?: number;
};

export type RunShellResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
  rawOutput: string;
  modelVisibleOutput: string;
  truncation?: {
    truncated: boolean;
    totalChars?: number;
    returnedChars?: number;
    nextActionHint?: string;
  };
};

export async function runShellTool(input: RunShellInput, ctx: ToolContext): Promise<RunShellResult> {
  const result = await ctx.shell.run(input.command, {
    cwd: ctx.workspaceRoot,
    timeoutMs: input.timeoutMs,
  });
  const combined = [result.stdout.trim(), result.stderr.trim()].filter(Boolean).join("\n");
  const compressed = compressTextResult(
    combined,
    ctx.budgetManager.budgets.maxShellChars,
    "Re-run with a narrower command or inspect the raw terminal output.",
  );
  return {
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode,
    timedOut: result.timedOut,
    rawOutput: combined,
    modelVisibleOutput: compressed.modelVisibleOutput,
    truncation: compressed.truncation,
  };
}
