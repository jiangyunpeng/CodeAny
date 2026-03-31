import type { ToolResultEnvelope, ToolName } from "../tools/registry";

export type ProgressScope = "main" | "explore";

export type AgentProgressEvent =
  | {
    type: "pending";
    scope: ProgressScope;
  }
  | {
    type: "tool_start";
    scope: ProgressScope;
    toolName: ToolName;
    input: unknown;
  }
  | {
    type: "tool_done";
    scope: ProgressScope;
    toolName: ToolName;
    input: unknown;
    result: ToolResultEnvelope;
  };

export type AgentProgressListener = (event: AgentProgressEvent) => void;
