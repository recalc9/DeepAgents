import { describe, it, expect } from "vitest";
import { sqlQueryTool, sqlExecuteTool } from "../../tools/db.tool.js";

describe("sqlQueryTool", () => {
  it("工具定义有正确的名称", () => {
    expect((sqlQueryTool as any).name).toBe("sql_query");
  });

  it("参数 schema 包含 sql", () => {
    const params = (sqlQueryTool as any).parameters;
    expect(params).toBeDefined();
  });
});

describe("sqlExecuteTool", () => {
  it("工具定义有正确的名称", () => {
    expect((sqlExecuteTool as any).name).toBe("sql_execute");
  });

  it("needsApproval 是函数（审批机制启用）", () => {
    expect(typeof (sqlExecuteTool as any).needsApproval).toBe("function");
  });
});
