# Issue #001: Agent 多轮工具调用后"失忆"，反问用户而不回答问题

## 现象

用户输入 `"你看下调用来源这个折线图是如何实现的"`，agent 经过 6-7 轮工具调用（list_files、search_code、read_file）后，输出：

> 现在我对代码结构有了清晰的了解。你想继续做什么？是有具体的问题要排查，还是要新增/修改某个功能？

而不是综合工具调用结果回答用户的问题。

对比 pi-coding-agent 在相同场景下能正确给出完整的实现分析。

## 根因

`ContextBudgetManager.clipHistory` 使用 `messages.slice(-12)` 做简单截尾裁剪。

每轮工具调用产生 2 条消息（assistant tool_use + tool result），6 轮就是 12 条。加上最初的 user 消息共 13 条时，`slice(-12)` 把第一条 user 消息（用户的原始问题）挤出了上下文窗口。

模型看不到用户问了什么，自然无法回答，只能选择最"安全"的输出——反问用户。

### 消息流对比

修复前 Iteration 6（13 条 → clip 到 12 条）：
```
[0] assistant  list_files(.)           ← 用户问题被裁掉了！
[1] tool       list_files result
[2] assistant  list_files(console)
...
```

修复后 Iteration 6（13 条 → clip 到 13 条，含 first user）：
```
[0] user       "你看下调用来源这个折线图是如何实现的"  ← 始终保留
[1] tool       list_files result
[2] assistant  list_files(console)
...
```

## 修复

### 1. clipHistory 智能裁剪（核心修复）

`src/context/budget-manager.ts`

- 始终保留第一条 user 消息（原始问题）
- 从尾部往前找安全切入点，确保不会把 assistant/tool 消息对拆开（拆开会导致 Anthropic API 返回 400 "Improperly formed request"）

### 2. Explore 子代理后重申问题

`src/agent/run-agent-loop.ts`

Explore 报告注入为 assistant 消息后，追加一条 user 消息重申原始问题。防止主模型把 Explore 输出当成自己的回复，以为任务已完成。

### 3. System prompt 精简

`src/agent/system-prompts.ts`

- 砍掉抽象的 context engineering 术语（bounded context growth、truncation metadata 等），减少模型认知负担
- 加入明确指令：`"ALWAYS answer the user's original question directly. NEVER stop at exploration and ask the user what to do next"`
- 补充语言匹配规则、exploreReport 使用指引、Explore schema 字段说明

### 4. max_tokens 提升

`src/provider/anthropic.ts`

从 `2_048` 提升到 `8_192`，给模型足够的输出空间写完整分析。

### 5. 新增 --debug 标志和诊断测试

- `--debug` CLI 标志：打印每轮发送给模型的消息摘要（role、chars、preview）
- `tests/integration/debug-message-flow.test.ts`：模拟完整的 7 轮工具调用序列，验证用户原始问题在每一轮都存在

## 涉及文件

- `src/context/budget-manager.ts` — clipHistory 裁剪逻辑
- `src/agent/run-agent-loop.ts` — Explore 后重申问题 + debug 日志
- `src/agent/system-prompts.ts` — 主 agent 和 Explore 的 system prompt
- `src/provider/anthropic.ts` — max_tokens
- `src/utils/env.ts` — --debug CLI 标志
- `src/cli/repl.ts` — debug 透传
- `src/index.ts` — debug 透传
- `tests/integration/debug-message-flow.test.ts` — 诊断测试

## 教训

1. Context window 裁剪必须保留"锚点消息"（用户原始问题），简单的 FIFO 截尾在 agent loop 场景下是致命的
2. 裁剪时必须尊重消息对的完整性（assistant tool_use 和 tool result 不能拆开）
3. System prompt 的措辞优化无法弥补结构性的 context 丢失问题——模型看不到的信息，再好的 prompt 也救不回来
4. 加 debug 日志打印实际发送给模型的消息是排查此类问题的最有效手段
