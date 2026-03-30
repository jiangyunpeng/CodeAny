import { describe, expect, it } from "vitest";

import { runReplScript } from "../../src/cli/repl";
import { ContextBudgetManager } from "../../src/context/budget-manager";
import { createDefaultToolContext } from "../../src/tools/registry";

describe("runReplScript", () => {
  it("renders help output for /help and exits on /exit", async () => {
    const output = await runReplScript(["/help", "/exit"], {
      toolContext: createDefaultToolContext({
        workspaceRoot: process.cwd(),
        approvalMode: "default",
        budgetManager: new ContextBudgetManager(),
      }),
    });

    expect(output).toContain("/tools");
    expect(output).toContain("Goodbye");
  });
});
