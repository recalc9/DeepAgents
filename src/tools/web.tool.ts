/**
 * 网络工具 — web_search + web_fetch
 */
import { tool } from "@openai/agents";
import { z } from "zod";
import { searchDuckDuckGo, fetchUrl } from "../core/web-service.js";
import { formatError } from "../core/agent-helpers.js";

export const webSearchTool = tool({
  name: "web_search",
  description:
    "使用 DuckDuckGo 搜索互联网。" +
    "【使用场景】查找最新信息、官方文档、技术方案、新闻动态。" +
    "【注意】返回结果包含标题、摘要和链接。如需详细内容，请用 web_fetch 抓取具体页面。",
  parameters: z.object({
    query: z.string().min(1).describe("搜索关键词，尽量精确。示例: \"TypeScript 5.0 release notes\""),
    count: z.number().min(1).max(10).default(5).describe("返回结果数量，默认 5"),
  }),
  execute: async ({ query, count }) => {
    try {
      const results = await searchDuckDuckGo(query, count);
      if (results.length === 0) {
        return "[OK] 未找到相关结果。请尝试其他关键词。";
      }
      return JSON.stringify(results, null, 2);
    } catch (err) {
      return `[ERROR] 搜索失败: ${formatError(err)}`;
    }
  },
});

export const webFetchTool = tool({
  name: "web_fetch",
  description:
    "抓取指定 URL 的网页内容（纯文本，HTML 已去标签）。" +
    "【使用场景】阅读在线文档、查看文章、获取 API 返回数据。" +
    "【注意】超时 15s，超过 500KB 截断。需要 JavaScript 渲染的页面可能无法正确获取。",
  parameters: z.object({
    url: z.string().url().describe("要抓取的完整 URL。示例: \"https://nodejs.org/api/fs.html\""),
  }),
  execute: async ({ url }) => {
    try {
      const content = await fetchUrl(url);
      return content || "[OK] 页面内容为空。";
    } catch (err) {
      return `[ERROR] 抓取失败: ${formatError(err)}`;
    }
  },
});
