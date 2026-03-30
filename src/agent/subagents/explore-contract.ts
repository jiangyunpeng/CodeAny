import { z } from "zod";

export const ExploreReportSchema = z.object({
  rewrittenTask: z.string(),
  keyQuestions: z.array(z.string()),
  candidatePaths: z.array(
    z.object({
      path: z.string(),
      reason: z.string(),
      confidence: z.number(),
    }),
  ),
  searchSummary: z.array(
    z.object({
      tool: z.string(),
      query: z.string(),
      findings: z.array(z.string()),
      truncated: z.boolean(),
    }),
  ),
  recommendedNextReads: z.array(
    z.object({
      path: z.string(),
      startLine: z.number().optional(),
      endLine: z.number().optional(),
      reason: z.string(),
    }),
  ),
  risks: z.array(z.string()),
});

export type ExploreReport = z.infer<typeof ExploreReportSchema>;

export function validateExploreReport(report: unknown): ExploreReport {
  return ExploreReportSchema.parse(report);
}
