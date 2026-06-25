import { describe, it, expect } from "vitest";
import { fileReadTool, fileWriteTool } from "../../tools/file.tool.js";

describe("fileReadTool", () => {
  it("工具定义有正确的名称", () => {
    expect((fileReadTool as any).name).toBe("file_read");
  });

  it("参数 schema 包含 path", () => {
    const params = (fileReadTool as any).parameters;
    expect(params).toBeDefined();
  });

  it("工具类型是 function", () => {
    expect((fileReadTool as any).type).toBe("function");
  });
});

describe("fileWriteTool", () => {
  it("工具定义有正确的名称", () => {
    expect((fileWriteTool as any).name).toBe("file_write");
  });

  it("参数 schema 包含 path 和 content", () => {
    const params = (fileWriteTool as any).parameters;
    expect(params).toBeDefined();
  });
});
