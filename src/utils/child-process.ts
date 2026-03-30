import { spawn } from "node:child_process";

export type CommandResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
};

export async function runCommand(
  command: string,
  options: {
    cwd: string;
    timeoutMs?: number;
  },
): Promise<CommandResult> {
  const timeoutMs = options.timeoutMs ?? 30_000;

  return new Promise<CommandResult>((resolve, reject) => {
    const child = spawn(command, {
      cwd: options.cwd,
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let settled = false;
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });

    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    child.on("error", (error) => {
      clearTimeout(timer);
      if (!settled) {
        settled = true;
        reject(error);
      }
    });

    child.on("close", (exitCode) => {
      clearTimeout(timer);
      if (!settled) {
        settled = true;
        resolve({
          stdout,
          stderr,
          exitCode: exitCode ?? (timedOut ? 124 : 1),
          timedOut,
        });
      }
    });
  });
}
