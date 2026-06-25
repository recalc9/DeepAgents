import { describe, it, expect } from "vitest";
import { testRunTool, testCoverageTool, testGenerateTool } from "../../tools/test.tool.js";

describe("testRunTool", () => {
  it("工具定义", () => {
    expect((testRunTool as any).name).toBe("test_run");
  });
});

describe("testCoverageTool", () => {
  it("工具定义", () => {
    expect((testCoverageTool as any).name).toBe("test_coverage");
  });
});

describe("testGenerateTool", () => {
  it("工具定义", () => {
    expect((testGenerateTool as any).name).toBe("test_generate");
  });
});
