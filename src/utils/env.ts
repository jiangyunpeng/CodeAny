import { config as loadDotenv } from "dotenv";

import { ApprovalMode } from "../agent/approval";

export type AppConfig = {
  anthropicApiKey: string;
  model: string;
  exploreModel: string;
  approvalMode: ApprovalMode;
  cwd: string;
  yolo: boolean;
};

export function loadAppConfig(options: {
  cwd: string;
  env?: NodeJS.ProcessEnv;
  argv?: string[];
  allowMissingApiKey?: boolean;
}): AppConfig {
  loadDotenv();
  const env = options.env ?? process.env;
  const argv = options.argv ?? process.argv.slice(2);
  const flags = parseCliFlags(argv);
  const yolo = flags.yolo;
  const approvalMode = (flags.approval ?? env.DEFAULT_APPROVAL ?? "default") as ApprovalMode;
  const apiKey = env.ANTHROPIC_API_KEY ?? "";

  if (!options.allowMissingApiKey && !apiKey) {
    throw new Error("ANTHROPIC_API_KEY is required");
  }

  return {
    anthropicApiKey: apiKey,
    model: flags.model ?? env.DEFAULT_MODEL ?? "claude-3-7-sonnet-latest",
    exploreModel: env.EXPLORE_MODEL ?? "claude-3-5-haiku-latest",
    approvalMode: yolo ? "never" : approvalMode,
    cwd: flags.cwd ?? options.cwd,
    yolo,
  };
}

type ParsedFlags = {
  model?: string;
  approval?: string;
  cwd?: string;
  yolo: boolean;
};

export function parseCliFlags(argv: string[]): ParsedFlags {
  const result: ParsedFlags = { yolo: false };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (current === "--model") {
      result.model = argv[index + 1];
      index += 1;
      continue;
    }
    if (current === "--approval") {
      result.approval = argv[index + 1];
      index += 1;
      continue;
    }
    if (current === "--cwd") {
      result.cwd = argv[index + 1];
      index += 1;
      continue;
    }
    if (current === "--yolo") {
      result.yolo = true;
    }
  }

  return result;
}
