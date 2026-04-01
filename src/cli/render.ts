import type { ApprovalMode } from "../agent/approval";
import type { AgentProgressEvent } from "../agent/progress";

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

export function renderProgressLine(event: AgentProgressEvent): string {
  if (event.type === "pending") {
    return event.scope === "explore"
      ? "[pending] Exploring workspace..."
      : "[pending] Thinking...";
  }

  if (event.type === "tool_start") {
    return `[tool:start] ${formatToolStart(event.toolName, event.input)}`;
  }

  return `[tool:done] ${formatToolDone(event.toolName, event.input, event.result)}`;
}

function formatToolStart(name: Extract<AgentProgressEvent, { type: "tool_start" }>["toolName"], input: unknown): string {
  const data = asRecord(input);

  if (name === "search_code") {
    return `Searching code for ${quoteValue(data.query)}`;
  }
  if (name === "read_file") {
    return `Reading ${stringValue(data.path) ?? "file"}`;
  }
  if (name === "list_files") {
    return `Listing files under ${stringValue(data.path) ?? "."}`;
  }
  if (name === "run_shell") {
    return `Running shell command ${quoteValue(data.command)}`;
  }
  if (name === "write_file") {
    return `Writing ${stringValue(data.path) ?? "file"}`;
  }

  return `Running ${name}`;
}

function formatToolDone(
  name: Extract<AgentProgressEvent, { type: "tool_done" }>["toolName"],
  input: unknown,
  result: Extract<AgentProgressEvent, { type: "tool_done" }>["result"],
): string {
  const inputData = asRecord(input);
  const metadata = asRecord(result.metadata);
  const truncation = asRecord(result.truncation);

  if (result.status === "requires_approval") {
    return formatApprovalRequired(name, inputData, metadata);
  }
  if (result.status === "failed") {
    return formatFailure(name, inputData, metadata, result.modelVisibleOutput);
  }

  if (name === "search_code") {
    return formatCountSummary({
      noun: "matches",
      total: numberValue(truncation.totalCount) ?? arrayLength(metadata.matches),
      visible: numberValue(truncation.returnedCount) ?? arrayLength(metadata.matches),
      truncated: booleanValue(truncation.truncated),
      prefix: "Found",
      suffix: `for ${quoteValue(inputData.query)}`,
    });
  }
  if (name === "list_files") {
    return formatCountSummary({
      noun: "files",
      total: numberValue(truncation.totalCount) ?? arrayLength(metadata.entries),
      visible: numberValue(truncation.returnedCount) ?? arrayLength(metadata.entries),
      truncated: booleanValue(truncation.truncated),
      prefix: "Listed",
      suffix: `under ${stringValue(inputData.path) ?? "."}`,
    });
  }
  if (name === "read_file") {
    const path = stringValue(metadata.path) ?? stringValue(inputData.path) ?? "file";
    const startLine = numberValue(metadata.startLine);
    const endLine = numberValue(metadata.endLine);
    return startLine !== undefined && endLine !== undefined
      ? `Read ${path} (${startLine}-${endLine})`
      : `Read ${path}`;
  }
  if (name === "run_shell") {
    const exitCode = numberValue(metadata.exitCode);
    return exitCode !== undefined
      ? `Shell command finished with exit code ${exitCode}`
      : "Shell command finished";
  }
  if (name === "write_file") {
    return `Wrote ${stringValue(metadata.path) ?? stringValue(inputData.path) ?? "file"}`;
  }
  if (name === "diff_workspace") {
    return "Summarized workspace diff";
  }

  return `${name} completed`;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function booleanValue(value: unknown): boolean {
  return value === true;
}

function arrayLength(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

function quoteValue(value: unknown): string {
  return JSON.stringify(typeof value === "string" ? value : "");
}

function formatCountSummary(input: {
  noun: string;
  total: number;
  visible: number;
  truncated: boolean;
  prefix: string;
  suffix: string;
}): string {
  if (input.truncated && input.visible < input.total) {
    return `${input.prefix} ${input.visible} of ${input.total} ${input.noun} ${input.suffix}`;
  }

  return `${input.prefix} ${input.total} ${input.noun} ${input.suffix}`;
}

function formatApprovalRequired(
  name: Extract<AgentProgressEvent, { type: "tool_done" }>["toolName"],
  input: Record<string, unknown>,
  metadata: Record<string, unknown>,
): string {
  if (name === "write_file") {
    return `Write ${stringValue(metadata.path) ?? stringValue(input.path) ?? "file"} requires approval`;
  }
  if (name === "run_shell") {
    return `Shell command ${quoteValue(stringValue(input.command) ?? "")} requires approval`;
  }

  return `${name} requires approval`;
}

function formatFailure(
  name: Extract<AgentProgressEvent, { type: "tool_done" }>["toolName"],
  input: Record<string, unknown>,
  metadata: Record<string, unknown>,
  fallbackMessage: string,
): string {
  const errorMessage = stringValue(metadata.errorMessage) ?? fallbackMessage;

  if (name === "read_file") {
    return `Read ${stringValue(input.path) ?? "file"} failed: ${errorMessage}`;
  }
  if (name === "list_files") {
    return `List files under ${stringValue(input.path) ?? "."} failed: ${errorMessage}`;
  }
  if (name === "search_code") {
    return `Search for ${quoteValue(input.query)} failed: ${errorMessage}`;
  }
  if (name === "run_shell") {
    return `Shell command ${quoteValue(stringValue(input.command) ?? "")} failed: ${errorMessage}`;
  }
  if (name === "write_file") {
    return `Write ${stringValue(input.path) ?? "file"} failed: ${errorMessage}`;
  }

  return `${name} failed: ${errorMessage}`;
}
