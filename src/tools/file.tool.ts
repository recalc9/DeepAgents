import { tool } from '@openai/agents';
import { z } from 'zod';
import type { AppContext } from '../core/agent-context';

/**
 * 安全路径解析辅助函数
 * 防止 LLM 生成 ../../etc/passwd 等危险路径
 */
function sanitizePath(rawPath: string): string {
  // 移除空字节、规范化路径、限制在允许的工作目录内
  const normalized = rawPath.replace(/\0/g, '').trim();
  if (normalized.includes('..')) {
    throw new Error('Path traversal detected: ".." is not allowed');
  }
  return normalized;
}

export const fileReadTool = tool({
  name: 'file_read',
  description: 
    '读取本地文本文件内容。' +
    '【使用场景】当需要分析代码结构、查看配置文件、读取日志排查问题时使用。' +
    '【注意】仅支持 UTF-8 文本文件，二进制文件会返回错误。超过 10KB 的内容会被截断。',
  parameters: z.object({
    path: z.string()
      .min(1)
      .describe('目标文件的相对路径或绝对路径。禁止使用 ".." 进行目录穿越。示例: "src/config.yaml"'),
  }),
  execute: async ({ path }, runContext) => {
    const ctx = runContext?.context as AppContext | undefined;
    if (!ctx) return '[ERROR] AppContext not available. Cannot read file.';

    try {
      const safePath = sanitizePath(path);
      const content = await ctx.readFile(safePath);

      // 大文件截断保护，避免撑爆 LLM Token 窗口
      const MAX_CHARS = 10000;
      if (content.length > MAX_CHARS) {
        return content.substring(0, MAX_CHARS) + 
          `\n\n[TRUNCATED] File is ${content.length} chars, showing first ${MAX_CHARS}. Use specific line ranges or search tools for large files.`;
      }
      return content;
    } catch (err) {
      // 将技术异常翻译为 LLM 可理解的语义化错误
      const msg = err instanceof Error ? err.message : String(err);
      return `[ERROR] Failed to read "${path}": ${msg}`;
    }
  },
});

export const fileWriteTool = tool({
  name: 'file_write',
  description: 
    '创建或覆盖写入本地文件。' +
    '【使用场景】当需要生成代码文件、更新配置、保存分析结果时使用。' +
    '【注意】此操作会完全覆盖已有文件内容。如需追加，请先读取再拼接写入。',
  parameters: z.object({
    path: z.string().min(1).describe('目标文件路径。禁止使用 ".."。'),
    content: z.string().describe('要写入的完整文件内容。确保包含必要的换行符和缩进。'),
  }),
  execute: async ({ path, content }, runContext) => {
    const ctx = runContext?.context as AppContext | undefined;
    if (!ctx) return '[ERROR] AppContext not available. Cannot write file.';

    try {
      const safePath = sanitizePath(path);
      await ctx.writeFile(safePath, content);
      return `[SUCCESS] Written ${content.length} chars to "${safePath}"`;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return `[ERROR] Failed to write "${path}": ${msg}`;
    }
  },
});

export const fileTools = [fileReadTool, fileWriteTool];