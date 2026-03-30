# Claude Code Like Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一个本地 TypeScript CLI coding agent，具备 Claude Code 风格的 REPL、Anthropic 流式响应、6 个本地工具、`Explore` 子代理、上下文预算控制，以及默认确认和 `--yolo` 两种执行模式。

**Architecture:** 采用单进程 Node.js CLI 架构，按 `cli`、`agent`、`context`、`provider`、`tools`、`utils` 分层。核心约束是把“原始工具输出”和“模型可见输出”彻底分离，并让 `ContextBudgetManager`、`message-builder`、`ExploreReport` 成为主 loop 的硬边界，而不是后补逻辑。

**Tech Stack:** Node.js 20、TypeScript、`@anthropic-ai/sdk`、`zod`、`vitest`、`tsx`

---

## Scope Check

这份 spec 虽然覆盖 CLI、provider、context engineering、tools、subagent、session 等多个模块，但它们共同服务于同一个本地 coding agent 产品边界，不需要拆成多个独立 plans。实施时仍按可独立验证的任务分块，每个任务都能形成可运行、可测试、可提交的增量。

## Planned File Structure

### Workspace / Tooling

- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `.gitignore`
- Create: `.env.example`

### CLI

- Create: `src/index.ts`
- Create: `src/cli/repl.ts`
- Create: `src/cli/render.ts`
- Create: `src/cli/commands.ts`

### Agent

- Create: `src/agent/task-shaper.ts`
- Create: `src/agent/context-planner.ts`
- Create: `src/agent/run-agent-loop.ts`
- Create: `src/agent/session.ts`
- Create: `src/agent/approval.ts`
- Create: `src/agent/subagents/explore-contract.ts`
- Create: `src/agent/subagents/explore-agent.ts`

### Context

- Create: `src/context/budget-manager.ts`
- Create: `src/context/result-compressor.ts`
- Create: `src/context/message-builder.ts`
- Create: `src/context/truncation.ts`

### Provider

- Create: `src/provider/anthropic.ts`
- Create: `src/provider/stream.ts`

### Tools

- Create: `src/tools/registry.ts`
- Create: `src/tools/list-files.ts`
- Create: `src/tools/read-file.ts`
- Create: `src/tools/search-code.ts`
- Create: `src/tools/write-file.ts`
- Create: `src/tools/run-shell.ts`
- Create: `src/tools/diff-workspace.ts`

### Utils

- Create: `src/utils/fs.ts`
- Create: `src/utils/path.ts`
- Create: `src/utils/child-process.ts`
- Create: `src/utils/env.ts`
- Create: `src/utils/errors.ts`

### Tests

- Create: `tests/cli/commands.test.ts`
- Create: `tests/cli/repl.test.ts`
- Create: `tests/agent/approval.test.ts`
- Create: `tests/agent/task-shaper.test.ts`
- Create: `tests/agent/context-planner.test.ts`
- Create: `tests/agent/explore-contract.test.ts`
- Create: `tests/context/budget-manager.test.ts`
- Create: `tests/context/result-compressor.test.ts`
- Create: `tests/context/message-builder.test.ts`
- Create: `tests/provider/anthropic.test.ts`
- Create: `tests/tools/list-files.test.ts`
- Create: `tests/tools/read-file.test.ts`
- Create: `tests/tools/search-code.test.ts`
- Create: `tests/tools/write-file.test.ts`
- Create: `tests/tools/run-shell.test.ts`
- Create: `tests/tools/diff-workspace.test.ts`
- Create: `tests/integration/agent-loop.test.ts`
- Create: `tests/integration/explore-flow.test.ts`
- Create: `tests/integration/context-regression.test.ts`

## Implementation Notes

- 先把 `search_code`、`list_files`、`run_shell`、`diff_workspace` 设计成“默认截断且可提示下一步”的高噪声工具。
- `read_file` 是精读工具，优先支持行范围和带行号片段。
- `Explore` 子代理只拿只读工具集，只返回结构化 `ExploreReport`。
- 所有发给模型的消息都必须经由 `message-builder.ts`，业务代码禁止直拼工具结果。
- shell 测试必须用 mock runner 或 fixture，不能执行真实危险命令。

### Task 1: Bootstrap TypeScript CLI Workspace

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `src/index.ts`
- Test: `tests/cli/commands.test.ts`

- [ ] **Step 1: Write the failing command parser test**

```ts
import { describe, expect, it } from "vitest";
import { parseCliCommand } from "../../src/cli/commands";

describe("parseCliCommand", () => {
  it("parses /help as a built-in command", () => {
    expect(parseCliCommand("/help")).toEqual({
      kind: "command",
      name: "help",
      args: [],
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/cli/commands.test.ts -t "parses /help as a built-in command"`
Expected: FAIL with `Cannot find module '../../src/cli/commands'`

- [ ] **Step 3: Scaffold the project and minimal parser entrypoint**

```ts
export function parseCliCommand(input: string) {
  if (input.startsWith("/")) {
    const [name, ...args] = input.slice(1).trim().split(/\s+/);
    return { kind: "command", name, args };
  }

  return { kind: "prompt", text: input };
}
```

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `npm run test -- tests/cli/commands.test.ts -t "parses /help as a built-in command"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add package.json tsconfig.json vitest.config.ts .gitignore .env.example src/index.ts src/cli/commands.ts tests/cli/commands.test.ts
git commit -m "chore: scaffold typescript cli workspace"
```

### Task 2: Build REPL, Render Pipeline, and Slash Commands

**Files:**
- Modify: `src/index.ts`
- Create: `src/cli/repl.ts`
- Create: `src/cli/render.ts`
- Modify: `src/cli/commands.ts`
- Test: `tests/cli/repl.test.ts`

- [ ] **Step 1: Write the failing REPL interaction test**

```ts
it("renders help output for /help and exits on /exit", async () => {
  const output = await runReplScript(["/help", "/exit"]);
  expect(output).toContain("/tools");
  expect(output).toContain("Goodbye");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/cli/repl.test.ts -t "renders help output for /help and exits on /exit"`
Expected: FAIL with `runReplScript is not defined` or missing `src/cli/repl`

- [ ] **Step 3: Implement the minimal REPL and renderer**

```ts
export async function handleCommand(name: string): Promise<string> {
  if (name === "help") {
    return ["/help", "/tools", "/model", "/approval", "/diff", "/clear", "/exit"].join("\n");
  }

  if (name === "exit") {
    return "Goodbye";
  }

  return `Unknown command: /${name}`;
}
```

- [ ] **Step 4: Run the REPL test**

Run: `npm run test -- tests/cli/repl.test.ts -t "renders help output for /help and exits on /exit"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/index.ts src/cli/repl.ts src/cli/render.ts src/cli/commands.ts tests/cli/repl.test.ts
git commit -m "feat: add repl shell and slash commands"
```

### Task 3: Add Config Loading, Session State, and Approval Policy

**Files:**
- Create: `src/utils/env.ts`
- Create: `src/agent/session.ts`
- Create: `src/agent/approval.ts`
- Modify: `src/index.ts`
- Modify: `src/cli/repl.ts`
- Test: `tests/agent/approval.test.ts`

- [ ] **Step 1: Write failing tests for approval modes and env validation**

```ts
it("requires confirmation for write_file in default mode", () => {
  expect(shouldAutoApprove("default", "write_file")).toBe(false);
});

it("auto-approves shell in yolo mode", () => {
  expect(shouldAutoApprove("never", "run_shell")).toBe(true);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- tests/agent/approval.test.ts`
Expected: FAIL with missing `shouldAutoApprove`

- [ ] **Step 3: Implement config/session/approval primitives**

```ts
export type ApprovalMode = "default" | "never";

export function shouldAutoApprove(mode: ApprovalMode, toolName: string): boolean {
  if (mode === "never") {
    return toolName === "write_file" || toolName === "run_shell";
  }

  return false;
}
```

- [ ] **Step 4: Run approval tests**

Run: `npm run test -- tests/agent/approval.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/env.ts src/agent/session.ts src/agent/approval.ts src/index.ts src/cli/repl.ts tests/agent/approval.test.ts
git commit -m "feat: add config loading session state and approval policy"
```

### Task 4: Implement Anthropic Streaming Provider Abstraction

**Files:**
- Create: `src/provider/stream.ts`
- Create: `src/provider/anthropic.ts`
- Modify: `src/utils/env.ts`
- Test: `tests/provider/anthropic.test.ts`

- [ ] **Step 1: Write the failing provider event mapping test**

```ts
it("maps anthropic stream events into internal output events", async () => {
  const events = await collectProviderEvents(mockAnthropicStream([
    { type: "content_block_delta", delta: { type: "text_delta", text: "hi" } },
    { type: "message_stop" },
  ]));

  expect(events).toEqual([
    { type: "text", text: "hi" },
    { type: "done" },
  ]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/provider/anthropic.test.ts -t "maps anthropic stream events into internal output events"`
Expected: FAIL with missing provider adapter

- [ ] **Step 3: Implement the stream adapter and provider wrapper**

```ts
export function mapAnthropicEvent(event: AnthropicEvent): ProviderEvent[] {
  if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
    return [{ type: "text", text: event.delta.text }];
  }

  if (event.type === "message_stop") {
    return [{ type: "done" }];
  }

  return [];
}
```

- [ ] **Step 4: Run provider tests**

Run: `npm run test -- tests/provider/anthropic.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/provider/stream.ts src/provider/anthropic.ts src/utils/env.ts tests/provider/anthropic.test.ts
git commit -m "feat: add anthropic streaming provider"
```

### Task 5: Build Truncation, Result Compression, and Message Builder

**Files:**
- Create: `src/context/truncation.ts`
- Create: `src/context/budget-manager.ts`
- Create: `src/context/result-compressor.ts`
- Create: `src/context/message-builder.ts`
- Test: `tests/context/budget-manager.test.ts`
- Test: `tests/context/result-compressor.test.ts`
- Test: `tests/context/message-builder.test.ts`

- [ ] **Step 1: Write the failing truncation and message budget tests**

```ts
it("marks large search results as truncated", () => {
  const result = truncateItems(["a", "b", "c"], { maxItems: 2 });
  expect(result.meta).toMatchObject({ truncated: true, totalCount: 3, returnedCount: 2 });
});

it("drops oversized raw output before building model-visible tool_result", () => {
  const message = buildToolResultMessage({
    toolName: "run_shell",
    modelVisibleOutput: "head\n...\ntail",
    rawOutput: "x".repeat(20_000),
  });

  expect(JSON.stringify(message)).not.toContain("x".repeat(1000));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- tests/context/budget-manager.test.ts tests/context/result-compressor.test.ts tests/context/message-builder.test.ts`
Expected: FAIL with missing truncation/message-builder modules

- [ ] **Step 3: Implement context budget and tool-result shaping**

```ts
export type TruncationMeta = {
  truncated: boolean;
  totalCount?: number;
  returnedCount?: number;
  totalChars?: number;
  returnedChars?: number;
  nextActionHint?: string;
};

export function buildToolResultMessage(input: ToolResultEnvelope) {
  return {
    type: "tool_result",
    tool_name: input.toolName,
    content: {
      summary: input.modelVisibleOutput,
      truncation: input.truncation,
    },
  };
}
```

- [ ] **Step 4: Run context tests**

Run: `npm run test -- tests/context/budget-manager.test.ts tests/context/result-compressor.test.ts tests/context/message-builder.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/context/truncation.ts src/context/budget-manager.ts src/context/result-compressor.ts src/context/message-builder.ts tests/context/budget-manager.test.ts tests/context/result-compressor.test.ts tests/context/message-builder.test.ts
git commit -m "feat: add context budget manager and message builder"
```

### Task 6: Add Tool Registry, Path Guards, and Read-Only Tools

**Files:**
- Create: `src/utils/path.ts`
- Create: `src/utils/fs.ts`
- Create: `src/tools/registry.ts`
- Create: `src/tools/list-files.ts`
- Create: `src/tools/read-file.ts`
- Create: `src/tools/search-code.ts`
- Test: `tests/tools/list-files.test.ts`
- Test: `tests/tools/read-file.test.ts`
- Test: `tests/tools/search-code.test.ts`

- [ ] **Step 1: Write failing tests for path safety and read-only tool outputs**

```ts
it("rejects reading outside the workspace root", async () => {
  await expect(readFileTool({ path: "../secret.txt" }, ctx)).rejects.toThrow("outside workspace");
});

it("returns top-N search matches with truncation metadata", async () => {
  const result = await searchCodeTool({ query: "TODO" }, ctx);
  expect(result.truncated).toBe(true);
  expect(result.matches[0]).toMatchObject({ path: expect.any(String), line: expect.any(Number) });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- tests/tools/list-files.test.ts tests/tools/read-file.test.ts tests/tools/search-code.test.ts`
Expected: FAIL with missing tool implementations

- [ ] **Step 3: Implement the registry and read-only tools**

```ts
export type SearchCodeResult = {
  query: string;
  totalMatches: number;
  returnedMatches: number;
  truncated: boolean;
  matches: Array<{ path: string; line: number; preview: string }>;
  nextActionHint?: string;
};

export function assertInsideWorkspace(root: string, target: string) {
  if (!resolve(target).startsWith(resolve(root))) {
    throw new Error("Path is outside workspace");
  }
}
```

- [ ] **Step 4: Run read-only tool tests**

Run: `npm run test -- tests/tools/list-files.test.ts tests/tools/read-file.test.ts tests/tools/search-code.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/path.ts src/utils/fs.ts src/tools/registry.ts src/tools/list-files.ts src/tools/read-file.ts src/tools/search-code.ts tests/tools/list-files.test.ts tests/tools/read-file.test.ts tests/tools/search-code.test.ts
git commit -m "feat: add tool registry and read-only tools"
```

### Task 7: Add Mutating Tools, Shell Runner, Diff, and Approval Integration

**Files:**
- Create: `src/utils/child-process.ts`
- Create: `src/utils/errors.ts`
- Create: `src/tools/write-file.ts`
- Create: `src/tools/run-shell.ts`
- Create: `src/tools/diff-workspace.ts`
- Modify: `src/tools/registry.ts`
- Modify: `src/agent/approval.ts`
- Test: `tests/tools/write-file.test.ts`
- Test: `tests/tools/run-shell.test.ts`
- Test: `tests/tools/diff-workspace.test.ts`

- [ ] **Step 1: Write failing tests for shell summarization and write confirmation**

```ts
it("summarizes shell output for the model while retaining raw output", async () => {
  const result = await runShellTool({ command: "printf 'a%.0s' {1..2000}" }, ctx);
  expect(result.rawOutput.length).toBeGreaterThan(result.modelVisibleOutput.length);
  expect(result.truncation?.truncated).toBe(true);
});

it("returns a pending approval decision for write_file in default mode", async () => {
  const result = await invokeTool("write_file", { path: "a.ts", content: "x" }, ctx);
  expect(result.status).toBe("requires_approval");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- tests/tools/write-file.test.ts tests/tools/run-shell.test.ts tests/tools/diff-workspace.test.ts`
Expected: FAIL with missing write/shell/diff tools

- [ ] **Step 3: Implement the mutating tools and guarded shell runner**

```ts
export type ToolExecutionResult = {
  rawOutput: string;
  modelVisibleOutput: string;
  truncation?: TruncationMeta;
};

export async function runShellTool(input: RunShellInput, ctx: ToolContext): Promise<ToolExecutionResult> {
  const raw = await ctx.shell.run(input.command, { cwd: ctx.workspaceRoot });
  return compressTextResult(raw.stdout, ctx.budgets.runShellChars);
}
```

- [ ] **Step 4: Run mutating tool tests**

Run: `npm run test -- tests/tools/write-file.test.ts tests/tools/run-shell.test.ts tests/tools/diff-workspace.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/child-process.ts src/utils/errors.ts src/tools/write-file.ts src/tools/run-shell.ts src/tools/diff-workspace.ts src/tools/registry.ts src/agent/approval.ts tests/tools/write-file.test.ts tests/tools/run-shell.test.ts tests/tools/diff-workspace.test.ts
git commit -m "feat: add shell write and diff tools with approvals"
```

### Task 8: Implement Task Shaping, Context Planning, and Explore SubAgent

**Files:**
- Create: `src/agent/task-shaper.ts`
- Create: `src/agent/context-planner.ts`
- Create: `src/agent/subagents/explore-contract.ts`
- Create: `src/agent/subagents/explore-agent.ts`
- Test: `tests/agent/task-shaper.test.ts`
- Test: `tests/agent/context-planner.test.ts`
- Test: `tests/agent/explore-contract.test.ts`

- [ ] **Step 1: Write failing tests for task rewriting and explore triggering**

```ts
it("rewrites a vague request into an executable task", () => {
  expect(shapeTask("深入研究调用来源折线图")).toMatchObject({
    rewrittenTask: expect.stringContaining("Search"),
    keyQuestions: expect.any(Array),
  });
});

it("enables explore for broad multi-module requests", () => {
  expect(shouldUseExplore({
    userInput: "全面看看调用链和前后端联动",
    initialSearchResultCount: 200,
  })).toBe(true);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- tests/agent/task-shaper.test.ts tests/agent/context-planner.test.ts tests/agent/explore-contract.test.ts`
Expected: FAIL with missing task shaper / explore modules

- [ ] **Step 3: Implement task shaping and Explore contract**

```ts
export type ExploreReport = {
  rewrittenTask: string;
  keyQuestions: string[];
  candidatePaths: Array<{ path: string; reason: string; confidence: number }>;
  searchSummary: Array<{ tool: string; query: string; findings: string[]; truncated: boolean }>;
  recommendedNextReads: Array<{ path: string; startLine?: number; endLine?: number; reason: string }>;
  risks: string[];
};
```

- [ ] **Step 4: Run agent-planning tests**

Run: `npm run test -- tests/agent/task-shaper.test.ts tests/agent/context-planner.test.ts tests/agent/explore-contract.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/agent/task-shaper.ts src/agent/context-planner.ts src/agent/subagents/explore-contract.ts src/agent/subagents/explore-agent.ts tests/agent/task-shaper.test.ts tests/agent/context-planner.test.ts tests/agent/explore-contract.test.ts
git commit -m "feat: add task shaping context planning and explore subagent"
```

### Task 9: Implement Agent Loop and End-to-End Tool Cycling

**Files:**
- Create: `src/agent/run-agent-loop.ts`
- Modify: `src/provider/anthropic.ts`
- Modify: `src/context/message-builder.ts`
- Modify: `src/tools/registry.ts`
- Modify: `src/cli/repl.ts`
- Test: `tests/integration/agent-loop.test.ts`
- Test: `tests/integration/explore-flow.test.ts`

- [ ] **Step 1: Write the failing integration tests for tool-use loops**

```ts
it("executes a provider-requested read_file call and returns a final answer", async () => {
  const result = await runAgentLoopWithFixture("read file src/index.ts");
  expect(result.toolCalls).toEqual(["read_file"]);
  expect(result.finalText).toContain("src/index.ts");
});

it("uses explore first for broad requests and only passes ExploreReport to the main agent", async () => {
  const result = await runAgentLoopWithFixture("深入研究项目结构");
  expect(result.usedExplore).toBe(true);
  expect(result.messagesSentToMainModel.join("\n")).not.toContain("raw grep noise");
});
```

- [ ] **Step 2: Run integration tests to verify they fail**

Run: `npm run test -- tests/integration/agent-loop.test.ts tests/integration/explore-flow.test.ts`
Expected: FAIL with missing `runAgentLoop`

- [ ] **Step 3: Implement the main agent loop**

```ts
while (state.status !== "done") {
  const response = await provider.send(buildMessages(state));
  for await (const event of response.events) {
    if (event.type === "tool_use") {
      const toolResult = await registry.execute(event.name, event.input, toolContext);
      state = appendToolResult(state, buildToolResultMessage(toolResult));
    }
  }
}
```

- [ ] **Step 4: Run integration tests**

Run: `npm run test -- tests/integration/agent-loop.test.ts tests/integration/explore-flow.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/agent/run-agent-loop.ts src/provider/anthropic.ts src/context/message-builder.ts src/tools/registry.ts src/cli/repl.ts tests/integration/agent-loop.test.ts tests/integration/explore-flow.test.ts
git commit -m "feat: add agent loop and explore-first integration"
```

### Task 10: Add Session Persistence, `/diff`, and Context Explosion Regression Tests

**Files:**
- Modify: `src/agent/session.ts`
- Modify: `src/cli/commands.ts`
- Modify: `src/cli/repl.ts`
- Modify: `src/tools/diff-workspace.ts`
- Test: `tests/integration/context-regression.test.ts`

- [ ] **Step 1: Write the failing persistence and regression tests**

```ts
it("persists the latest ExploreReport and recent tool results across repl turns", async () => {
  const store = await runConversationFixture();
  expect(store.latestExploreReport).toBeDefined();
  expect(store.recentToolResults.length).toBeGreaterThan(0);
});

it("does not inject raw high-volume tool output into model history", async () => {
  const state = await runLargeSearchFixture();
  expect(state.modelMessages.join("\n")).not.toContain("VERY_LONG_RAW_OUTPUT_BLOCK");
});
```

- [ ] **Step 2: Run regression tests to verify they fail**

Run: `npm run test -- tests/integration/context-regression.test.ts`
Expected: FAIL with missing persistence / regression logic

- [ ] **Step 3: Implement persistence and `/diff` wiring**

```ts
export type SessionState = {
  cwd: string;
  model: string;
  approvalMode: ApprovalMode;
  messages: AgentMessage[];
  latestExploreReport?: ExploreReport;
  recentToolResults: ToolExecutionResult[];
  historySummary?: string;
};
```

- [ ] **Step 4: Run the full test suite**

Run: `npm run test`
Expected: PASS with unit + integration + context regression coverage

- [ ] **Step 5: Commit**

```bash
git add src/agent/session.ts src/cli/commands.ts src/cli/repl.ts src/tools/diff-workspace.ts tests/integration/context-regression.test.ts
git commit -m "feat: add session persistence diff command and regression coverage"
```

## Verification Checklist

- Run: `npm run test`
- Expect: 全部单测、集成测试、上下文回归测试通过
- Run: `npm run dev -- --model claude-3-7-sonnet-latest`
- Expect: 进入 REPL，可执行 `/help`、`/tools`、`/approval`、`/diff`、`/exit`
- Run: `npm run dev -- --yolo`
- Expect: 终端显式显示 `YOLO` 状态，`write_file` / `run_shell` 不再弹确认
- Manual: 发起“深入研究项目结构”类请求
- Expect: 先触发 `Explore`，主模型只消费 `ExploreReport` 摘要

## Risks to Watch During Execution

- Anthropic SDK 的事件类型可能和 spec 中的抽象存在偏差，先在 `provider/stream.ts` 建最薄适配层，避免污染业务层。
- `run_shell` 和 `diff_workspace` 很容易失控，必须优先实现字符预算和头尾摘要，不要等待后续统一修复。
- `Explore` 子代理若直接复用主 agent 提示，会重新引入上下文膨胀；应单独维护精简提示模板和只读工具注册表。
- 计划中的 commit 节点是执行节奏控制点，不要把多个任务糊成一个大提交。
