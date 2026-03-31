import path from "node:path";
import { promises as fs } from "node:fs";
import os from "node:os";
import { afterEach, describe, expect, it } from "vitest";

import { assertInsideWorkspace, isPathInsideWorkspace } from "../../src/utils/path";
import { createTempWorkspace, removeTempWorkspace } from "../helpers";

let workspaceRoot = "";
let symlinkRoot = "";

afterEach(async () => {
  if (symlinkRoot) {
    await fs.rm(symlinkRoot, { recursive: true, force: true });
    symlinkRoot = "";
  }
  if (workspaceRoot) {
    await removeTempWorkspace(workspaceRoot);
    workspaceRoot = "";
  }
});

describe("workspace path resolution", () => {
  it("accepts equivalent absolute paths across symlink boundaries", async () => {
    workspaceRoot = await createTempWorkspace();
    await fs.writeFile(path.join(workspaceRoot, "a.ts"), "export const a = 1;\n", "utf8");

    symlinkRoot = await fs.mkdtemp(path.join(os.tmpdir(), "code-any-link-"));
    const aliasPath = path.join(symlinkRoot, "workspace");
    await fs.symlink(workspaceRoot, aliasPath);

    const realFilePath = path.join(workspaceRoot, "a.ts");

    expect(isPathInsideWorkspace(aliasPath, realFilePath)).toBe(true);
    expect(assertInsideWorkspace(aliasPath, realFilePath)).toBe(realFilePath);
  });

  it("still rejects paths outside the workspace", async () => {
    workspaceRoot = await createTempWorkspace();
    const outsidePath = path.join(path.dirname(workspaceRoot), "outside.txt");

    expect(isPathInsideWorkspace(workspaceRoot, outsidePath)).toBe(false);
    expect(() => assertInsideWorkspace(workspaceRoot, outsidePath)).toThrow("outside workspace");
  });
});
