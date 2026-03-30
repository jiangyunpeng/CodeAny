import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";

export async function createTempWorkspace(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "code-any-"));
}

export async function removeTempWorkspace(workspaceRoot: string): Promise<void> {
  await fs.rm(workspaceRoot, { recursive: true, force: true });
}
