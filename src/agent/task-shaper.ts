export type TaskShape = {
  originalTask: string;
  rewrittenTask: string;
  keyQuestions: string[];
  searchIntent: string[];
};

/**
 * 对用户输入的任务进行分析和重塑，为后续的代码探索提供更结构化的信息
 * 
 * 主要功能：
 * 1. 识别任务类型
 *    - 检测用户输入是否包含"深入"、"全面"、"梳理"、"研究"、"analyze"、"trace"、"explore"等关键词
 *    - 判断这是一个广泛探索任务还是针对性查询
 * 
 * 2. 重写任务描述
 *    - 如果是广泛探索任务：生成 "Search the codebase thoroughly for: [原始输入]"
 *    - 如果是针对性任务：生成 "Search and inspect the relevant code for: [原始输入]"
 * 
 * 3. 生成关键问题列表
 *    - 默认问题：入口点在哪里？哪些文件最相关？
 *    - 如果是广泛任务或包含"调用链"：额外添加"哪些模块参与了调用流程？"
 * 
 * 4. 提取搜索意图
 *    - 将用户输入按空格分割成关键词
 *    - 去重后作为搜索意图列表
 * 
 * @param input - 用户输入的原始任务描述
 * @returns TaskShape 对象，包含：
 *   - originalTask: 原始任务（去除首尾空格）
 *   - rewrittenTask: 重写后的任务描述
 *   - keyQuestions: 关键问题列表
 *   - searchIntent: 搜索关键词列表
 */
export function shapeTask(input: string): TaskShape {
  const trimmed = input.trim();
  const lowered = trimmed.toLowerCase();
  const broad = /深入|全面|梳理|研究|analy|trace|explore/.test(trimmed);
  const rewrittenTask = broad
    ? `Search the codebase thoroughly for: ${trimmed}`
    : `Search and inspect the relevant code for: ${trimmed}`;

  const keyQuestions = [
    "Where is the entrypoint?",
    "Which files are most relevant?",
  ];
  if (broad || lowered.includes("调用链")) {
    keyQuestions.push("Which modules participate in the call flow?");
  }

  const searchIntent = Array.from(
    new Set(
      trimmed
        .split(/\s+/)
        .map((part) => part.trim())
        .filter(Boolean),
    ),
  );

  return {
    originalTask: trimmed,
    rewrittenTask,
    keyQuestions,
    searchIntent,
  };
}
