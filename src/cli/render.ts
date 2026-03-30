import type { ApprovalMode } from "../agent/approval";

export function renderStatusLine(input: {
  model: string;
  approvalMode: ApprovalMode;
  yolo?: boolean;
}): string {
  const prefix = input.yolo ? "[YOLO]" : "[SAFE]";
  return `${prefix} model=${input.model} approval=${input.approvalMode}`;
}

export function renderToolSummary(name: string, summary: string): string {
  return `[tool:${name}] ${summary}`;
}
