import { describe, expect, it } from "vitest";

import { createExploreToolRegistry } from "../../src/agent/subagents/explore-tools";
import { createDefaultToolContext } from "../../src/tools/registry";

describe("createExploreToolRegistry", () => {
  it("only exposes read-only tools", () => {
    const registry = createExploreToolRegistry();
    expect(registry.list().sort()).toEqual(["list_files", "read_file", "search_code"]);
  });

  it("rejects write tools because they are not registered", async () => {
    const registry = createExploreToolRegistry();
    await expect(
      registry.execute(
        "write_file",
        { path: "a.ts", content: "x" },
        createDefaultToolContext({
          workspaceRoot: process.cwd(),
          approvalMode: "never",
        }),
      ),
    ).rejects.toThrow("Unknown tool");
  });
});
