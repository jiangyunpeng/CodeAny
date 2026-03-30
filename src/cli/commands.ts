export type ParsedCliInput =
  | { kind: "command"; name: string; args: string[] }
  | { kind: "prompt"; text: string };

export function parseCliCommand(input: string): ParsedCliInput {
  const trimmed = input.trim();
  if (trimmed.startsWith("/")) {
    const [name, ...args] = trimmed.slice(1).split(/\s+/).filter(Boolean);
    return {
      kind: "command",
      name,
      args,
    };
  }

  return {
    kind: "prompt",
    text: input,
  };
}

export const BUILT_IN_COMMANDS = [
  "/help",
  "/tools",
  "/model",
  "/approval",
  "/diff",
  "/clear",
  "/exit",
];
