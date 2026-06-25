import { describe, it, expect } from "vitest";
import { webSearchTool, webFetchTool } from "../../tools/web.tool.js";
import { fetchUrl } from "../../core/web-service.js";

describe("webSearchTool", () => {
  it("工具定义", () => {
    expect((webSearchTool as any).name).toBe("web_search");
  });
});

describe("webFetchTool", () => {
  it("工具定义", () => {
    expect((webFetchTool as any).name).toBe("web_fetch");
  });
});

describe("web-search service", () => {
  it("fetchUrl 抓取 example.com 返回内容", async () => {
    const result = await fetchUrl("https://example.com");
    expect(typeof result).toBe("string");
    expect(result.toLowerCase()).toContain("example");
  });

  // DuckDuckGo 在中国大陆可能无法访问，skip 此测试
  it.skip("searchDuckDuckGo 返回搜索结果（需要国际网络）", async () => {
    const { searchDuckDuckGo } = await import("../../core/web-service.js");
    const results = await searchDuckDuckGo("TypeScript", 3);
    expect(Array.isArray(results)).toBe(true);
  });
});
