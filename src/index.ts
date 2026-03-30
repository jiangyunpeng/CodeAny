import { ContextBudgetManager } from "./context/budget-manager";
import { createToolRegistry, createDefaultToolContext } from "./tools/registry";
import { createAnthropicProvider } from "./provider/anthropic";
import { createSessionState } from "./agent/session";
import { loadAppConfig } from "./utils/env";
import { runInteractiveRepl } from "./cli/repl";

async function main(): Promise<void> {
  const config = loadAppConfig({ cwd: process.cwd() });
  const budgetManager = new ContextBudgetManager();
  const toolContext = createDefaultToolContext({
    workspaceRoot: config.cwd,
    approvalMode: config.approvalMode,
    budgetManager,
  });
  const registry = createToolRegistry();
  const provider = createAnthropicProvider({
    apiKey: config.anthropicApiKey,
  });
  const session = createSessionState({
    cwd: config.cwd,
    model: config.model,
    approvalMode: config.approvalMode,
  });

  await runInteractiveRepl({
    session,
    registry,
    toolContext,
    provider,
    yolo: config.yolo,
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
