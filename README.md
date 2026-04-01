# code-any

[中文版](README.zh-CN.md)

A terminal-based coding agent built in TypeScript — a Claude Code-like workflow you can run locally.

<p align="center">
  <img src="assets/demo.png" alt="code-any demo" width="800" />
</p>

## What is this?

This project demonstrates how a Claude Code-style agent works under the hood:

- **Agent loop** — iterative tool-use rounds with the Anthropic API
- **Context engineering** — budget-aware truncation so large outputs don't flood the model
- **Explore subagent** — a cheap read-only pass to gather context before the main agent acts
- **Tool output separation** — raw output stays local, only structured summaries go to the model

If you've ever wondered "how does Claude Code actually work?", read the source.

## Quick Start

```bash
# Install
npm install && npm run build && npm link

# Configure
cp .env.example .env
# Set ANTHROPIC_AUTH_TOKEN=your_token_here in .env

# Run
code-any
```

### CLI Flags

```bash
code-any --model claude-3-7-sonnet-latest  # choose model
code-any --cwd /path/to/workspace          # set working directory
code-any --yolo                            # auto-approve all tool calls
```

### Slash Commands

| Command     | Description              |
|-------------|--------------------------|
| `/help`     | Show built-in commands   |
| `/tools`    | List available tools     |
| `/model`    | Show current model       |
| `/approval` | Show approval mode       |
| `/diff`     | Show workspace diff      |
| `/clear`    | Clear conversation       |
| `/exit`     | Exit                     |

## Built-in Tools

| Tool             | Description                        |
|------------------|------------------------------------|
| `list_files`     | List files in a directory          |
| `read_file`      | Read file content (with slicing)   |
| `search_code`    | Ripgrep-based code search          |
| `write_file`     | Write/create files (needs approval)|
| `run_shell`      | Execute shell commands (needs approval)|
| `diff_workspace` | Show workspace changes             |

## Configuration

```bash
ANTHROPIC_AUTH_TOKEN=your_token_here        # required
ANTHROPIC_MODEL=claude-3-7-sonnet-latest    # main model (default)
EXPLORE_MODEL=claude-3-5-haiku-latest       # explore subagent model (default)
DEFAULT_APPROVAL=default                    # or "never" for yolo mode
```

## For Developers

```bash
npm run dev        # Run in development mode
npm test           # Run tests
npm run typecheck  # Type check only
npm run build      # Build bundle
```

## License

MIT
