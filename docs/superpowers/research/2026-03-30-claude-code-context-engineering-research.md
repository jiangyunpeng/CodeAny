# Claude Code Context Engineering Research

**Date:** 2026-03-30

## 1. Research Goal

本次调研的目标不是研究 Claude Code 的全部实现，而是聚焦一个非常具体的问题：

- Claude Code 如何处理大体积工具输出
- 工具输出是否会被原样发送给 LLM
- 它如何避免 context 被搜索结果、目录列表、shell 日志等内容打爆
- 是否存在 `Explore` 一类的前置上下文收集机制

这份文档只记录本次实测得到的结论与推断，不代表官方实现说明。

## 2. Research Environment

实验目录：

- `/work/dist/branch/wacai/middleware/quantum-agent`

Claude Code 版本：

- `2.1.66`

本地 `claude` 路径：

- `/Users/bairen/.nvm/versions/node/v20.19.2/bin/claude`

本次真实观察到的主消息接口：

- `https://www.claudeide.net/api/anthropic/v1/messages?beta=true`

## 3. Research Method

本次实验一共用了三条路径。

### 3.1 CLI Debug Log

使用：

```bash
claude -p --verbose --output-format stream-json --debug api --debug-file <path>
```

目的：

- 观察 Claude Code 的本地事件流
- 确认 tool use / tool result 的顺序
- 确认是否有子代理

结论：

- 能看到本地结构化事件
- 能看到 `Agent`、`Grep`、`Glob`、`Bash` 等工具事件
- 但看不到完整 HTTP request body

### 3.2 MITM Proxy

尝试使用 `mitmproxy` 做 HTTPS 代理抓包。

目的：

- 直接抓 Claude Code 发往服务端的请求体

结论：

- Claude Code 的主消息流量没有按预期走环境代理
- 此方案没抓到主消息请求

### 3.3 Node Runtime Hook

最后采用了更直接的方法：在 Node 运行时注入 hook，拦截 `fetch` 与 `http/https.request`。

关键文件：

- [fetch_tap.cjs](/System/Volumes/Data/work/dist/branch/my/my-code/code-any/docs/superpowers/research/../../../../work/dist/branch/wacai/middleware/quantum-agent/.tmp/fetch_tap.cjs)

关键抓包输出：

- [/tmp/claude-fetch-log.jsonl](/tmp/claude-fetch-log.jsonl)
- [/tmp/claude-real-default-debug.log](/tmp/claude-real-default-debug.log)

这个方法最终拿到了真实 request body，是本次最关键的证据来源。

## 4. Research Prompt

用于观察复杂上下文收集行为的核心 prompt 是：

```text
你深入研究下 ，看下调用来源这个折线图是如何实现的
```

这是一个适合触发“广泛搜索 + 调用链分析 + 多轮工具执行”的问题。

## 5. Key Observations

## 5.1 Claude Code 会先做任务整形

用户输入是中文，但主模型没有直接开始粗暴搜索，而是先把任务改写成更适合执行的内部任务描述。

在事件流中可以看到类似内容：

- `Find call source chart implementation`
- `Search the codebase thoroughly for the "调用来源" (call source) line chart implementation`

这说明 Claude Code 在真正搜索前，先做了任务整形。

这个步骤的作用：

- 把模糊用户问题改成更结构化的检索任务
- 显式拆出搜索目标
- 为后续子代理提供更清晰的工作指令

## 5.2 复杂任务会先交给子代理

在主会话中观测到了：

- `name: "Agent"`
- `subagent_type: "Explore"`

也就是说，主 agent 没有直接自己展开所有搜索，而是先派发一个 `Explore` 型子代理。

这非常关键，说明 Claude Code 已经把“上下文收集”和“最终综合判断”分层了。

## 5.3 子代理使用了更便宜的模型

主会话模型：

- `claude-opus-4-6`

探索子代理模型：

- `claude-haiku-4-5-20251001`

这说明 Claude Code 不是让主模型承担所有检索成本，而是把搜索、列目录、广泛 grep 这类高噪声低价值工作下沉给更便宜的模型。

这个策略有两个直接好处：

- 降低成本
- 避免主模型上下文被低价值搜索噪声污染

## 5.4 工具结果会进入下一轮 messages

抓到的真实 request body 明确显示：

- `tool_result` 会作为 `messages` 的一部分继续发给服务端

这不是 UI 层的假象，而是真正进入了下一轮推理上下文。

在抓到的请求里能看到：

- `type":"tool_result"`
- `content":"No files found"`
- `content":"Found 50 files limit: 50, offset: 0 ..."`
- `content":"(Results are truncated. Consider using a more specific path or pattern.)"`

所以结论非常明确：

- Claude Code 不是完全在本地消费工具结果
- 工具结果确实会回灌给 LLM

## 5.5 但工具输出并不是无限原样透传

真正重要的点在于：

- Claude Code 会把工具结果回灌给模型
- 但很多工具在返回阶段就已经被限流和截断

这意味着它的核心策略更像：

- 工具层先裁剪
- 再把裁剪后的结果发给模型

而不是：

- 工具无限输出
- 发送前再靠一个万能摘要器统一压缩

## 6. Evidence of Tool-Level Truncation

本次观察到两个非常典型的工具结果形态。

### 6.1 Glob Result

在某一轮子代理里，`Glob` 返回了大量文件路径，并在结果末尾明确携带：

```text
(Results are truncated. Consider using a more specific path or pattern.)
```

这说明：

- `Glob` 工具本身存在结果上限
- 超限时不会静默裁剪
- 会给出下一步建议

### 6.2 Grep Result

在另一些轮次里，`Grep` 结果明确带：

```text
Found 50 files limit: 50, offset: 0
```

这说明：

- `Grep` 工具不是无限返回命中文件
- 它有显式的 `limit`
- 它会把截断状态通过结果文本暴露给模型

## 7. Evidence of Message Growth

抓到的几轮 request body 大小如下：

- 第一轮主请求：约 `106853` 字符
- 子代理后续轮次：
  - `78464`
  - `94181`
  - `96648`
  - `101480`
  - `117360`

随着工具结果不断累积，消息体确实会变大。

同时抓到：

- 第 23 个请求中有 `2` 个 `tool_result`
- 第 25 个请求中有 `5` 个 `tool_result`
- 第 27 个请求中有 `8` 个 `tool_result`
- 第 29 个请求中有 `11` 个 `tool_result`
- 第 31 个请求中有 `14` 个 `tool_result`

这说明 Claude Code **没有在每轮都把历史 tool result 完全压成一句摘要**。

它仍然保留了不少工具结果历史，只是这些结果本身已经经过了限制。

## 8. Most Important Conclusion

如果要用一句话概括本次调研结论：

**Claude Code 解决 context 爆炸的主要方式，不是发送前做一次统一大摘要，而是“任务整形 + Explore 子代理 + 工具级限流 + 截断后的 tool result 回灌”。**

更具体地说，它的路径更像：

1. 用户输入
2. 主模型重写任务
3. 复杂任务先进入 `Explore` 子代理
4. 子代理用便宜模型做广泛上下文收集
5. `Glob` / `Grep` / `Bash` 等工具在工具层就做上限控制
6. 被截断后的 `tool_result` 继续送给模型
7. 模型基于这些结果决定下一步精读或继续收缩范围

而不是：

1. 工具返回无限原始输出
2. 一个统一后处理层把所有内容再总结
3. 最后才送给模型

## 9. Implications for Our TypeScript Agent

这次调研对我们自己的 TS coding agent 有直接指导意义。

### 9.1 `search_code` 必须是定位工具

不要让 `search_code` 直接承担“把大量代码内容交给模型”的职责。

正确职责应该是：

- 找出候选路径
- 返回短 snippet
- 提示下一步用 `read_file`

### 9.2 `read_file` 才是精读工具

真正的代码阅读应该通过：

- 选中文件
- 限定行范围
- 精读局部上下文

### 9.3 要引入 `Explore` 子代理

复杂任务不应该让主 agent 一上来就承受：

- 广泛搜索
- 多轮噪声工具结果
- 目录遍历
- 候选文件筛选

正确做法是：

- 让 `Explore` 子代理先做上下文收集
- 主 agent 消费结构化的 `ExploreReport`

### 9.4 工具层必须自带预算和截断

重点不是“最后做摘要”，而是每个高风险工具都要有自己的输出边界。

尤其是：

- `search_code`
- `list_files`
- `run_shell`
- `diff_workspace`

### 9.5 要区分 raw output 和 model-visible output

这是最重要的工程原则之一。

同一个工具执行，至少应该有：

- `rawOutput`
- `modelVisibleOutput`

这样才能同时满足：

- 用户需要看到真实结果
- 模型只看到可控结果

## 10. Recommended Design Principles

基于本次调研，建议我们自己的 TS agent 明确采用以下原则：

### Principle 1

先任务整形，再开始搜索。

### Principle 2

复杂任务默认先进入 `Explore` 子代理。

### Principle 3

让便宜模型承担上下文收集，让主模型承担综合判断。

### Principle 4

搜索工具只负责定位，不负责大段内容搬运。

### Principle 5

所有高噪声工具都必须在工具层限流，而不是指望模型自己忽略噪声。

### Principle 6

每个大输出工具都必须返回显式的 `truncated` 语义和下一步建议。

### Principle 7

主会话不能直接并入子代理的全部原始搜索日志。

### Principle 8

统一的 `ContextBudgetManager` 必须成为消息构建前的硬门槛。

## 11. Local Artifacts

本次调研的主要本地证据文件：

- [/tmp/claude-fetch-log.jsonl](/tmp/claude-fetch-log.jsonl)
- [/tmp/claude-real-default-debug.log](/tmp/claude-real-default-debug.log)
- [/tmp/claude-real-debug.log](/tmp/claude-real-debug.log)

实验辅助脚本：

- [/work/dist/branch/wacai/middleware/quantum-agent/.tmp/fetch_tap.cjs](/work/dist/branch/wacai/middleware/quantum-agent/.tmp/fetch_tap.cjs)
- [/work/dist/branch/wacai/middleware/quantum-agent/.tmp/mitm_capture.py](/work/dist/branch/wacai/middleware/quantum-agent/.tmp/mitm_capture.py)

## 12. Security Note

抓到的 request log 中包含真实认证头。

因此：

- 不应把原始抓包文件提交到版本库
- 如果需要长期保留，应该先做脱敏
- 如果担心泄漏，建议删除抓包文件并轮换 token

## 13. Final Summary

本次调研最重要的启发是：

**上下文工程不能被当作“工具层之外的补丁”。它必须是 agent 架构中的核心能力。**

Claude Code 风格的 coding agent 想真正可用，必须从一开始就把以下能力内建进去：

- 任务整形
- `Explore` 子代理
- 模型分层
- 工具输出限流
- 截断协议
- 原始输出与模型可见输出分离
- 上下文预算控制

这也是为什么在我们的 TS 实现里，`ContextBudgetManager` 和 `Explore` 子代理应该与 `AgentLoop` 同等重要，而不是后补功能。
