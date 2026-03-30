import { config as loadDotenv } from "dotenv";

import { ApprovalMode } from "../agent/approval";

export type AppConfig = {
  anthropicApiKey: string;
  anthropicAuthToken: string;
  anthropicBaseUrl: string;
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
  const dotenvResult = loadDotenv({
    processEnv: {},
  });
  const dotenvEnv = dotenvResult.parsed ?? {};
  const env = options.env ?? process.env;
  const argv = options.argv ?? process.argv.slice(2);
  const flags = parseCliFlags(argv);
  const yolo = flags.yolo;
  const approvalMode = (
    flags.approval
    ?? readConfigValue(env, dotenvEnv, "DEFAULT_APPROVAL")
    ?? "default"
  ) as ApprovalMode;
  const apiKey = readConfigValue(env, dotenvEnv, "ANTHROPIC_API_KEY") ?? "";
  const authToken = readConfigValue(env, dotenvEnv, "ANTHROPIC_AUTH_TOKEN") ?? "";
  const baseUrl = readConfigValue(env, dotenvEnv, "ANTHROPIC_BASE_URL") ?? "";

  if (!options.allowMissingApiKey && !apiKey && !authToken) {
    throw new Error("ANTHROPIC_API_KEY or ANTHROPIC_AUTH_TOKEN is required");
  }

  return {
    anthropicApiKey: apiKey,
    anthropicAuthToken: authToken,
    anthropicBaseUrl: baseUrl,
    model: flags.model
      ?? readConfigValue(env, dotenvEnv, "ANTHROPIC_MODEL")
      ?? readConfigValue(env, dotenvEnv, "DEFAULT_MODEL")
      ?? "claude-3-7-sonnet-latest",
    exploreModel: readConfigValue(env, dotenvEnv, "EXPLORE_MODEL") ?? "claude-3-5-haiku-latest",
    approvalMode: yolo ? "never" : approvalMode,
    cwd: flags.cwd ?? options.cwd,
    yolo,
  };
}

function readConfigValue(
  env: NodeJS.ProcessEnv,
  dotenvEnv: Record<string, string>,
  key: string,
): string | undefined {
  const runtimeValue = env[key];
  if (runtimeValue !== undefined && runtimeValue !== "") {
    return runtimeValue;
  }

  const dotenvValue = dotenvEnv[key];
  if (dotenvValue !== undefined && dotenvValue !== "") {
    return dotenvValue;
  }

  return undefined;
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
