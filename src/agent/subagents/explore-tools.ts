import { ToolRegistry } from "../../tools/registry";
import { listFilesTool } from "../../tools/list-files";
import { readFileTool } from "../../tools/read-file";
import { searchCodeTool } from "../../tools/search-code";

export function createExploreToolRegistry(): ToolRegistry {
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

  return registry;
}
