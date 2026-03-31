# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

code-any is a terminal-based coding agent CLI built in TypeScript. It provides a REPL interface that streams responses from Anthropic's API, executes local tools (file ops, shell, code search), and routes broad/ambiguous requests through a read-only Explore subagent before the main agent reasons.

## Commands

```bash
npm run build        # TypeScript check + tsup bundle
npm run dev          # Run via tsx (development mode)
npm test             # Run vitest (single run, not watch)
npm run typecheck    # tsc --noEmit only
npm link             # Install as global `code-any` CLI
```

Run a single test file:
```bash
npx vitest run tests/tools/read-file.test.ts
```

## Architecture

### Agent Loop (`src/agent/run-agent-loop.ts`)
The core loop: receives a user prompt, optionally runs Explore first (decided by `context-planner.ts`), then iterates up to 8 tool-use rounds with the main model. Stops when the model returns no tool calls.

### Tool System (`src/tools/registry.ts`)
Six tools registered in `ToolRegistry`: `list_files`, `read_file`, `search_code`, `write_file`, `run_shell`, `diff_workspace`. Each tool returns a `ToolResultEnvelope` with separate `rawOutput` (stays local) and `modelVisibleOutput` (sent to API). This separation is a core design principle — raw output is never blindly forwarded to the model.

### Context Budget (`src/context/budget-manager.ts`)
`ContextBudgetManager` enforces character limits per tool type (default 4000 chars for tools, 3000 for shell/diff, 6000 per message, 12 messages history). Truncation is always explicit with metadata and `nextActionHint`, never silent.

### Explore Subagent (`src/agent/subagents/`)
Read-only subagent (no write_file/run_shell) that returns a Zod-validated `ExploreReport` with candidate paths, search summaries, recommended reads, and risks. Uses a cheaper model (haiku by default) for broad context gathering before the main agent acts.

### Approval System (`src/agent/approval.ts`)
`write_file` and `run_shell` require approval in "default" mode. `--yolo` or `--approval never` bypasses this. When blocked, the loop returns immediately with an approval-required message.

### Provider Layer (`src/provider/`)
`anthropic.ts` wraps the Anthropic SDK. `stream.ts` maps raw SSE events to typed `StreamEvent` objects consumed by the agent loop.

### Message Building (`src/context/message-builder.ts`)
Builds Anthropic API messages from internal session state. Metadata (stdout, stderr, rawOutput) is filtered out before sending to the model. `result-compressor.ts` handles post-hoc compression of tool results.

## Key Conventions

- **ESM-only** — `"type": "module"` in package.json, tsup outputs ESM
- **Strict TypeScript** — strict mode enabled, target ES2022, bundler module resolution
- **Zod for validation** — used for Explore report schema and input validation
- **Tests mirror src** — `tests/tools/` maps to `src/tools/`, `tests/agent/` maps to `src/agent/`, etc.
- **No lint/format tooling** — no eslint or prettier configured
- **Default models** — main agent uses `claude-3-7-sonnet-latest`, explore uses `claude-3-5-haiku-latest`
- **Config precedence** — env vars > .env file > CLI flags > defaults
