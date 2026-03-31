import type { AgentProgressListener } from "../progress";
import type { Provider } from "../../provider/anthropic";
import type { ToolContext } from "../../tools/registry";
import type { ExploreReport } from "./explore-contract";
import { runExploreSubagent } from "./explore-runner";

export async function runExploreAgent(
  userInput: string,
  ctx: ToolContext,
  provider: Provider,
  model: string,
  onProgress?: AgentProgressListener,
): Promise<ExploreReport> {
  return runExploreSubagent({
    prompt: userInput,
    model,
    provider,
    onProgress,
    toolContext: {
      ...ctx,
      approvalMode: "never",
    },
  });
}
