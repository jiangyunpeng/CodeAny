import { describe, expect, it } from "vitest";

import { shouldUseExplore } from "../../src/agent/context-planner";

describe("shouldUseExplore", () => {
  it("enables explore for broad multi-module requests", () => {
    expect(shouldUseExplore({
      userInput: "全面看看调用链和前后端联动",
      initialSearchResultCount: 200,
    })).toBe(true);
  });
});
