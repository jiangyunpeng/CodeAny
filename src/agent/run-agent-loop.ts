import { buildAssistantToolUseMessage, buildMessages, buildToolResultMessage, buildUserMessage } from "../context/message-builder";
import type { AgentProgressListener } from "./progress";
import { shapeTask } from "./task-shaper";
import { shouldUseExplore } from "./context-planner";
import { appendMessage, appendToolResult, type SessionState } from "./session";
import { MAIN_AGENT_SYSTEM_PROMPT } from "./system-prompts";
import { runExploreAgent } from "./subagents/explore-agent";
import type { ExploreReport } from "./subagents/explore-contract";
import type { Provider } from "../provider/anthropic";
import type { ToolContext, ToolName, ToolRegistry } from "../tools/registry";
import { ContextBudgetManager } from "../context/budget-manager";

export type RunAgentLoopInput = {
  prompt: string;
  session: SessionState;
  provider: Provider;
  registry: ToolRegistry;
  toolContext: ToolContext;
  onProgress?: AgentProgressListener;
  exploreAgent?: (
    prompt: string,
    ctx: ToolContext,
    provider: Provider,
    model: string,
    onProgress?: AgentProgressListener,
  ) => Promise<ExploreReport>;
  maxIterations?: number;
  debug?: boolean;
};

export type RunAgentLoopResult = {
  finalText: string;
  toolCalls: string[];
  usedExplore: boolean;
  session: SessionState;
  messagesSentToMainModel: string[];
};

export async function runAgentLoop(input: RunAgentLoopInput): Promise<RunAgentLoopResult> {
  let session = appendMessage(input.session, buildUserMessage(input.prompt));
  let usedExplore = false;
  const task = shapeTask(input.prompt);
  const toolCalls: string[] = [];
  const messagesSentToMainModel: string[] = [];
  const budgetManager = input.toolContext.budgetManager ?? new ContextBudgetManager();
  const exploreAgent = input.exploreAgent ?? runExploreAgent;

  if (shouldUseExplore({ userInput: input.prompt })) {
    const report = await exploreAgent(
      task.rewrittenTask,
      input.toolContext,
      input.provider,
      input.session.exploreModel ?? input.session.model,
      input.onProgress,
    );
    usedExplore = true;
    session = {
      ...session,
      latestExploreReport: report,
    };
    session = appendMessage(session, {
      role: "assistant",
      content: JSON.stringify({
        exploreReport: report,
      }),
    });
    session = appendMessage(session, buildUserMessage(
      `Above is the Explore subagent's findings. Now use these findings to fully answer the original question:\n${input.prompt}`,
    ));
  }

  const maxIterations = input.maxIterations ?? 8;
  const debug = input.debug ?? false;

  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    const messages = buildMessages(session.messages, budgetManager);
    messagesSentToMainModel.push(messages.map((message) => message.content).join("\n"));

    if (debug) {
      console.error(`\n===== [DEBUG] Iteration ${iteration} =====`);
      console.error(`[DEBUG] Total session messages: ${session.messages.length}`);
      console.error(`[DEBUG] Messages after budget clip: ${messages.length}`);
      for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];
        const contentPreview = typeof msg.content === "string"
          ? msg.content.slice(0, 200)
          : JSON.stringify(msg.content).slice(0, 200);
        console.error(`[DEBUG]   [${i}] role=${msg.role} name=${msg.name ?? "-"} chars=${msg.content.length} preview=${contentPreview}`);
      }
      console.error(`[DEBUG] ===== end =====\n`);
    }
    input.onProgress?.({
      type: "pending",
      scope: "main",
    });
    const response = await input.provider.send({
      model: session.model,
      messages,
      system: MAIN_AGENT_SYSTEM_PROMPT,
      tools: input.registry.listDefinitions(),
    });

    let sawToolUse = false;
    let sawDone = false;
    let iterationText = "";

    for await (const event of response.events) {
      if (event.type === "text") {
        iterationText += event.text;
        continue;
      }

      if (event.type === "tool_use") {
        sawToolUse = true;
        const toolName = event.name as ToolName;
        toolCalls.push(toolName);
        input.onProgress?.({
          type: "tool_start",
          scope: "main",
          toolName,
          input: event.input,
        });
        session = appendMessage(session, buildAssistantToolUseMessage({
          ...event,
          preambleText: iterationText,
        }));
        const toolResult = await input.registry.execute(toolName, event.input, input.toolContext);
        input.onProgress?.({
          type: "tool_done",
          scope: "main",
          toolName,
          input: event.input,
          result: toolResult,
        });
        session = appendToolResult(session, toolResult);
        session = appendMessage(session, buildToolResultMessage(toolResult, event.toolUseId));
        if (toolResult.status === "requires_approval") {
          const finalText = buildApprovalRequiredMessage(toolName, event.input, input.toolContext.approvalMode);
          session = appendMessage(session, {
            role: "assistant",
            content: finalText,
          });
          return {
            finalText,
            toolCalls,
            usedExplore,
            session,
            messagesSentToMainModel,
          };
        }
      }

      if (event.type === "done") {
        sawDone = true;
      }
    }

    if (!sawToolUse) {
      if (debug) {
        console.error(`[DEBUG] No tool use in iteration ${iteration}, final text (${iterationText.length} chars): ${iterationText.slice(0, 300)}`);
      }
      session = appendMessage(session, {
        role: "assistant",
        content: iterationText,
      });
      break;
    }
  }

  const finalAssistantMessage = [...session.messages].reverse().find((message) => message.role === "assistant");
  const finalText = finalAssistantMessage?.content ?? "";

  return {
    finalText,
    toolCalls,
    usedExplore,
    session,
    messagesSentToMainModel,
  };
}

function buildApprovalRequiredMessage(
  toolName: ToolName,
  toolInput: unknown,
  approvalMode: ToolContext["approvalMode"],
): string {
  const details = typeof toolInput === "object" && toolInput !== null ? toolInput as Record<string, unknown> : {};
  const modeHint = approvalMode === "default"
    ? "Re-run with --approval never or --yolo to allow it."
    : "Allow the action and try again.";

  if (toolName === "write_file") {
    const path = typeof details.path === "string" && details.path.length > 0 ? details.path : "the requested file";
    return `Action blocked: write_file for ${path} requires approval, so no file was created. ${modeHint}`;
  }

  if (toolName === "run_shell") {
    const command = typeof details.command === "string" && details.command.length > 0 ? details.command : "the requested shell command";
    return `Action blocked: run_shell for ${JSON.stringify(command)} requires approval, so nothing was executed. ${modeHint}`;
  }

  return `Action blocked: ${toolName} requires approval. ${modeHint}`;
}
