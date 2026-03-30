import { buildMessages, buildToolResultMessage, buildUserMessage } from "../../context/message-builder";
import { ContextBudgetManager } from "../../context/budget-manager";
import type { Provider } from "../../provider/anthropic";
import type { ToolContext, ToolName } from "../../tools/registry";
import { shapeTask } from "../task-shaper";
import { EXPLORE_AGENT_SYSTEM_PROMPT } from "../system-prompts";
import type { ExploreReport } from "./explore-contract";
import { parseExploreReportOutput } from "./explore-parser";
import { createExploreToolRegistry } from "./explore-tools";
import type { AgentMessage } from "../session";

export async function runExploreSubagent(input: {
  prompt: string;
  model: string;
  provider: Provider;
  toolContext: ToolContext;
  maxIterations?: number;
}): Promise<ExploreReport> {
  const task = shapeTask(input.prompt);
  const registry = createExploreToolRegistry();
  const budgetManager = new ContextBudgetManager({
    ...input.toolContext.budgetManager.budgets,
    maxHistoryMessages: 8,
  });
  let messages: AgentMessage[] = [
    buildUserMessage(buildExploreUserPrompt(task.rewrittenTask)),
  ];
  const maxIterations = input.maxIterations ?? 6;

  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    const response = await input.provider.send({
      model: input.model,
      messages: buildMessages(messages, budgetManager),
      system: EXPLORE_AGENT_SYSTEM_PROMPT,
    });

    let sawToolUse = false;
    let outputText = "";

    for await (const event of response.events) {
      if (event.type === "text") {
        outputText += event.text;
        continue;
      }

      if (event.type === "tool_use") {
        sawToolUse = true;
        const toolResult = await registry.execute(event.name as ToolName, event.input, {
          ...input.toolContext,
          approvalMode: "never",
        });
        messages = [...messages, buildToolResultMessage(toolResult)];
      }
    }

    if (!sawToolUse) {
      return parseExploreReportOutput({
        text: outputText,
        rewrittenTask: task.rewrittenTask,
        keyQuestions: task.keyQuestions,
      });
    }

    if (outputText.trim()) {
      messages = [...messages, {
        role: "assistant",
        content: outputText,
      }];
    }
  }

  return parseExploreReportOutput({
    text: "",
    rewrittenTask: task.rewrittenTask,
    keyQuestions: task.keyQuestions,
  });
}

function buildExploreUserPrompt(rewrittenTask: string): string {
  return [
    `Task: ${rewrittenTask}`,
    "",
    "Explore the codebase using only read-only tools.",
    "Return ONLY a JSON object matching this shape:",
    "{",
    '  "rewrittenTask": "string",',
    '  "keyQuestions": ["string"],',
    '  "candidatePaths": [{"path":"string","reason":"string","confidence":0.0}],',
    '  "searchSummary": [{"tool":"string","query":"string","findings":["string"],"truncated":false}],',
    '  "recommendedNextReads": [{"path":"string","startLine":1,"endLine":10,"reason":"string"}],',
    '  "risks": ["string"]',
    "}",
  ].join("\n");
}
