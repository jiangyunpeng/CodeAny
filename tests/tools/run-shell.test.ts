import { afterEach, describe, expect, it } from "vitest";

import { runShellTool } from "../../src/tools/run-shell";
import { ContextBudgetManager } from "../../src/context/budget-manager";
import { createDefaultToolContext } from "../../src/tools/registry";
import { createTempWorkspace, removeTempWorkspace } from "../helpers";

let workspaceRoot = "";

afterEach(async () => {
  if (workspaceRoot) {
    await removeTempWorkspace(workspaceRoot);
    workspaceRoot = "";
  }
});

describe("runShellTool", () => {
  it("summarizes shell output for the model while retaining raw output", async () => {
    workspaceRoot = await createTempWorkspace();
    const result = await runShellTool(
      { command: "printf 'a%.0s' {1..2000}" },
      createDefaultToolContext({
        workspaceRoot,
        approvalMode: "never",
        budgetManager: new ContextBudgetManager({ maxShellChars: 100 }),
      }),
    );

    expect(result.rawOutput.length).toBeGreaterThan(result.modelVisibleOutput.length);
    expect(result.truncation?.truncated).toBe(true);
  });
});
