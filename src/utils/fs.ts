import { promises as fs } from "node:fs";
import path from "node:path";

import { assertInsideWorkspace } from "./path";

type ListWorkspaceFilesInput = {
  workspaceRoot: string;
  targetPath?: string;
  maxDepth?: number;
  glob?: string;
};

function globToRegExp(glob: string): RegExp {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "__DOUBLE_STAR__")
    .replace(/\*/g, "[^/]*")
    .replace(/__DOUBLE_STAR__/g, ".*")
    .replace(/\?/g, ".");

  return new RegExp(`^${escaped}$`);
}

export async function listWorkspaceFiles(input: ListWorkspaceFilesInput): Promise<string[]> {
  const {
    workspaceRoot,
    targetPath = ".",
    maxDepth = 3,
    glob,
  } = input;
  const basePath = assertInsideWorkspace(workspaceRoot, targetPath);
  const matcher = glob ? globToRegExp(glob) : null;
  const results: string[] = [];

  async function walk(currentPath: string, depth: number): Promise<void> {
    const entries = await fs.readdir(currentPath, { withFileTypes: true });
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      const fullPath = path.join(currentPath, entry.name);
      const relative = path.relative(workspaceRoot, fullPath).split(path.sep).join("/");
      if (entry.isDirectory()) {
        if (depth < maxDepth) {
          await walk(fullPath, depth + 1);
        }
        continue;
      }

      if (!matcher || matcher.test(relative) || matcher.test(entry.name)) {
        results.push(relative);
      }
    }
  }

  await walk(basePath, 0);
  return results;
}

export async function readWorkspaceFile(
  workspaceRoot: string,
  targetPath: string,
): Promise<string> {
  const resolved = assertInsideWorkspace(workspaceRoot, targetPath);
  return fs.readFile(resolved, "utf8");
}

export async function writeWorkspaceFile(
  workspaceRoot: string,
  targetPath: string,
  content: string,
): Promise<void> {
  const resolved = assertInsideWorkspace(workspaceRoot, targetPath);
  await fs.mkdir(path.dirname(resolved), { recursive: true });
  await fs.writeFile(resolved, content, "utf8");
}
