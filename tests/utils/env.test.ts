import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createTempWorkspace, removeTempWorkspace } from "../helpers";

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

let workspaceRoot = "";
let symlinkRoot = "";

afterEach(async () => {
  if (symlinkRoot) {
    await fs.rm(symlinkRoot, { recursive: true, force: true });
    symlinkRoot = "";
  }
  if (workspaceRoot) {
    await removeTempWorkspace(workspaceRoot);
    workspaceRoot = "";
  }
});

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

  it("prefers shell PWD when it points to the same directory as cwd", async () => {
    workspaceRoot = await createTempWorkspace();
    symlinkRoot = await fs.mkdtemp(path.join(os.tmpdir(), "code-any-env-link-"));
    const aliasPath = path.join(symlinkRoot, "workspace");
    await fs.symlink(workspaceRoot, aliasPath);

    const config = loadAppConfig({
      cwd: workspaceRoot,
      env: {
        ANTHROPIC_AUTH_TOKEN: "runtime-token",
        PWD: aliasPath,
      },
    });

    expect(config.cwd).toBe(aliasPath);
  });
});
