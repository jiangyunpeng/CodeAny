import { describe, expect, it } from "vitest";

import { validateExploreReport } from "../../src/agent/subagents/explore-contract";

describe("validateExploreReport", () => {
  it("accepts a valid report shape", () => {
    const report = validateExploreReport({
      rewrittenTask: "Search the codebase",
      keyQuestions: ["Where is the entrypoint?"],
      candidatePaths: [{ path: "src/index.ts", reason: "entry", confidence: 0.9 }],
      searchSummary: [{ tool: "search_code", query: "entry", findings: ["src/index.ts:1"], truncated: false }],
      recommendedNextReads: [{ path: "src/index.ts", reason: "inspect entry" }],
      risks: [],
    });

    expect(report.candidatePaths[0].path).toBe("src/index.ts");
  });
});
