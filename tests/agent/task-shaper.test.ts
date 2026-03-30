import { describe, expect, it } from "vitest";

import { shapeTask } from "../../src/agent/task-shaper";

describe("shapeTask", () => {
  it("rewrites a vague request into an executable task", () => {
    expect(shapeTask("深入研究调用来源折线图")).toMatchObject({
      rewrittenTask: expect.stringContaining("Search"),
      keyQuestions: expect.any(Array),
    });
  });
});
