import { describe, expect, it } from "vitest";

import { parseExploreReportOutput } from "../../src/agent/subagents/explore-parser";

describe("parseExploreReportOutput", () => {
  it("parses plain JSON output", () => {
    const report = parseExploreReportOutput({
      text: JSON.stringify({
        rewrittenTask: "Search task",
        keyQuestions: ["Where?"],
        candidatePaths: [],
        searchSummary: [],
        recommendedNextReads: [],
        risks: [],
      }),
      rewrittenTask: "Search task",
    });

    expect(report.rewrittenTask).toBe("Search task");
  });

  it("parses JSON inside a fenced block", () => {
    const report = parseExploreReportOutput({
      text: '```json\n{"rewrittenTask":"Task","keyQuestions":[],"candidatePaths":[],"searchSummary":[],"recommendedNextReads":[],"risks":[]}\n```',
      rewrittenTask: "Task",
    });

    expect(report.rewrittenTask).toBe("Task");
  });

  it("falls back to an empty report when output is invalid", () => {
    const report = parseExploreReportOutput({
      text: "not valid json",
      rewrittenTask: "Fallback task",
      keyQuestions: ["What failed?"],
    });

    expect(report.rewrittenTask).toBe("Fallback task");
    expect(report.risks[0]).toContain("invalid");
  });
});
