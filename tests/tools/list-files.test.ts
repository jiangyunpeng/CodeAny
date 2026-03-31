import path from "node:path";
import { promises as fs } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";

import { listFilesTool } from "../../src/tools/list-files";
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

describe("listFilesTool", () => {
  it("lists files with truncation metadata", async () => {
    workspaceRoot = await createTempWorkspace();
    await fs.mkdir(path.join(workspaceRoot, "src"), { recursive: true });
    await fs.writeFile(path.join(workspaceRoot, "src", "a.ts"), "export const a = 1;\n", "utf8");
    await fs.writeFile(path.join(workspaceRoot, "src", "b.ts"), "export const b = 2;\n", "utf8");

    const result = await listFilesTool(
      {},
      createDefaultToolContext({
        workspaceRoot,
        approvalMode: "default",
        budgetManager: new ContextBudgetManager({ maxHistoryMessages: 1 }),
      }),
    );

    expect(result.totalCount).toBe(2);
    expect(result.returnedCount).toBe(1);
    expect(result.truncated).toBe(true);
  });

  it("finds files in deep Java-style package directories by default", async () => {
    workspaceRoot = await createTempWorkspace();
    const nestedDir = path.join(
      workspaceRoot,
      "console",
      "src",
      "main",
      "java",
      "com",
      "wacai",
      "middleware",
      "quantum",
      "controller",
    );
    await fs.mkdir(nestedDir, { recursive: true });
    await fs.writeFile(path.join(nestedDir, "EndpointDetailController.java"), "class EndpointDetailController {}\n", "utf8");

    const result = await listFilesTool(
      { path: "." },
      createDefaultToolContext({
        workspaceRoot,
        approvalMode: "default",
      }),
    );

    expect(result.totalCount).toBe(1);
    expect(result.entries).toContain("console/src/main/java/com/wacai/middleware/quantum/controller/EndpointDetailController.java");
  });
});
