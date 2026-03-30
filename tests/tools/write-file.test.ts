import path from "node:path";
import { promises as fs } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";

import { createToolRegistry, createDefaultToolContext } from "../../src/tools/registry";
import { writeFileTool } from "../../src/tools/write-file";
import { createTempWorkspace, removeTempWorkspace } from "../helpers";

let workspaceRoot = "";

afterEach(async () => {
  if (workspaceRoot) {
    await removeTempWorkspace(workspaceRoot);
    workspaceRoot = "";
  }
});

describe("writeFileTool", () => {
  it("writes files when called directly", async () => {
    workspaceRoot = await createTempWorkspace();
    const context = createDefaultToolContext({
      workspaceRoot,
      approvalMode: "never",
    });

    await writeFileTool({ path: "a.ts", content: "export const value = 1;\n" }, context);
    const content = await fs.readFile(path.join(workspaceRoot, "a.ts"), "utf8");
    expect(content).toContain("value");
  });

  it("returns a pending approval decision for write_file in default mode", async () => {
    workspaceRoot = await createTempWorkspace();
    const registry = createToolRegistry();
    const result = await registry.execute(
      "write_file",
      { path: "a.ts", content: "x" },
      createDefaultToolContext({
        workspaceRoot,
        approvalMode: "default",
      }),
    );

    expect(result.status).toBe("requires_approval");
  });
});
