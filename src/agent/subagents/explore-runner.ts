import { buildAssistantToolUseMessage, buildMessages, buildToolResultMessage, buildUserMessage } from "../../context/message-builder";
import { ContextBudgetManager } from "../../context/budget-manager";
import type { Provider } from "../../provider/anthropic";
import type { ToolContext, ToolName } from "../../tools/registry";
import type { AgentProgressListener } from "../progress";
import { shapeTask } from "../task-shaper";
import { EXPLORE_AGENT_SYSTEM_PROMPT } from "../system-prompts";
import type { ExploreReport } from "./explore-contract";
import { parseExploreReportOutput } from "./explore-parser";
import { createExploreToolRegistry } from "./explore-tools";
import type { AgentMessage } from "../session";

/**
 * 运行一个专门用于代码探索的子代理，通过只读工具来探索代码库并生成结构化的探索报告
 * 
 * 主要功能：
 * 1. 任务准备
 *    - 使用 shapeTask() 分析和重塑用户输入的任务
 *    - 创建专门的探索工具注册表（只包含只读工具）
 *    - 设置上下文预算管理器（限制历史消息数为 8）
 * 
 * 2. 迭代探索循环（默认最多 6 次迭代）
 *    - 向 AI 模型发送请求，使用专门的 EXPLORE_AGENT_SYSTEM_PROMPT
 *    - 处理模型响应的事件流（文本和工具调用）
 *    - 执行只读工具（如 list_files、read_file、search_code 等）
 *    - 收集工具执行结果并添加到消息历史
 * 
 * 3. 生成探索报告
 *    - 当模型不再调用工具时，解析输出文本生成 ExploreReport
 *    - 报告包含：
 *      - rewrittenTask: 重写后的任务
 *      - keyQuestions: 关键问题列表
 *      - candidatePaths: 候选文件路径及其相关性
 *      - searchSummary: 搜索工具使用摘要
 *      - recommendedNextReads: 推荐进一步阅读的代码段
 *      - risks: 潜在风险
 * 
 * 4. 安全保障
 *    - 强制设置 approvalMode: "never"，确保探索过程不会修改任何文件
 *    - 只使用只读工具，避免对代码库造成任何影响
 * 
 * 核心价值：在主代理执行任务前，先快速探索代码库，收集相关上下文信息，
 * 帮助主代理更准确地理解代码结构和定位相关文件
 * 
 * @param input - 探索子代理的输入参数
 * @param input.prompt - 用户输入的原始任务描述
 * @param input.model - 使用的 AI 模型名称
 * @param input.provider - AI 服务提供者
 * @param input.toolContext - 工具执行上下文
 * @param input.onProgress - 进度监听器（可选）
 * @param input.maxIterations - 最大迭代次数（默认 6）
 * @returns ExploreReport 探索报告对象
 */
export async function runExploreSubagent(input: {
  prompt: string;
  model: string;
  provider: Provider;
  toolContext: ToolContext;
  onProgress?: AgentProgressListener;
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
    input.onProgress?.({
      type: "pending",
      scope: "explore",
    });
    const response = await input.provider.send({
      model: input.model,
      messages: buildMessages(messages, budgetManager),
      system: EXPLORE_AGENT_SYSTEM_PROMPT,
      tools: registry.listDefinitions(),
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
        const toolName = event.name as ToolName;
        input.onProgress?.({
          type: "tool_start",
          scope: "explore",
          toolName,
          input: event.input,
        });
        messages = [...messages, buildAssistantToolUseMessage({
          ...event,
          preambleText: outputText,
        })];
        const toolResult = await registry.execute(toolName, event.input, {
          ...input.toolContext,
          approvalMode: "never",
        });
        input.onProgress?.({
          type: "tool_done",
          scope: "explore",
          toolName,
          input: event.input,
          result: toolResult,
        });
        messages = [...messages, buildToolResultMessage(toolResult, event.toolUseId)];
        outputText = "";
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
