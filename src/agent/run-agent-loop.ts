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
  // 1. 初始化会话状态和相关变量
  let session = appendMessage(input.session, buildUserMessage(input.prompt));
  let usedExplore = false;
  const task = shapeTask(input.prompt);
  const toolCalls: string[] = [];
  const messagesSentToMainModel: string[] = [];
  const budgetManager = input.toolContext.budgetManager ?? new ContextBudgetManager();
  const exploreAgent = input.exploreAgent ?? runExploreAgent;

  // 2. 判断是否需要使用 Explore 子代理进行上下文探索
  if (shouldUseExplore({ userInput: input.prompt })) {
    // 2.1 运行 Explore 子代理，收集代码库上下文信息
    const report = await exploreAgent(
      task.rewrittenTask,
      input.toolContext,
      input.provider,
      input.session.exploreModel ?? input.session.model,
      input.onProgress,
    );
    usedExplore = true;
    // 2.2 将探索报告保存到会话状态
    session = {
      ...session,
      latestExploreReport: report,
    };
    // 2.3 将探索结果添加到消息历史
    session = appendMessage(session, {
      role: "assistant",
      content: JSON.stringify({
        exploreReport: report,
      }),
    });
    // 2.4 添加提示消息，引导主代理使用探索结果回答问题
    session = appendMessage(session, buildUserMessage(
      `Above is the Explore subagent's findings. Now use these findings to fully answer the original question:\n${input.prompt}`,
    ));
  }

  // 3. 设置迭代参数
  const maxIterations = input.maxIterations ?? 8;
  const debug = input.debug ?? false;

  // 4. 进入主循环，最多执行 maxIterations 次迭代
  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    // 4.1 构建消息列表（应用上下文预算管理）
    const messages = buildMessages(session.messages, budgetManager);
    messagesSentToMainModel.push(messages.map((message) => message.content).join("\n"));

    // 4.2 如果开启调试模式，输出详细的消息信息
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

    // 4.3 通知进度监听器：主代理正在等待响应
    input.onProgress?.({
      type: "pending",
      scope: "main",
    });

    // 4.4 向 AI 模型发送请求
    const response = await input.provider.send({
      model: session.model,
      messages,
      system: MAIN_AGENT_SYSTEM_PROMPT,
      tools: input.registry.listDefinitions(),
    });

    // 4.5 初始化本次迭代的状态变量
    let sawToolUse = false;
    let sawDone = false;
    let iterationText = "";

    // 4.6 处理模型响应的事件流
    for await (const event of response.events) {
      // 4.6.1 处理文本响应事件
      if (event.type === "text") {
        iterationText += event.text;
        continue;
      }

      // 4.6.2 处理工具调用事件
      if (event.type === "tool_use") {
        sawToolUse = true;
        const toolName = event.name as ToolName;
        toolCalls.push(toolName);
        // 4.6.2.1 通知进度监听器：工具开始执行
        input.onProgress?.({
          type: "tool_start",
          scope: "main",
          toolName,
          input: event.input,
        });
        // 4.6.2.2 将工具调用消息添加到会话
        session = appendMessage(session, buildAssistantToolUseMessage({
          ...event,
          preambleText: iterationText,
        }));
        // 4.6.2.3 执行工具
        const toolResult = await input.registry.execute(toolName, event.input, input.toolContext);
        // 4.6.2.4 通知进度监听器：工具执行完成
        input.onProgress?.({
          type: "tool_done",
          scope: "main",
          toolName,
          input: event.input,
          result: toolResult,
        });
        // 4.6.2.5 将工具结果添加到会话
        session = appendToolResult(session, toolResult);
        session = appendMessage(session, buildToolResultMessage(toolResult, event.toolUseId));
        // 4.6.2.6 如果工具需要审批，提前返回
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

      // 4.6.3 处理完成事件
      if (event.type === "done") {
        sawDone = true;
      }
    }

    // 4.7 如果本次迭代没有工具调用，说明代理已完成任务
    if (!sawToolUse) {
      if (debug) {
        console.error(`[DEBUG] No tool use in iteration ${iteration}, final text (${iterationText.length} chars): ${iterationText.slice(0, 300)}`);
      }
      // 4.7.1 将最终文本添加到会话并退出循环
      session = appendMessage(session, {
        role: "assistant",
        content: iterationText,
      });
      break;
    }
  }

  // 5. 提取最终的助手回复文本
  const finalAssistantMessage = [...session.messages].reverse().find((message) => message.role === "assistant");
  const finalText = finalAssistantMessage?.content ?? "";

  // 6. 返回执行结果
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
