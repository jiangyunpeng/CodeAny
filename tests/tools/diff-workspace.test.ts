import path from "node:path";
import { promises as fs } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";

import { diffWorkspaceTool } from "../../src/tools/diff-workspace";
import { createDefaultToolContext } from "../../src/tools/registry";
import { createTempWorkspace, removeTempWorkspace } from "../helpers";

let workspaceRoot = "";

afterEach(async () => {
  if (workspaceRoot) {
    await removeTempWorkspace(workspaceRoot);
    workspaceRoot = "";
  }
});

describe("diffWorkspaceTool", () => {
  it("returns diff output for changed files", async () => {
    workspaceRoot = await createTempWorkspace();
    await fs.writeFile(path.join(workspaceRoot, "a.ts"), "const a = 1;\n", "utf8");

    const context = createDefaultToolContext({
      workspaceRoot,
      approvalMode: "default",
      shell: {
        async run() {
          return {
            stdout: "diff --git a/a.ts b/a.ts\n+const a = 1;\n",
            stderr: "",
            exitCode: 0,
            timedOut: false,
          };
        },
      },
    });

    const result = await diffWorkspaceTool(context);
    expect(result.modelVisibleOutput).toContain("diff --git");
  });
});
