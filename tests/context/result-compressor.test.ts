import { describe, expect, it } from "vitest";

import { compressTextResult } from "../../src/context/result-compressor";

describe("compressTextResult", () => {
  it("returns shorter model-visible output for long text", () => {
    const result = compressTextResult("a".repeat(2000), 100);
    expect(result.rawOutput.length).toBeGreaterThan(result.modelVisibleOutput.length);
    expect(result.truncation?.truncated).toBe(true);
  });
});
