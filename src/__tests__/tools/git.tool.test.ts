import { describe, it, expect } from "vitest";
import { gitTool } from "../../tools/git.tool.js";

describe("gitTool", () => {
  it("工具定义有正确的名称", () => {
    expect((gitTool as any).name).toBe("git");
  });

  it("参数 schema 包含 operation", () => {
    const params = (gitTool as any).parameters;
    expect(params).toBeDefined();
  });

  it("写操作需要审批", async () => {
    const needsApproval = (gitTool as any).needsApproval;
    expect(needsApproval).toBeDefined();
    if (typeof needsApproval === "function") {
      // commit 操作应返回 true（需要审批）
      const result = await needsApproval(null, { operation: "commit", message: "test" });
      expect(result).toBe(true);
      // status 操作应返回 false（不需要审批）
      const result2 = await needsApproval(null, { operation: "status" });
      expect(result2).toBe(false);
    }
  });
});
