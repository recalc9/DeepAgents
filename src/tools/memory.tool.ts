/**
 * Memory 工具 — memory_save / memory_search / memory_forget
 *
 * 持久化对话记忆，跨会话存储。
 * 存储位置：~/.deepagent/memory/*.json
 */
import { readFile, writeFile, mkdir, readdir, unlink } from "node:fs/promises";
import { join, basename } from "node:path";
import { homedir } from "node:os";
import { tool } from "@openai/agents";
import { z } from "zod";
import { formatError } from "../core/agent-helpers.js";

const MEMORY_DIR = join(homedir(), ".deepagent", "memory");

async function ensureDir(): Promise<void> {
  await mkdir(MEMORY_DIR, { recursive: true });
}

interface MemoryEntry {
  id: string;
  content: string;
  tags: string[];
  timestamp: string;
}

function toFilename(id: string): string {
  return join(MEMORY_DIR, `${id.replace(/[^a-zA-Z0-9_-]/g, "_")}.json`);
}

export const memorySaveTool = tool({
  name: "memory_save",
  description:
    "保存一条记忆到持久化存储。" +
    "【使用场景】记住用户偏好、项目约定、常用命令等，下次对话时可回忆。",
  parameters: z.object({
    key: z.string().describe("记忆标识（如 'user_prefs'、'project_commands'）"),
    content: z.string().describe("要记忆的内容"),
    tags: z.string().optional().describe("逗号分隔的标签，用于搜索"),
  }),
  execute: async ({ key, content, tags }) => {
    try {
      await ensureDir();
      const entry: MemoryEntry = {
        id: key,
        content,
        tags: tags ? tags.split(",").map(t => t.trim()).filter(Boolean) : [],
        timestamp: new Date().toISOString(),
      };
      await writeFile(toFilename(key), JSON.stringify(entry, null, 2), "utf-8");
      return `✓ 已记忆: "${key}" (${content.length} 字符)${tags ? ` | 标签: ${tags}` : ""}`;
    } catch (err) {
      return `[ERROR] 保存失败: ${formatError(err)}`;
    }
  },
});

export const memorySearchTool = tool({
  name: "memory_search",
  description:
    "搜索已保存的记忆。" +
    "【使用场景】查找之前记住的信息、偏好、约定。",
  parameters: z.object({
    query: z.string().describe("搜索关键词（匹配 key / content / tags）"),
  }),
  execute: async ({ query }) => {
    try {
      await ensureDir();
      const files = await readdir(MEMORY_DIR).catch(() => []);
      const q = query.toLowerCase();
      const results: string[] = [];

      for (const file of files) {
        if (!file.endsWith(".json")) continue;
        try {
          const data = await readFile(join(MEMORY_DIR, file), "utf-8");
          const entry: MemoryEntry = JSON.parse(data);
          if (entry.id.toLowerCase().includes(q) || entry.content.toLowerCase().includes(q) ||
            entry.tags.some(t => t.toLowerCase().includes(q))) {
            results.push(`**${entry.id}**\n${entry.content.length > 300 ? entry.content.substring(0, 300) + "…" : entry.content}\n_${entry.timestamp.substring(0, 10)} | 标签: ${entry.tags.join(", ") || "(无)"}_`);
          }
        } catch {
          // 跳过损坏文件
        }
      }

      if (results.length === 0) return `未找到匹配 "${query}" 的记忆。`;
      return `找到 ${results.length} 条记忆:\n\n` + results.join("\n\n---\n\n");
    } catch (err) {
      return `[ERROR] 搜索失败: ${formatError(err)}`;
    }
  },
});

export const memoryForgetTool = tool({
  name: "memory_forget",
  description:
    "删除一条记忆。" +
    "【使用场景】信息过时或不再需要时清理。",
  parameters: z.object({
    key: z.string().describe("要删除的记忆标识"),
  }),
  execute: async ({ key }) => {
    try {
      await ensureDir();
      await unlink(toFilename(key));
      return `✓ 已遗忘: "${key}"`;
    } catch (err) {
      return `[ERROR] 删除失败（可能不存在）: ${formatError(err)}`;
    }
  },
});

export const memoryListTool = tool({
  name: "memory_list",
  description:
    "列出所有已保存的记忆（只显示 key 和标签）。" +
    "【使用场景】浏览已有记忆，决定是否需要清理。",
  parameters: z.object({}),
  execute: async () => {
    try {
      await ensureDir();
      const files = await readdir(MEMORY_DIR).catch(() => []);
      const entries: string[] = [];

      for (const file of files) {
        if (!file.endsWith(".json")) continue;
        try {
          const data = await readFile(join(MEMORY_DIR, file), "utf-8");
          const entry: MemoryEntry = JSON.parse(data);
          entries.push(`- **${entry.id}** (${entry.tags.join(", ") || "无标签"}, ${entry.timestamp.substring(0, 10)})`);
        } catch { /* skip */ }
      }

      if (entries.length === 0) return "暂无记忆。使用 memory_save 开始记录。";
      return `共 ${entries.length} 条记忆:\n\n` + entries.join("\n");
    } catch (err) {
      return `[ERROR] ${formatError(err)}`;
    }
  },
});
