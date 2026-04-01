import { describe, expect, it } from "vitest";

import { renderProgressLine } from "../../src/cli/render";

describe("renderProgressLine", () => {
  it("shows visible and total file counts when list results are truncated", () => {
    const line = renderProgressLine({
      type: "tool_done",
      scope: "main",
      toolName: "list_files",
      input: { path: "." },
      result: {
        toolName: "list_files",
        status: "completed",
        rawOutput: "",
        modelVisibleOutput: "",
        truncation: {
          truncated: true,
          totalCount: 157,
          returnedCount: 12,
        },
        metadata: {
          entries: new Array(12).fill("file.ts"),
        },
      },
    });

    expect(line).toContain("Listed 12 of 157 files under .");
  });

  it("shows visible and total match counts when search results are truncated", () => {
    const line = renderProgressLine({
      type: "tool_done",
      scope: "main",
      toolName: "search_code",
      input: { query: "折线图" },
      result: {
        toolName: "search_code",
        status: "completed",
        rawOutput: "",
        modelVisibleOutput: "",
        truncation: {
          truncated: true,
          totalCount: 43,
          returnedCount: 20,
        },
        metadata: {
          matches: new Array(20).fill({ path: "a.ts", line: 1, preview: "x" }),
        },
      },
    });

    expect(line).toContain("Found 20 of 43 matches for \"折线图\"");
  });

  it("shows approval-required status instead of pretending a file was written", () => {
    const line = renderProgressLine({
      type: "tool_done",
      scope: "main",
      toolName: "write_file",
      input: { path: "index.html" },
      result: {
        toolName: "write_file",
        status: "requires_approval",
        rawOutput: "",
        modelVisibleOutput: "Tool write_file requires approval",
      },
    });

    expect(line).toContain("Write index.html requires approval");
    expect(line).not.toContain("Wrote index.html");
  });

  it("shows tool failure details instead of a success summary", () => {
    const line = renderProgressLine({
      type: "tool_done",
      scope: "main",
      toolName: "read_file",
      input: { path: "docs/missing.md" },
      result: {
        toolName: "read_file",
        status: "failed",
        rawOutput: "ENOENT: no such file or directory",
        modelVisibleOutput: "Tool read_file failed: ENOENT: no such file or directory",
      },
    });

    expect(line).toContain("Read docs/missing.md failed");
    expect(line).toContain("ENOENT");
    expect(line).not.toContain("Read docs/missing.md (");
  });
});
