import { shapeTask } from "../task-shaper";
import { validateExploreReport, type ExploreReport } from "./explore-contract";
import { listFilesTool } from "../../tools/list-files";
import { searchCodeTool } from "../../tools/search-code";
import type { ToolContext } from "../../tools/registry";

export async function runExploreAgent(
  userInput: string,
  ctx: ToolContext,
): Promise<ExploreReport> {
  const task = shapeTask(userInput);
  const fileResult = await listFilesTool(
    {
      maxDepth: 6,
    },
    ctx,
  );
  const query = task.searchIntent.find((item) => item.length >= 2) ?? task.searchIntent[0] ?? "TODO";
  const searchResult = await searchCodeTool(
    {
      query,
      maxResults: 10,
    },
    ctx,
  );

  const candidatePaths = new Map<string, { reason: string; confidence: number }>();
  for (const match of searchResult.matches) {
    candidatePaths.set(match.path, {
      reason: `Matched query "${query}"`,
      confidence: 0.8,
    });
  }
  for (const entry of fileResult.entries.slice(0, 5)) {
    if (!candidatePaths.has(entry)) {
      candidatePaths.set(entry, {
        reason: "High-level file listing candidate",
        confidence: 0.4,
      });
    }
  }

  const report = validateExploreReport({
    rewrittenTask: task.rewrittenTask,
    keyQuestions: task.keyQuestions,
    candidatePaths: Array.from(candidatePaths.entries()).map(([path, info]) => ({
      path,
      reason: info.reason,
      confidence: info.confidence,
    })),
    searchSummary: [
      {
        tool: "list_files",
        query: "all-files",
        findings: fileResult.entries.slice(0, 5),
        truncated: fileResult.truncated,
      },
      {
        tool: "search_code",
        query,
        findings: searchResult.matches.map((match) => `${match.path}:${match.line}`),
        truncated: searchResult.truncated,
      },
    ],
    recommendedNextReads: searchResult.matches.slice(0, 3).map((match) => ({
      path: match.path,
      startLine: Math.max(1, match.line - 3),
      endLine: match.line + 3,
      reason: `Inspect context around query match "${query}"`,
    })),
    risks: searchResult.truncated
      ? ["Search results were truncated; narrow the query before broad reading."]
      : [],
  });

  return report;
}
