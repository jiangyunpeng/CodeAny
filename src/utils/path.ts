import path from "node:path";

export function resolveWorkspacePath(workspaceRoot: string, targetPath: string): string {
  if (path.isAbsolute(targetPath)) {
    return path.normalize(targetPath);
  }

  return path.resolve(workspaceRoot, targetPath);
}

export function isPathInsideWorkspace(workspaceRoot: string, targetPath: string): boolean {
  const root = path.resolve(workspaceRoot);
  const target = resolveWorkspacePath(workspaceRoot, targetPath);
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
