import { describe, it, expect } from "vitest";
import { docsReadmeTool, docsApiTool, docsChangelogTool } from "../../tools/docs.tool.js";

describe("docsReadmeTool", () => {
  it("工具定义", () => {
    expect((docsReadmeTool as any).name).toBe("docs_readme");
  });
});

describe("docsApiTool", () => {
  it("工具定义", () => {
    expect((docsApiTool as any).name).toBe("docs_api");
  });
});

describe("docsChangelogTool", () => {
  it("工具定义", () => {
    expect((docsChangelogTool as any).name).toBe("docs_changelog");
  });
});
