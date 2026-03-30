import type { ApprovalMode } from "./approval";
import type { ExploreReport } from "./subagents/explore-contract";
import type { ToolResultEnvelope } from "../tools/registry";

export type AgentMessage = {
  role: "user" | "assistant" | "tool";
  content: string;
  name?: string;
};

export type SessionState = {
  cwd: string;
  model: string;
  exploreModel?: string;
  approvalMode: ApprovalMode;
  messages: AgentMessage[];
  latestExploreReport?: ExploreReport;
  recentToolResults: ToolResultEnvelope[];
  historySummary?: string;
};

export function createSessionState(input: {
  cwd: string;
  model: string;
  exploreModel?: string;
  approvalMode: ApprovalMode;
}): SessionState {
  return {
    cwd: input.cwd,
    model: input.model,
    exploreModel: input.exploreModel,
    approvalMode: input.approvalMode,
    messages: [],
    recentToolResults: [],
  };
}

export function appendMessage(session: SessionState, message: AgentMessage): SessionState {
  return {
    ...session,
    messages: [...session.messages, message],
  };
}

export function appendToolResult(session: SessionState, result: ToolResultEnvelope): SessionState {
  return {
    ...session,
    recentToolResults: [...session.recentToolResults.slice(-9), result],
  };
}
