import { describe, expect, it } from "vitest";

import { EXPLORE_AGENT_SYSTEM_PROMPT, MAIN_AGENT_SYSTEM_PROMPT } from "../../src/agent/system-prompts";

describe("system prompts", () => {
  it("defines a main agent prompt aligned with code-any tools and context policy", () => {
    expect(MAIN_AGENT_SYSTEM_PROMPT).toContain("search_code");
    expect(MAIN_AGENT_SYSTEM_PROMPT).toContain("read_file");
    expect(MAIN_AGENT_SYSTEM_PROMPT).toContain("list_files");
    expect(MAIN_AGENT_SYSTEM_PROMPT).toContain("diff_workspace");
    expect(MAIN_AGENT_SYSTEM_PROMPT).toContain("run_shell");
    expect(MAIN_AGENT_SYSTEM_PROMPT).toContain("truncated, narrow the scope");
  });

  it("defines an explore prompt with read-only behavior", () => {
    expect(EXPLORE_AGENT_SYSTEM_PROMPT).toContain("read-only");
    expect(EXPLORE_AGENT_SYSTEM_PROMPT).toContain("Never create, modify, move, or delete files");
    expect(EXPLORE_AGENT_SYSTEM_PROMPT).toContain("search_code");
    expect(EXPLORE_AGENT_SYSTEM_PROMPT).toContain("read_file");
    expect(EXPLORE_AGENT_SYSTEM_PROMPT).toContain("valid JSON");
  });
});
