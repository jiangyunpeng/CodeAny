import path from "node:path";
import { promises as fs } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";

import { readFileTool } from "../../src/tools/read-file";
import { createDefaultToolContext } from "../../src/tools/registry";
import { createTempWorkspace, removeTempWorkspace } from "../helpers";

let workspaceRoot = "";

afterEach(async () => {
  if (workspaceRoot) {
    await removeTempWorkspace(workspaceRoot);
    workspaceRoot = "";
  }
});

describe("readFileTool", () => {
  it("rejects reading outside the workspace root", async () => {
    workspaceRoot = await createTempWorkspace();

    await expect(readFileTool(
      { path: "../secret.txt" },
      createDefaultToolContext({
        workspaceRoot,
        approvalMode: "default",
      }),
    )).rejects.toThrow("outside workspace");
  });

  it("returns numbered line ranges", async () => {
    workspaceRoot = await createTempWorkspace();
    await fs.writeFile(path.join(workspaceRoot, "a.ts"), "one\ntwo\nthree\n", "utf8");

    const result = await readFileTool(
      { path: "a.ts", startLine: 2, endLine: 3 },
      createDefaultToolContext({
        workspaceRoot,
        approvalMode: "default",
      }),
    );

    expect(result.content).toContain("2: two");
    expect(result.content).toContain("3: three");
  });
});
