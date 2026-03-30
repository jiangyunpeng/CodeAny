# Claude Code Like Agent Design

**Date:** 2026-03-30

**Goal:** 实现一个用 TypeScript 编写的终端式 coding agent，交互体验接近 Claude Code，支持 Anthropic Claude、流式输出、工具调用、工作区文件修改、shell 执行、`Explore` 上下文收集子代理，以及 `--yolo` 全自动模式。

## 1. Scope

本项目第一版是本地 CLI coding agent，不做 Web UI，不做浏览器自动化，不做远程执行。

第一版不是通用多 agent 协作系统，但**包含一个受控的、单职责的 `Explore` 子代理**，用于在主 agent 回答前先收集上下文，降低主会话 context 爆炸风险。

第一版必须支持：

- REPL 式对话交互
- Anthropic Messages API 流式响应
- agent loop
- 任务整形与上下文收集
- `Explore` 子代理
- 本地工具调用
- 工作区文件读写
- shell 命令执行
- diff 查看
- 默认确认模式
- `--yolo` 全自动模式

第一版明确不做：

- 多 provider 抽象
- 通用多 agent 编排系统
- 浏览器工具
- 远程沙箱
- 自动 git commit
- 长时后台任务编排

## 2. Product Behavior

程序启动后进入 REPL。用户可以输入自然语言任务，也可以使用 `/commands` 执行控制操作。

设计上，产品行为必须把“完成任务”和“控制上下文大小”视为同等重要目标。agent 不应默认把工具原始大输出直接灌回模型，而应优先通过任务整形、上下文分层和工具级裁剪来控制 token 消耗。

每轮交互遵循以下流程：

1. CLI 收集用户输入和会话上下文
2. `TaskShaper` 对用户任务进行整形，生成执行目标、关键词和初始搜索意图
3. `ContextPlanner` 判断是否需要先启用 `Explore` 子代理
4. 若需要，`Explore` 子代理使用受限工具集先进行上下文收集
5. 子代理输出结构化上下文摘要，而不是把原始搜索噪声全部交给主 agent
6. 主 agent 基于当前会话、子代理摘要和必要工具结果继续执行
7. 流式渲染模型输出
8. 如果模型发出 tool use，请求本地工具执行
9. 工具结果经过预算控制后回填给模型
10. 重复循环，直到模型输出最终答复

用户可见的产品行为：

- 模型文本按流式输出渲染
- 工具调用显示工具名、参数摘要、执行状态和结果摘要
- 当任务较复杂时，终端会显式显示正在进行上下文探索
- 默认模式下，危险操作需要确认
- `--yolo` 模式下，工具直接执行但仍保留显式日志
- 通过 `/diff` 查看当前工作区改动
- 当工具输出被截断时，明确显示截断信息和下一步建议

## 3. Architecture

第一版采用单进程架构，但保持清晰模块边界，避免后续演进时推倒重来。

设计原则不是“尽量少发 token”，而是“只把对当前推理真正有价值的信息发给模型”。这要求架构显式区分：

- 原始工具输出
- 面向用户的可见输出
- 面向模型的可见输出
- 可被会话持久化的摘要状态

### 3.1 Runtime Flow

- `REPL` 负责读取用户输入与命令
- `TaskShaper` 负责把用户自然语言输入改写为更可执行的内部任务描述
- `ContextPlanner` 负责判断是否需要先搜索、是否需要启用子代理、每轮剩余预算是否允许继续扩张上下文
- `ExploreAgent` 负责上下文收集和候选文件定位
- `AgentLoop` 负责驱动模型与工具之间的循环
- `AnthropicProvider` 负责请求 Claude 并把流式事件转换为内部事件
- `ToolRegistry` 负责工具注册、参数校验和执行
- `ContextBudgetManager` 负责限制每轮送入模型的上下文体积
- `ResultCompressor` 负责把工具结果转换为模型可消费的结构化摘要
- `ApprovalGate` 负责确认模式与 `--yolo` 模式的权限决策
- `SessionStore` 负责会话历史和运行时状态

### 3.2 Module Boundaries

建议目录结构如下：

```text
src/
  cli/
    repl.ts
    render.ts
    commands.ts
  agent/
    task-shaper.ts
    context-planner.ts
    run-agent-loop.ts
    session.ts
    approval.ts
    subagents/
      explore-agent.ts
      explore-contract.ts
  context/
    budget-manager.ts
    result-compressor.ts
    message-builder.ts
    truncation.ts
  provider/
    anthropic.ts
    stream.ts
  tools/
    registry.ts
    list-files.ts
    read-file.ts
    search-code.ts
    write-file.ts
    run-shell.ts
    diff-workspace.ts
  utils/
    fs.ts
    path.ts
    child-process.ts
    env.ts
    errors.ts
  index.ts
```

模块职责：

- `cli`：终端交互和命令解析
- `agent`：核心 loop、任务整形、会话状态、审批策略
- `context`：上下文工程能力，包括预算控制、工具结果转换和消息构建
- `provider`：Anthropic API 适配
- `tools`：独立工具实现
- `utils`：纯工具函数和错误包装

## 4. Context Engineering

上下文工程是本项目的一等公民，而不是实现细节。第一版需要明确遵守以下原则。

### 4.1 Core Principles

- 工具原始输出不等于模型输入
- 搜索工具负责“定位”，读取工具负责“精读”
- 先缩小范围，再扩大阅读范围
- 尽量让便宜模型或受限子代理承担大规模探索任务
- 每个工具都必须有稳定、可预测的输出上限
- 每一轮送入模型的消息都要经过预算检查

### 4.2 Raw Output vs Model-Visible Output

每次工具执行都要区分两份结果：

- `rawOutput`
  - 原始 stdout、原始 grep 命中、完整 diff 等
  - 用于终端展示、调试、日志或后续落盘
- `modelVisibleOutput`
  - 给模型看的裁剪版、结构化版结果
  - 必须稳定可控，不能无限增长

这两份结果可能完全一致，但对大输出工具通常不应一致。

### 4.3 Context Budget Manager

`ContextBudgetManager` 负责统一控制上下文大小，至少要管理：

- 单次工具结果可注入模型的最大字符数
- 单轮 agent loop 最大可新增上下文
- 单个消息块最大字符数
- 历史消息保留策略
- 截断后提示语

建议的第一版预算模型：

- `search_code` / `list_files` / `diff_workspace` / `run_shell` 默认注入上限独立配置
- 当前轮若预算不足，优先缩减工具结果，而不是截断用户输入
- 如果仍超限，触发消息压缩或只保留摘要

### 4.4 Truncation Protocol

所有可能产生大输出的工具都必须返回显式截断信号，而不是静默裁掉。

统一字段建议：

```ts
type TruncationMeta = {
  truncated: boolean;
  totalCount?: number;
  returnedCount?: number;
  totalChars?: number;
  returnedChars?: number;
  nextActionHint?: string;
};
```

当结果被裁剪时，模型可见输出必须带类似信息：

- 找到多少项
- 实际返回多少项
- 是否已截断
- 下一步应该怎么做

示例：

```json
{
  "truncated": true,
  "totalCount": 1832,
  "returnedCount": 20,
  "nextActionHint": "Use read_file on the most relevant paths."
}
```

### 4.5 Message Building

送给 Anthropic 的消息构建必须通过统一的 `message-builder.ts`，禁止业务代码直接拼接大段 tool result。

`message-builder.ts` 负责：

- 把工具结果转成 Anthropic tool result message
- 插入截断元数据
- 过滤掉用户不需要、模型也不需要的冗余字段
- 对历史消息进行裁剪或压缩

## 5. Explore SubAgent

`Explore` 子代理是第一版唯一内建的子代理类型，用来完成“先收集上下文，再让主 agent 决策”的阶段性工作。

### 5.1 Why Explore Exists

对复杂代码库，主 agent 直接从用户 prompt 开始调用 `search_code`、`glob`、`run_shell`，很容易发生：

- 搜索过宽，返回海量噪声
- 历史 tool result 快速堆积
- 主模型把大量 token 浪费在低价值定位工作上

`Explore` 子代理的目标是把这些工作前置并隔离。

### 5.2 Explore Responsibilities

`Explore` 子代理负责：

- 将用户问题改写成更适合检索的内部任务
- 做广度优先的代码定位
- 找出候选文件、候选模块、候选接口
- 输出结构化摘要供主 agent 使用

`Explore` 子代理不负责：

- 修改文件
- 执行高风险 shell
- 直接向用户输出最终答案
- 承担通用实现任务

### 5.3 Explore Output Contract

`Explore` 子代理返回的不是对话式长文，而是结构化上下文包。

建议结构：

```ts
type ExploreReport = {
  rewrittenTask: string;
  keyQuestions: string[];
  candidatePaths: Array<{
    path: string;
    reason: string;
    confidence: number;
  }>;
  searchSummary: Array<{
    tool: string;
    query: string;
    findings: string[];
    truncated: boolean;
  }>;
  recommendedNextReads: Array<{
    path: string;
    startLine?: number;
    endLine?: number;
    reason: string;
  }>;
  risks: string[];
};
```

主 agent 只消费 `ExploreReport`，而不是消费子代理期间的所有原始工具噪声。

### 5.4 Explore Trigger Rules

以下情况默认启用 `Explore`：

- 用户要求“深入研究”、“全面看看”、“梳理实现路径”
- 仓库较大且用户问题指向不明确
- 可能涉及多个模块、前后端联动、调用链追踪
- 初次搜索结果过多且存在明显截断

以下情况通常不启用：

- 单文件修改
- 已知路径上的定点解释
- 小范围 bugfix

### 5.5 Explore Model Strategy

第一版建议允许 `Explore` 使用比主 agent 更便宜或更快的模型。

原则：

- 主 agent 负责高价值综合判断
- `Explore` 负责低成本、高吞吐检索与定位

这既能降低成本，也能减少主上下文被低价值搜索噪声污染。

## 6. CLI UX

### 6.1 REPL

CLI 默认启动进入交互式 REPL，支持连续会话。

基础命令集：

- `/help`
- `/tools`
- `/model`
- `/approval`
- `/diff`
- `/clear`
- `/exit`

### 6.2 Startup Flags

第一版至少支持以下启动参数：

- `--model`
- `--approval`
- `--cwd`
- `--yolo`

其中：

- `--approval` 用于显式设置审批模式
- `--yolo` 是 `approval=never` 的快捷入口，语义更贴近 Claude Code 风格

### 6.3 Output Rendering

输出层遵循以下原则：

- 只展示必要状态，不展示推理链
- 工具执行前后输出结构化摘要
- 明确标识当前是否处于 `YOLO` 模式
- 对错误、超时、退出码、文件改动提供清晰反馈

## 7. Tooling

第一版工具集限定为 6 个：

### 7.1 `list_files`

职责：

- 浏览工作区目录
- 支持最大深度限制
- 支持 glob 过滤
- 返回结构化文件列表，而不是无限展开的纯文本
- 超出上限时返回截断元数据

### 7.2 `read_file`

职责：

- 读取单文件内容
- 支持行范围
- 返回带行号片段，方便模型引用
- 这是主要的“精读”工具，应优先替代大范围搜索结果直灌模型

### 7.3 `search_code`

职责：

- 基于 `rg` 搜索代码或文本
- 返回匹配文件、行号和短上下文片段
- 这是“定位型工具”，不是“内容搬运工具”

设计要求：

- 默认只返回 top N 结果
- 默认限制总字符数
- 优先去重，避免同一文件刷屏
- 必须返回截断元数据

建议返回结构：

```ts
type SearchCodeResult = {
  query: string;
  totalMatches: number;
  returnedMatches: number;
  truncated: boolean;
  matches: Array<{
    path: string;
    line: number;
    preview: string;
  }>;
  nextActionHint?: string;
};
```

### 7.4 `write_file`

职责：

- 新建或覆盖工作区文件
- 返回写入摘要与目标路径

### 7.5 `run_shell`

职责：

- 在当前工作区执行 shell 命令
- 捕获 `stdout`、`stderr`、退出码和超时状态
- 必须区分原始输出与模型可见输出
- 大输出时只返回摘要、头尾片段或落盘引用

### 7.6 `diff_workspace`

职责：

- 展示当前工作区改动
- 支持给模型自检
- 支持 `/diff` 命令复用
- 对大型 diff 默认只返回文件级摘要与局部片段

### 7.7 Tool Output Policy

以下工具默认可能产生大输出，因此必须走 `ResultCompressor`：

- `list_files`
- `search_code`
- `run_shell`
- `diff_workspace`

默认策略：

- 优先返回结构化摘要
- 优先返回 top N
- 优先提示下一步精读动作
- 明确暴露 `truncated`

## 8. Execution Policy

### 8.1 Default Mode

默认执行策略：

- 读操作直接执行
- `write_file` 需要确认
- `run_shell` 需要确认

### 8.2 YOLO Mode

`--yolo` 模式下：

- `write_file` 自动执行
- `run_shell` 自动执行
- 不再弹确认
- 终端必须持续显示当前处于 `YOLO` 模式
- 每次工具调用仍然打印审计信息，避免静默执行

## 9. Session Management

第一版会话状态本地持久化，至少包含：

- 当前工作目录
- 历史消息
- 当前模型
- 审批模式
- 最近一次工具执行结果
- 最近一次 `ExploreReport`
- 历史压缩摘要

上下文控制原则：

- 保持最近若干轮消息
- 避免无限膨胀
- 对陈旧历史优先压缩为摘要
- 保留最近几轮未压缩 tool result
- 子代理原始搜索日志不直接并入主会话

## 10. Prompting Strategy

主 agent 与 `Explore` 子代理的提示策略需要显式区分。

### 10.1 Main Agent Policy

主 agent 提示需要强调：

- 先定位，后精读
- 不要一次性读取太多文件
- 遇到截断时继续缩小范围
- 工具返回候选路径时，优先调用 `read_file`
- 不要把 `search_code` 当作全文阅读工具

### 10.2 Explore Agent Policy

`Explore` 子代理提示需要强调：

- 目标是收集上下文，不是给最终答案
- 优先搜索、列目录、读取少量关键片段
- 只输出候选路径、线索和后续阅读建议
- 尽量减少冗长解释
- 一旦发现结果过多，应主动收窄查询范围

## 11. Configuration

### 11.1 Environment

通过 `.env` 读取：

- `ANTHROPIC_API_KEY`

### 11.2 Optional Config

第一版允许配置：

- 默认模型
- `Explore` 子代理模型
- shell 超时时间
- 最大上下文消息数
- 默认审批模式
- 每类工具的输出预算
- 单轮上下文预算
- `Explore` 自动触发阈值

CLI 参数优先级高于配置文件。

## 12. Error Handling

错误处理按来源分层：

### 12.1 Provider Errors

- 配置错误：如 API Key 缺失，启动阶段直接失败
- 可恢复错误：超时、限流、临时网络错误，允许用户重试
- 协议错误：无法解析的模型事件，终止当前轮并输出诊断信息

### 12.2 Tool Errors

- 工具错误不应导致整个 REPL 崩溃
- 所有工具错误都转换为结构化结果回填模型
- `run_shell` 必须包含退出码、标准输出、标准错误和超时信息

### 12.3 Context Engineering Errors

- 若工具结果过大，必须返回受控截断结果，而不是抛异常
- 若消息构建阶段预算超限，必须回退到摘要模式
- 若 `Explore` 子代理失败，主 agent 仍可退回本地直接工具模式
- 若子代理返回结果不合法，主 agent 只能消费校验通过的结构化字段

### 12.4 User Safety Feedback

- 文件写入前展示路径和摘要
- shell 执行前展示命令摘要
- `YOLO` 模式下展示更醒目的风险状态

## 13. Security Boundaries

第一版安全边界如下：

- 默认仅在当前工作目录工作
- 文件工具不允许越界访问工作区外路径
- shell 命令在当前工作目录执行
- 不提供远程执行能力
- 不提供自动 git 写操作
- `Explore` 子代理默认只拥有只读工具集
- 子代理不允许继承写文件与执行危险 shell 的能力

## 14. Testing Strategy

测试分为三层：

### 14.1 Unit Tests

覆盖：

- 命令解析
- 审批策略
- 工具参数校验
- 路径边界校验
- provider 事件映射
- 截断逻辑
- 预算计算逻辑
- `ExploreReport` 校验逻辑

### 14.2 Integration Tests

覆盖完整 agent loop：

- 用户输入
- provider 返回 tool use
- 本地工具执行
- 工具结果回填
- 最终答复输出
- `Explore` 子代理参与的两阶段流程
- 大输出工具结果被截断后仍能继续推进任务

### 14.3 Safe Testing for Shell

- `run_shell` 使用 mock runner 或受控 fixture
- 禁止测试中执行真实危险命令

### 14.4 Context Explosion Regression Tests

必须补一组专门的上下文工程回归测试，验证：

- `search_code` 命中海量文件时不会把原始全文注入模型
- `list_files` 超大目录返回可控结果
- `run_shell` 大日志不会直接灌满上下文
- `Explore` 子代理的原始结果不会原样并入主会话
- 多轮 `tool_result` 累积时，历史消息仍受预算控制

## 15. Implementation Priorities

建议实现顺序：

1. 初始化 TypeScript CLI 工程
2. 实现 REPL 和 `/commands`
3. 实现 Anthropic provider 流式封装
4. 实现 `ContextBudgetManager` 与 `message-builder`
5. 实现工具注册和 6 个基础工具
6. 重构 `search_code` 为定位型工具
7. 实现 `Explore` 子代理及其输出契约
8. 实现 `AgentLoop`
9. 实现审批模式与 `--yolo`
10. 实现会话持久化
11. 补齐上下文工程测试和文档

## 16. Acceptance Criteria

当满足以下条件时，第一版视为完成：

- 可以通过 CLI 启动并连接 Anthropic Claude
- 可以在 REPL 中执行自然语言 coding 任务
- 模型可以调用本地工具完成文件读取、搜索、写入和 shell 执行
- 复杂任务会优先通过 `Explore` 子代理收集上下文
- 大输出工具结果不会无限注入模型
- `search_code` 只承担定位职责，精读依赖 `read_file`
- 所有大输出工具都带显式截断语义
- 默认模式下危险操作会确认
- `--yolo` 模式下危险操作自动执行
- 用户可以通过 `/diff` 查看改动
- 关键流程有自动化测试覆盖
