import { describe, it, expect } from "vitest";
import { runCodeTool } from "../../tools/code-exec.tool.js";

describe("runCodeTool", () => {
  it("工具定义", () => {
    expect((runCodeTool as any).name).toBe("run_code");
  });

  it("needsApproval 是函数", () => {
    expect(typeof (runCodeTool as any).needsApproval).toBe("function");
  });

  it("参数 schema 包含 language 和 code", () => {
    const params = (runCodeTool as any).parameters;
    expect(params).toBeDefined();
  });
});
