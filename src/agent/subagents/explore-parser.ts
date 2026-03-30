import { validateExploreReport, type ExploreReport } from "./explore-contract";

export function parseExploreReportOutput(input: {
  text: string;
  rewrittenTask: string;
  keyQuestions?: string[];
}): ExploreReport {
  const candidatePayloads = [
    input.text.trim(),
    extractJsonFence(input.text),
    extractFirstJsonObject(input.text),
  ].filter((value): value is string => Boolean(value && value.trim()));

  for (const payload of candidatePayloads) {
    try {
      return validateExploreReport(JSON.parse(payload));
    } catch {
      continue;
    }
  }

  return validateExploreReport({
    rewrittenTask: input.rewrittenTask,
    keyQuestions: input.keyQuestions ?? [],
    candidatePaths: [],
    searchSummary: [],
    recommendedNextReads: [],
    risks: ["Explore output was invalid and fell back to an empty report."],
  });
}

function extractJsonFence(text: string): string | null {
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return match?.[1]?.trim() ?? null;
}

function extractFirstJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    return null;
  }

  return text.slice(start, end + 1).trim();
}
