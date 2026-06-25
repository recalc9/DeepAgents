/**
 * Git 版本控制工具
 *
 * 薄封装 `git` CLI，Agent 可直接执行 git 操作。
 * 只读操作无需审批，写操作需要人工确认。
 */
import { exec } from "node:child_process";
import { tool } from "@openai/agents";
import { z } from "zod";
import { formatError } from "../core/agent-helpers.js";

const TIMEOUT_MS = 15_000;
const MAX_OUTPUT = 50 * 1024;

const READ_OPS = ["status", "diff", "log", "show", "branch"] as const;
const WRITE_OPS = ["add", "commit"] as const;
type GitOp = (typeof READ_OPS)[number] | (typeof WRITE_OPS)[number];

function execGit(args: string[], cwd: string): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    exec(
      `git ${args.join(" ")}`,
      { cwd, timeout: TIMEOUT_MS, maxBuffer: MAX_OUTPUT },
      (err, stdout, stderr) => {
        resolve({
          stdout: stdout || "",
          stderr: stderr || (err ? err.message : ""),
        });
      }
    );
  });
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.substring(0, maxLen) + `\n[TRUNCATED ${text.length - maxLen} bytes]`;
}

export const gitTool = tool({
  name: "git",
  description:
    "执行 Git 版本控制操作。" +
    "【只读操作】status(工作区状态)、diff(变更差异)、log(提交历史)、show(查看提交)、branch(分支列表)——无需确认。" +
    "【写操作】add(暂存文件)、commit(提交)——需要人工确认。" +
    "【注意】commit 会使用 `git config user.name/email`，请确保已配置。",
  parameters: z.object({
    operation: z.enum([...READ_OPS, ...WRITE_OPS]).describe("Git 操作类型"),
    /** commit message（仅 commit 时使用） */
    message: z.string().optional().describe("提交信息（commit 时必填）"),
    /** 文件路径或分支名 */
    target: z.string().optional().describe("目标：文件路径(add)、分支名(branch -d)、提交哈希(show)"),
  }),
  needsApproval: async (_ctx, { operation }: { operation: GitOp; [k: string]: unknown }) => {
    return (WRITE_OPS as readonly string[]).includes(operation);
  },
  execute: async ({ operation, message, target }, runContext) => {
    const ctx = runContext?.context as any;
    const cwd = ctx?.workspaceRoot ?? process.cwd();

    try {
      let args: string[] = [];

      switch (operation as GitOp) {
        case "status":  args = ["status", "--short"]; break;
        case "diff":    args = ["diff"]; break;
        case "log":     args = ["log", "--oneline", "-20"]; break;
        case "show":
          if (!target) return "[ERROR] show 操作需要指定提交哈希: git show <hash>";
          args = ["show", "--stat", target];
          break;
        case "branch":  args = ["branch", "-a"]; break;
        case "add":
          if (!target) return "[ERROR] add 操作需要指定文件路径或 .（全部）";
          args = ["add", target];
          break;
        case "commit":
          if (!message) return "[ERROR] commit 操作需要提供 message";
          args = ["commit", "-m", message];
          break;
      }

      const { stdout, stderr } = await execGit(args, cwd);
      const output = truncate(stdout || stderr || "(无输出)", MAX_OUTPUT);
      return `[${operation}] ${output}`;
    } catch (err) {
      return `[ERROR] git ${operation} 失败: ${formatError(err)}`;
    }
  },
});
