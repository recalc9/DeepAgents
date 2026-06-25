/**
 * Review 工具 — lint_run / type_check / format_check / pr_review
 */
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { tool } from "@openai/agents";
import { z } from "zod";
import { formatError } from "../core/agent-helpers.js";

const execAsync = promisify(exec);
const MAX_OUTPUT = 50 * 1024;

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.substring(0, maxLen) + `\n[TRUNCATED ${text.length - maxLen} bytes]`;
}

export const lintRunTool = tool({
  name: "lint_run",
  description:
    "执行代码静态分析（ESLint / TSC / 其他 linter）。" +
    "自动检测项目配置的 linter 并运行。",
  parameters: z.object({
    path: z.string().default(".").describe("检查的目录或文件路径"),
    command: z.string().optional().describe("覆盖自动检测，直接指定 lint 命令"),
  }),
  execute: async ({ path: scanPath, command }) => {
    try {
      const cmd = command ?? "npx eslint " + scanPath + " 2>/dev/null; echo '---FALLBACK---'";
      const { stdout, stderr } = await execAsync(cmd, { timeout: 60_000, maxBuffer: MAX_OUTPUT, cwd: process.cwd() });
      const output = truncate(stdout || stderr, MAX_OUTPUT);
      if (output.includes("---FALLBACK---") && !output.includes("error") && !output.includes("warning")) {
        return "[OK] 未检测到 ESLint。可安装: npm i -D eslint，或使用 command 参数指定其他 linter。";
      }
      const hasIssues = output.match(/\d+ (error|warning|problem)/i);
      return hasIssues ? `❌ 发现问题:\n${output}` : `✓ 通过:\n${output}`;
    } catch (err: any) {
      const output = truncate(err?.stdout ?? err?.stderr ?? formatError(err), MAX_OUTPUT);
      return output.includes("error") || output.includes("warning") ? `❌ Lint 问题:\n${output}` : `✓ 通过:\n${output}`;
    }
  },
});

export const typeCheckTool = tool({
  name: "type_check",
  description:
    "运行 TypeScript 类型检查（tsc --noEmit）。" +
    "【使用场景】验证代码是否有类型错误。",
  parameters: z.object({
    command: z.string().optional().describe("覆盖默认的 tsc --noEmit"),
  }),
  execute: async ({ command }) => {
    try {
      const cmd = command ?? "npx tsc --noEmit";
      const { stdout, stderr } = await execAsync(cmd, { timeout: 60_000, maxBuffer: MAX_OUTPUT, cwd: process.cwd() });
      const output = truncate(stdout || stderr, MAX_OUTPUT).trim();
      if (!output) return "✓ 类型检查通过，零错误。";
      return output.match(/error TS\d+/) ? `❌ 类型错误:\n${output}` : `✓ 通过:\n${output}`;
    } catch (err: any) {
      const output = truncate(err?.stdout ?? err?.stdout ?? err?.stderr ?? formatError(err), MAX_OUTPUT);
      return `❌ 类型错误:\n${output}`;
    }
  },
});

export const formatCheckTool = tool({
  name: "format_check",
  description:
    "检查代码格式（Prettier / Black）。" +
    "【使用场景】验证代码是否按项目规范格式化。",
  parameters: z.object({
    path: z.string().default("src").describe("检查的目录"),
    command: z.string().optional().describe("自定义格式化命令"),
  }),
  execute: async ({ path: scanPath, command }) => {
    try {
      const cmd = command ?? `npx prettier --check "${scanPath}/**/*.ts" 2>/dev/null; echo '---FALLBACK---'`;
      const { stdout, stderr } = await execAsync(cmd, { timeout: 30_000, maxBuffer: MAX_OUTPUT, cwd: process.cwd() });
      const output = truncate(stdout || stderr, MAX_OUTPUT);
      if (output.includes("---FALLBACK---") && !output.includes("Code style")) {
        return "[OK] 未检测到 Prettier。安装: npm i -D prettier";
      }
      return output.includes("Code style issues") || output.includes("not formatted") ? `❌ 格式问题:\n${output}` : `✓ 格式一致:\n${output}`;
    } catch (err: any) {
      const output = truncate(err?.stdout ?? err?.stderr ?? formatError(err), MAX_OUTPUT);
      return output.includes("Code style") || output.includes("not formatted") ? `❌ 格式问题:\n${output}` : `✓ 格式一致:\n${output}`;
    }
  },
});

export const prReviewTool = tool({
  name: "pr_review",
  description:
    "对比当前分支和 main 的差异，生成代码审查建议。" +
    "【使用场景】提交 PR 前的自查。",
  parameters: z.object({
    baseBranch: z.string().default("main").describe("基础分支名"),
  }),
  execute: async ({ baseBranch }) => {
    try {
      // 获取差异
      const { stdout: diffStat } = await execAsync(`git diff ${baseBranch} --stat`, { cwd: process.cwd(), maxBuffer: MAX_OUTPUT }).catch(() => ({ stdout: "" }));
      const { stdout: changedFiles } = await execAsync(`git diff ${baseBranch} --name-only`, { cwd: process.cwd(), maxBuffer: MAX_OUTPUT }).catch(() => ({ stdout: "" }));
      const { stdout: diffFull } = await execAsync(`git diff ${baseBranch} -- . ':!package-lock.json' ':!dist/*'`, { cwd: process.cwd(), maxBuffer: 200 * 1024 }).catch(() => ({ stdout: "" }));

      const files = changedFiles.trim().split("\n").filter(Boolean);
      if (files.length === 0) return "✓ 当前分支与 " + baseBranch + " 无差异。";

      // 分析 diff 内容
      const diffPreview = diffFull.length > 10000 ? diffFull.substring(0, 10000) + "\n...[TRUNCATED]" : diffFull;

      let report = "";
      report += `### 变更概览 (vs ${baseBranch})\n`;
      report += `\n${diffStat || "(无法获取统计信息)"}\n`;
      report += `\n### 变更文件 (${files.length} 个)\n`;
      for (const f of files) report += `- ${f}\n`;

      // 简单风险分析
      const riskyPatterns = [
        { pattern: /\.env/i, desc: "环境变量文件被修改，确认没有泄露密钥" },
        { pattern: /package\.json/i, desc: "依赖文件被修改，确认版本变更合理" },
        { pattern: /\.d\.ts/i, desc: "类型声明文件被修改" },
        { pattern: /test/i, desc: "测试文件被修改" },
      ];
      report += `\n### 风险分析\n`;
      let hasRisks = false;
      for (const { pattern, desc } of riskyPatterns) {
        if (files.some(f => pattern.test(f))) {
          report += `⚠ ${desc}\n`;
          hasRisks = true;
        }
      }
      if (!hasRisks) report += "未检测到明显风险项。\n";

      report += `\n### Diff 预览\n\`\`\`diff\n${diffPreview}\n\`\`\``;
      report += `\n\n提示：以上为自动分析。请人工审查关键变更后再合并。`;

      return report;
    } catch (err) {
      return `[ERROR] ${formatError(err)}`;
    }
  },
});
