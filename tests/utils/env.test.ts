import { describe, expect, it, vi } from "vitest";

vi.mock("dotenv", () => ({
  config: vi.fn(() => ({
    parsed: {
      ANTHROPIC_BASE_URL: "https://dotenv.example",
      ANTHROPIC_AUTH_TOKEN: "dotenv-token",
      ANTHROPIC_MODEL: "dotenv-model",
      DEFAULT_APPROVAL: "default",
    },
  })),
}));

import { loadAppConfig } from "../../src/utils/env";

describe("loadAppConfig", () => {
  it("prefers runtime environment variables over .env values", () => {
    const config = loadAppConfig({
      cwd: "/tmp/workspace",
      env: {
        ANTHROPIC_BASE_URL: "https://runtime.example",
        ANTHROPIC_AUTH_TOKEN: "runtime-token",
        ANTHROPIC_MODEL: "runtime-model",
      },
    });

    expect(config.anthropicBaseUrl).toBe("https://runtime.example");
    expect(config.anthropicAuthToken).toBe("runtime-token");
    expect(config.model).toBe("runtime-model");
  });

  it("falls back to .env when runtime environment variables are missing", () => {
    const config = loadAppConfig({
      cwd: "/tmp/workspace",
      env: {},
    });

    expect(config.anthropicBaseUrl).toBe("https://dotenv.example");
    expect(config.anthropicAuthToken).toBe("dotenv-token");
    expect(config.model).toBe("dotenv-model");
  });
});
