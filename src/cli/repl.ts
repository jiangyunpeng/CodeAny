import readline from "node:readline/promises";

import { BUILT_IN_COMMANDS, parseCliCommand } from "./commands";
import { renderProgressLine, renderStatusLine, renderToolSummary } from "./render";
import type { AgentProgressEvent } from "../agent/progress";
import { createSessionState, type SessionState } from "../agent/session";
import { diffWorkspaceTool } from "../tools/diff-workspace";
import { createDefaultToolContext, createToolRegistry, type ToolContext, type ToolRegistry } from "../tools/registry";
import type { Provider } from "../provider/anthropic";
import { runAgentLoop } from "../agent/run-agent-loop";
import { runExploreAgent } from "../agent/subagents/explore-agent";

export type ReplRuntime = {
  session: SessionState;
  registry: ToolRegistry;
  toolContext: ToolContext;
  provider: Provider;
  yolo: boolean;
  onProgressLine?: (line: string, event: AgentProgressEvent) => void;
};

export async function handleCommand(
  name: string,
  runtime: ReplRuntime,
): Promise<{ output: string; exit?: boolean; session?: SessionState }> {
  if (name === "help") {
    return { output: BUILT_IN_COMMANDS.join("\n") };
  }

  if (name === "tools") {
    return { output: runtime.registry.list().join("\n") };
  }

  if (name === "model") {
    return { output: runtime.session.model };
  }

  if (name === "approval") {
    return { output: runtime.session.approvalMode };
  }

  if (name === "diff") {
    const result = await diffWorkspaceTool(runtime.toolContext);
    return { output: renderToolSummary("diff_workspace", result.modelVisibleOutput) };
  }

  if (name === "clear") {
    return {
      output: "Conversation cleared",
      session: {
        ...runtime.session,
        messages: [],
        historySummary: undefined,
      },
    };
  }

  if (name === "exit") {
    return { output: "Goodbye", exit: true };
  }

  return { output: `Unknown command: /${name}` };
}

export async function handleInputLine(
  line: string,
  runtime: ReplRuntime,
): Promise<{ output: string; exit?: boolean; session?: SessionState }> {
  const parsed = parseCliCommand(line);
  if (parsed.kind === "command") {
    return handleCommand(parsed.name, runtime);
  }

  const result = await runAgentLoop({
    prompt: parsed.text,
    session: runtime.session,
    provider: runtime.provider,
    registry: runtime.registry,
    toolContext: runtime.toolContext,
    exploreAgent: runExploreAgent,
    onProgress: (event) => {
      runtime.onProgressLine?.(renderProgressLine(event), event);
    },
  });

  return {
    output: result.finalText,
    session: result.session,
  };
}

export async function runReplScript(
  inputs: string[],
  overrides?: Partial<ReplRuntime>,
): Promise<string> {
  let runtime = createDefaultReplRuntime(overrides);
  const outputs = [renderStatusLine({
    model: runtime.session.model,
    approvalMode: runtime.session.approvalMode,
    yolo: runtime.yolo,
  })];
  runtime = {
    ...runtime,
    onProgressLine: overrides?.onProgressLine ?? ((line) => {
      outputs.push(line);
    }),
  };

  for (const input of inputs) {
    const result = await handleInputLine(input, runtime);
    outputs.push(result.output);
    runtime = {
      ...runtime,
      session: result.session ?? runtime.session,
    };
    if (result.exit) {
      break;
    }
  }

  return outputs.join("\n");
}

export async function runInteractiveRepl(runtime: ReplRuntime): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  let currentRuntime = runtime;
  currentRuntime = {
    ...currentRuntime,
    onProgressLine: runtime.onProgressLine ?? ((line) => {
      console.log(line);
    }),
  };
  console.log(renderStatusLine({
    model: runtime.session.model,
    approvalMode: runtime.session.approvalMode,
    yolo: runtime.yolo,
  }));

  try {
    while (true) {
      const line = await rl.question("> ");
      const result = await handleInputLine(line, currentRuntime);
      console.log(result.output);
      currentRuntime = {
        ...currentRuntime,
        session: result.session ?? currentRuntime.session,
      };
      if (result.exit) {
        break;
      }
    }
  } finally {
    rl.close();
  }
}

export function createDefaultReplRuntime(overrides?: Partial<ReplRuntime>): ReplRuntime {
  const toolContext = overrides?.toolContext ?? createDefaultToolContext({
    workspaceRoot: process.cwd(),
    approvalMode: "default",
  });
  const session = overrides?.session ?? createSessionState({
    cwd: toolContext.workspaceRoot,
    model: "claude-3-7-sonnet-latest",
    exploreModel: "claude-3-5-haiku-latest",
    approvalMode: toolContext.approvalMode,
  });

  return {
    session,
    registry: overrides?.registry ?? createToolRegistry(),
    toolContext,
    provider: overrides?.provider ?? {
      async send() {
        return {
          events: (async function* () {
            yield { type: "text", text: "Provider not configured for scripted REPL." } as const;
            yield { type: "done" } as const;
          })(),
        };
      },
    },
    yolo: overrides?.yolo ?? false,
  };
}
