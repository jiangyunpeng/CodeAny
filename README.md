# code-any

A local TypeScript coding agent for the terminal, designed around a Claude Code-like workflow.

It provides a REPL-style CLI, Anthropic streaming support, local tool calling, workspace file editing, shell execution, an `Explore` subagent for context gathering, and explicit context-budget controls to avoid flooding the model with raw tool output.

## Status

Current branch: `main`

Verified on the current codebase:

- `npm test` ✅
- `npm run build` ✅

## Features

- REPL-style terminal interaction
- Anthropic Messages API streaming adapter
- Agent loop with tool execution
- Six built-in local tools:
  - `list_files`
  - `read_file`
  - `search_code`
  - `write_file`
  - `run_shell`
  - `diff_workspace`
- `Explore` subagent for broad context collection before main-agent reasoning
- Context budgeting and truncation protocol
- Separation between raw tool output and model-visible output
- Default approval mode for risky actions
- `--yolo` mode for auto-approved file writes and shell execution
- Slash commands including `/help`, `/tools`, `/model`, `/approval`, `/diff`, `/clear`, `/exit`

## Why This Exists

Most terminal agents become noisy and fragile once search results, shell logs, or diffs get large. This project treats context engineering as a first-class concern:

- search is for locating, not for dumping full code into the model
- reading is done through focused file slices
- high-noise tools return bounded, structured summaries
- complex requests can be routed through `Explore` first
- raw output stays available locally without being blindly forwarded to the model

## Quick Start

### Requirements

- Node.js 20+
- An Anthropic API key

### Install

```bash
npm install
```

Build the executable bundle:

```bash
npm run build
```

Link it as a local global command:

```bash
npm link
```

Then run:

```bash
code-any
```

### Configure

```bash
cp .env.example .env
```

Set at least:

```bash
ANTHROPIC_AUTH_TOKEN=your_token_here
```

Optional configuration:

```bash
ANTHROPIC_API_KEY=your_api_key_here
ANTHROPIC_BASE_URL=https://api.anthropic.com
ANTHROPIC_MODEL=claude-3-7-sonnet-latest
EXPLORE_MODEL=claude-3-5-haiku-latest
DEFAULT_APPROVAL=default
```

Configuration precedence:

- runtime environment variables first
- `.env` file second

### Run

```bash
npm run dev
```

Show help:

```bash
code-any --help
```

Show version:

```bash
code-any --version
```

Run with explicit flags:

```bash
npm run dev -- --model claude-3-7-sonnet-latest --cwd /path/to/workspace
```

Run in YOLO mode:

```bash
npm run dev -- --yolo
```

## CLI Commands

- `/help` show built-in commands
- `/tools` list available tools
- `/model` show current model
- `/approval` show current approval mode
- `/diff` show workspace diff summary
- `/clear` clear in-memory conversation state
- `/exit` exit the REPL

## Project Structure

```text
src/
  cli/        REPL, command parsing, rendering
  agent/      task shaping, approval, session, agent loop, explore subagent
  context/    truncation, compression, budget management, message building
  provider/   Anthropic stream adapter
  tools/      local tools and tool registry
  utils/      filesystem, path, env, process helpers
tests/
  cli/
  agent/
  context/
  provider/
  tools/
  integration/
```

## Architecture Notes

### 1. Tool output is not model input

Each high-noise tool is expected to keep raw output and model-visible output separate.

### 2. Search narrows, read deepens

`search_code` is intended to identify candidate paths and snippets. Detailed inspection should happen through `read_file`.

### 3. Explore first on broad tasks

For broad or ambiguous requests, the main agent can use `Explore` to gather candidate files, queries, and next reads before spending main-model budget.

### 4. Context budgets are explicit

Large outputs are truncated with metadata rather than silently chopped. The model gets bounded summaries plus truncation hints.

## Development

Install dependencies:

```bash
npm install
```

Run tests:

```bash
npm test
```

Run type-check:

```bash
npm run typecheck
```

Rebuild CLI bundle:

```bash
npm run build
```

## Current Limitations

- Anthropic is the only provider implemented
- This is a local CLI, not a web app
- No browser automation
- No remote sandbox execution
- No automatic git commit flow from the agent itself
- Session persistence is still minimal and file-backed persistence is not implemented yet
- The `Explore` model selection is configured conceptually, but the current implementation focuses on contract and flow rather than full multi-model routing

## Roadmap

- persistent session storage
- richer approval UX
- stronger tool schemas and validation
- better diff rendering for large workspaces
- more robust provider event handling
- configurable tool budgets and explore thresholds

## License

No license file has been added yet. If you plan to open source this repository, add a license before publishing.
