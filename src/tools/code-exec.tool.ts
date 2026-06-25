/**
 * 代码执行工具 — run_code（沙盒专用）
 *
 * 在沙盒目录内执行 JS/TS/Python 代码片段，返回输出。
 */
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tool } from "@openai/agents";
import { z } from "zod";
import { formatError } from "../core/agent-helpers.js";

const execAsync = promisify(exec);

const TIMEOUT_MS = 30_000;
const MAX_OUTPUT = 50 * 1024;

type Language = "javascript" | "typescript" | "python";

const extension: Record<Language, string> = {
  javascript: ".mjs",
  typescript: ".ts",
  python: ".py",
};

const command: Record<Language, string> = {
  javascript: "node",
  typescript: "npx tsx",
  python: "python",
};

/** 在 cwd 创建临时脚本目录 */
async function ensureScriptDir(cwd: string): Promise<string> {
  const dir = join(cwd, ".scripts");
  await mkdir(dir, { recursive: true });
  return dir;
}

async function execOne(
  cmd: string,
  cwd: string,
  timeout: number
): Promise<{ stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await execAsync(cmd, { cwd, timeout, maxBuffer: MAX_OUTPUT });
    return { stdout, stderr };
  } catch (err: any) {
    return { stdout: err?.stdout ?? "", stderr: err?.stderr ?? formatError(err) };
  }
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.substring(0, maxLen) + `\n[TRUNCATED ${text.length - maxLen} bytes]`;
}

export const runCodeTool = tool({
  name: "run_code",
  description:
    "在沙盒中执行代码片段并返回输出。" +
    "【使用场景】验证算法、测试函数、快速实验脚本。支持 JavaScript/TypeScript/Python。" +
    "【注意】超时 30s，输出截断 50KB。需要安装对应运行时（node/npx tsx/python）。" +
    "此工具仅在沙盒模式下可用。",
  parameters: z.object({
    language: z.enum(["javascript", "typescript", "python"]).describe("编程语言"),
    code: z.string().min(1).describe("要执行的完整代码"),
  }),
  needsApproval: true,
  execute: async ({ language, code }, runContext) => {
    // 从 runContext 获取沙盒路径（由 assembler 注入到 extraPromptVars）
    const ctx = runContext?.context as any;
    const cwd = ctx?.workspaceRoot ?? process.cwd();

    try {
      const ext = extension[language];
      const cmd = command[language];
      const dir = await ensureScriptDir(cwd);
      const filePath = join(dir, `temp_${Date.now()}${ext}`);

      await writeFile(filePath, code, "utf-8");
      const fullCmd = `${cmd} "${filePath}"`;
      const { stdout, stderr } = await execOne(fullCmd, cwd, TIMEOUT_MS);

      const parts: string[] = [];
      if (stdout.trim()) parts.push(truncate(stdout, MAX_OUTPUT));
      if (stderr.trim()) parts.push("[stderr]\n" + truncate(stderr, MAX_OUTPUT / 2));

      return parts.join("\n") || "[OK] 代码执行完成，无输出。";
    } catch (err) {
      return `[ERROR] 代码执行失败: ${formatError(err)}`;
    }
  },
});
