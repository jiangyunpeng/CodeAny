import path from "node:path";
import { promises as fs } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";

import { searchCodeTool } from "../../src/tools/search-code";
import { createDefaultToolContext } from "../../src/tools/registry";
import { createTempWorkspace, removeTempWorkspace } from "../helpers";

let workspaceRoot = "";

afterEach(async () => {
  if (workspaceRoot) {
    await removeTempWorkspace(workspaceRoot);
    workspaceRoot = "";
  }
});

describe("searchCodeTool", () => {
  it("returns top-N search matches with truncation metadata", async () => {
    workspaceRoot = await createTempWorkspace();
    await fs.mkdir(path.join(workspaceRoot, "src"), { recursive: true });
    await fs.writeFile(path.join(workspaceRoot, "src", "a.ts"), "TODO first\nTODO second\n", "utf8");
    await fs.writeFile(path.join(workspaceRoot, "src", "b.ts"), "TODO third\n", "utf8");

    const result = await searchCodeTool(
      { query: "TODO", maxResults: 2 },
      createDefaultToolContext({
        workspaceRoot,
        approvalMode: "default",
      }),
    );

    expect(result.truncated).toBe(true);
    expect(result.matches[0]).toMatchObject({ path: expect.any(String), line: expect.any(Number) });
  });

  it("searches deep Java-style package directories by default", async () => {
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
    await fs.writeFile(
      path.join(nestedDir, "EndpointDetailController.java"),
      "public class EndpointDetailController { WebResponse queryLine() { return null; } }\n",
      "utf8",
    );

    const result = await searchCodeTool(
      { query: "queryLine" },
      createDefaultToolContext({
        workspaceRoot,
        approvalMode: "default",
      }),
    );

    expect(result.totalMatches).toBe(1);
    expect(result.matches[0]).toMatchObject({
      path: "console/src/main/java/com/wacai/middleware/quantum/controller/EndpointDetailController.java",
      line: 1,
    });
  });
});
