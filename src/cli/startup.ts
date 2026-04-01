export type StartupAction =
  | { kind: "continue" }
  | { kind: "exit"; output: string };

export function handleStartupFlags(argv: string[], version: string): StartupAction {
  if (argv.includes("--help") || argv.includes("-h")) {
    return {
      kind: "exit",
      output: formatHelpText(version),
    };
  }

  if (argv.includes("--version") || argv.includes("-v")) {
    return {
      kind: "exit",
      output: version,
    };
  }

  return { kind: "continue" };
}

export function formatHelpText(version: string): string {
  return [
    `code-any ${version}`,
    "",
    "Usage:",
    "  code-any [options]",
    "",
    "Options:",
    "  --help, -h       Show this help message",
    "  --version, -v    Show CLI version",
    "  --model <name>   Override model",
    "  --approval <m>   Set approval mode",
    "  --cwd <path>     Set workspace root",
    "  --yolo           Auto-approve write_file and run_shell",
    "  --debug          Print messages sent to model at each iteration",
    "",
    "Runtime:",
    "  Starts an interactive REPL when no exit flag is provided.",
  ].join("\n");
}
