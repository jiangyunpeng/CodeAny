export type TaskShape = {
  originalTask: string;
  rewrittenTask: string;
  keyQuestions: string[];
  searchIntent: string[];
};

export function shapeTask(input: string): TaskShape {
  const trimmed = input.trim();
  const lowered = trimmed.toLowerCase();
  const broad = /深入|全面|梳理|研究|analy|trace|explore/.test(trimmed);
  const rewrittenTask = broad
    ? `Search the codebase thoroughly for: ${trimmed}`
    : `Search and inspect the relevant code for: ${trimmed}`;

  const keyQuestions = [
    "Where is the entrypoint?",
    "Which files are most relevant?",
  ];
  if (broad || lowered.includes("调用链")) {
    keyQuestions.push("Which modules participate in the call flow?");
  }

  const searchIntent = Array.from(
    new Set(
      trimmed
        .split(/\s+/)
        .map((part) => part.trim())
        .filter(Boolean),
    ),
  );

  return {
    originalTask: trimmed,
    rewrittenTask,
    keyQuestions,
    searchIntent,
  };
}
