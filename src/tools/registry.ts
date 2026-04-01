import { ContextBudgetManager } from "../context/budget-manager";
import { requiresApproval } from "../agent/approval";
import { runCommand, type CommandResult } from "../utils/child-process";
import { toErrorMessage } from "../utils/errors";
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
  status: "completed" | "requires_approval" | "failed";
  rawOutput: string;
  modelVisibleOutput: string;
  truncation?: TruncationMeta;
  metadata?: Record<string, unknown>;
};

export type ToolDefinition = {
  name: ToolName;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, { type: string; description?: string }>;
    required?: string[];
    additionalProperties?: boolean;
  };
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

  listDefinitions(): ToolDefinition[] {
    return this.list().map((name) => TOOL_DEFINITIONS[name]);
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

    try {
      return await tool(input, ctx);
    } catch (error) {
      return buildFailedToolResult(name, error);
    }
  }
}

function buildFailedToolResult(name: ToolName, error: unknown): ToolResultEnvelope {
  const message = toErrorMessage(error);
  const details = typeof error === "object" && error !== null ? error as Record<string, unknown> : {};

  return {
    toolName: name,
    status: "failed",
    rawOutput: message,
    modelVisibleOutput: `Tool ${name} failed: ${message}`,
    metadata: {
      errorMessage: message,
      errorName: typeof details.name === "string" ? details.name : undefined,
      errorCode: typeof details.code === "string" ? details.code : undefined,
    },
  };
}

const TOOL_DEFINITIONS: Record<ToolName, ToolDefinition> = {
  list_files: {
    name: "list_files",
    description: "List files inside the current workspace, optionally narrowed by path, depth, or glob.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Optional path inside the workspace to start listing from." },
        maxDepth: { type: "integer", description: "Maximum directory depth to traverse." },
        glob: { type: "string", description: "Optional glob pattern to filter returned files." },
      },
      additionalProperties: false,
    },
  },
  read_file: {
    name: "read_file",
    description: "Read a file from the workspace, optionally restricting the returned line range.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path to the file inside the workspace." },
        startLine: { type: "integer", description: "1-based starting line number." },
        endLine: { type: "integer", description: "1-based ending line number." },
      },
      required: ["path"],
      additionalProperties: false,
    },
  },
  search_code: {
    name: "search_code",
    description: "Search workspace files for a literal text query and return matching file paths and line previews.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Literal text to search for." },
        maxResults: { type: "integer", description: "Maximum number of matches to return." },
        glob: { type: "string", description: "Optional glob filter for candidate files." },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  write_file: {
    name: "write_file",
    description: "Write text content to a workspace file, creating parent directories when needed.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path to the file inside the workspace." },
        content: { type: "string", description: "Full file content to write." },
      },
      required: ["path", "content"],
      additionalProperties: false,
    },
  },
  run_shell: {
    name: "run_shell",
    description: "Run a shell command with the workspace root as the working directory.",
    inputSchema: {
      type: "object",
      properties: {
        command: { type: "string", description: "Shell command to execute." },
        timeoutMs: { type: "integer", description: "Optional timeout in milliseconds." },
      },
      required: ["command"],
      additionalProperties: false,
    },
  },
  diff_workspace: {
    name: "diff_workspace",
    description: "Show a git diff summary for the current workspace.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
};

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
