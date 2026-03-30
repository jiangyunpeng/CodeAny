export type ApprovalMode = "default" | "never";

const DANGEROUS_TOOLS = new Set(["write_file", "run_shell"]);

export function shouldAutoApprove(mode: ApprovalMode, toolName: string): boolean {
  if (mode === "never" && DANGEROUS_TOOLS.has(toolName)) {
    return true;
  }

  return !DANGEROUS_TOOLS.has(toolName);
}

export function requiresApproval(mode: ApprovalMode, toolName: string): boolean {
  return !shouldAutoApprove(mode, toolName);
}
