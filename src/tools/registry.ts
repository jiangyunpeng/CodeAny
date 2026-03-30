import { ContextBudgetManager } from "../context/budget-manager";
import { requiresApproval } from "../agent/approval";
import { runCommand, type CommandResult } from "../utils/child-process";
import { listFilesTool } from "./list-files";
import { readFileTool } from "./read-file";
import { searchCodeTool } from "./search-code";
import { writeFileTool } from "./write-file";
import { runShellTool } from "./run-shell";
import { diffWorkspaceTool } from "./diff-workspace";
import type { TruncationMeta } from "../context/truncation";

export type ToolName =
  | "list_files"
  | "read_file"
  | "search_code"
  | "write_file"
  | "run_shell"
  | "diff_workspace";

export type ToolResultEnvelope = {
  toolName: ToolName;
  status: "completed" | "requires_approval";
  rawOutput: string;
  modelVisibleOutput: string;
  truncation?: TruncationMeta;
  metadata?: Record<string, unknown>;
};

export type ShellRunner = {
  run: (command: string, options: { cwd: string; timeoutMs?: number }) => Promise<CommandResult>;
};

export type ToolContext = {
  workspaceRoot: string;
  approvalMode: "default" | "never";
  budgetManager: ContextBudgetManager;
  shell: ShellRunner;
};

type ToolExecutor = (input: unknown, ctx: ToolContext) => Promise<ToolResultEnvelope>;

export class ToolRegistry {
  private readonly tools = new Map<ToolName, ToolExecutor>();

  register(name: ToolName, executor: ToolExecutor): void {
    this.tools.set(name, executor);
  }

  list(): ToolName[] {
    return Array.from(this.tools.keys());
  }

  async execute(name: ToolName, input: unknown, ctx: ToolContext): Promise<ToolResultEnvelope> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Unknown tool: ${name}`);
    }

    if (requiresApproval(ctx.approvalMode, name)) {
      return {
        toolName: name,
        status: "requires_approval",
        rawOutput: "",
        modelVisibleOutput: `Tool ${name} requires approval`,
      };
    }

    return tool(input, ctx);
  }
}

export function createDefaultToolContext(input: {
  workspaceRoot: string;
  approvalMode: "default" | "never";
  budgetManager?: ContextBudgetManager;
  shell?: ShellRunner;
}): ToolContext {
  return {
    workspaceRoot: input.workspaceRoot,
    approvalMode: input.approvalMode,
    budgetManager: input.budgetManager ?? new ContextBudgetManager(),
    shell: input.shell ?? { run: runCommand },
  };
}

export function createToolRegistry(): ToolRegistry {
  const registry = new ToolRegistry();

  registry.register("list_files", async (input, ctx) => {
    const result = await listFilesTool(input as never, ctx);
    return {
      toolName: "list_files",
      status: "completed",
      rawOutput: result.rawOutput,
      modelVisibleOutput: result.modelVisibleOutput,
      truncation: {
        truncated: result.truncated,
        totalCount: result.totalCount,
        returnedCount: result.returnedCount,
        nextActionHint: result.nextActionHint,
      },
      metadata: {
        entries: result.entries,
      },
    };
  });

  registry.register("read_file", async (input, ctx) => {
    const result = await readFileTool(input as never, ctx);
    return {
      toolName: "read_file",
      status: "completed",
      rawOutput: result.rawOutput,
      modelVisibleOutput: result.modelVisibleOutput,
      metadata: {
        path: result.path,
        startLine: result.startLine,
        endLine: result.endLine,
      },
    };
  });

  registry.register("search_code", async (input, ctx) => {
    const result = await searchCodeTool(input as never, ctx);
    return {
      toolName: "search_code",
      status: "completed",
      rawOutput: result.rawOutput,
      modelVisibleOutput: result.modelVisibleOutput,
      truncation: {
        truncated: result.truncated,
        totalCount: result.totalMatches,
        returnedCount: result.returnedMatches,
        nextActionHint: result.nextActionHint,
      },
      metadata: {
        matches: result.matches,
      },
    };
  });

  registry.register("write_file", async (input, ctx) => {
    const result = await writeFileTool(input as never, ctx);
    return {
      toolName: "write_file",
      status: "completed",
      rawOutput: result.rawOutput,
      modelVisibleOutput: result.modelVisibleOutput,
      metadata: {
        path: result.path,
        bytesWritten: result.bytesWritten,
      },
    };
  });

  registry.register("run_shell", async (input, ctx) => {
    const result = await runShellTool(input as never, ctx);
    return {
      toolName: "run_shell",
      status: "completed",
      rawOutput: result.rawOutput,
      modelVisibleOutput: result.modelVisibleOutput,
      truncation: result.truncation,
      metadata: {
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
        timedOut: result.timedOut,
      },
    };
  });

  registry.register("diff_workspace", async (_input, ctx) => {
    const result = await diffWorkspaceTool(ctx);
    return {
      toolName: "diff_workspace",
      status: "completed",
      rawOutput: result.rawOutput,
      modelVisibleOutput: result.modelVisibleOutput,
      truncation: result.truncation,
    };
  });

  return registry;
}
