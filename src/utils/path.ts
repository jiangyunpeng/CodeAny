import { realpathSync } from "node:fs";
import path from "node:path";

export function resolveWorkspacePath(workspaceRoot: string, targetPath: string): string {
  if (path.isAbsolute(targetPath)) {
    return path.normalize(targetPath);
  }

  return path.resolve(workspaceRoot, targetPath);
}

export function isPathInsideWorkspace(workspaceRoot: string, targetPath: string): boolean {
  const root = canonicalizePath(workspaceRoot);
  const target = canonicalizePath(resolveWorkspacePath(workspaceRoot, targetPath));
  const relative = path.relative(root, target);

  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export function assertInsideWorkspace(workspaceRoot: string, targetPath: string): string {
  const resolved = resolveWorkspacePath(workspaceRoot, targetPath);
  if (!isPathInsideWorkspace(workspaceRoot, targetPath)) {
    throw new Error("Path is outside workspace");
  }

  return resolved;
}

function canonicalizePath(targetPath: string): string {
  const resolved = path.resolve(targetPath);
  const suffix: string[] = [];
  let current = resolved;

  while (true) {
    try {
      const real = realpathSync.native(current);
      return suffix.length === 0 ? real : path.join(real, ...suffix.reverse());
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code !== "ENOENT") {
        return resolved;
      }
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return resolved;
    }

    suffix.push(path.basename(current));
    current = parent;
  }
}
