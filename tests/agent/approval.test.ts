import { describe, expect, it } from "vitest";

import { shouldAutoApprove } from "../../src/agent/approval";

describe("shouldAutoApprove", () => {
  it("requires confirmation for write_file in default mode", () => {
    expect(shouldAutoApprove("default", "write_file")).toBe(false);
  });

  it("auto-approves shell in yolo mode", () => {
    expect(shouldAutoApprove("never", "run_shell")).toBe(true);
  });
});
