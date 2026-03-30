import { describe, expect, it } from "vitest";

import { ContextBudgetManager } from "../../src/context/budget-manager";
import { truncateItems } from "../../src/context/truncation";

describe("ContextBudgetManager", () => {
  it("marks large search results as truncated", () => {
    const result = truncateItems(["a", "b", "c"], { maxItems: 2 });
    expect(result.meta).toMatchObject({ truncated: true, totalCount: 3, returnedCount: 2 });
  });

  it("clips text to the configured budget", () => {
    const manager = new ContextBudgetManager({ maxToolChars: 10 });
    const result = manager.clipText("0123456789012345");
    expect(result.truncated).toBe(true);
    expect(result.text).toContain("[truncated output:");
    expect(result.text).not.toContain("0123456789012345");
  });
});
