import { buildMessages, buildToolResultMessage, buildUserMessage } from "../context/message-builder";
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
  exploreAgent?: (prompt: string, ctx: ToolContext, provider: Provider, model: string) => Promise<ExploreReport>;
  maxIterations?: number;
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
  }

  let finalText = "";
  const maxIterations = input.maxIterations ?? 8;

  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    const messages = buildMessages(session.messages, budgetManager);
    messagesSentToMainModel.push(messages.map((message) => message.content).join("\n"));
    const response = await input.provider.send({
      model: session.model,
      messages,
      system: MAIN_AGENT_SYSTEM_PROMPT,
    });

    let sawToolUse = false;
    let sawDone = false;

    for await (const event of response.events) {
      if (event.type === "text") {
        finalText += event.text;
        continue;
      }

      if (event.type === "tool_use") {
        sawToolUse = true;
        toolCalls.push(event.name);
        const toolResult = await input.registry.execute(event.name as ToolName, event.input, input.toolContext);
        session = appendToolResult(session, toolResult);
        session = appendMessage(session, buildToolResultMessage(toolResult));
      }

      if (event.type === "done") {
        sawDone = true;
      }
    }

    if (!sawToolUse) {
      session = appendMessage(session, {
        role: "assistant",
        content: finalText,
      });
      break;
    }

    if (sawDone && finalText) {
      session = appendMessage(session, {
        role: "assistant",
        content: finalText,
      });
      break;
    }
  }

  return {
    finalText,
    toolCalls,
    usedExplore,
    session,
    messagesSentToMainModel,
  };
}
