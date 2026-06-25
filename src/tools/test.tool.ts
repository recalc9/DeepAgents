/**
 * Test 工具 — test_run / test_coverage / test_generate
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

export const testRunTool = tool({
  name: "test_run",
  description:
    "执行项目的测试命令。" +
    "【使用场景】运行测试套件，验证代码变更。" +
    "【注意】会先检测项目可用的测试命令（npm test / jest / pytest）。超时 60s，输出截断 50KB。",
  parameters: z.object({
    command: z.string().optional().describe("自定义测试命令（不填则自动检测）"),
  }),
  execute: async ({ command }) => {
    try {
      const cmd = command ?? "npm test -- --passWithNoTests 2>/dev/null; npm test 2>/dev/null; npx jest --passWithNoTests 2>/dev/null; python -m pytest 2>/dev/null; echo 'NO_TESTS'";
      const { stdout, stderr } = await execAsync(cmd, {
        timeout: 60_000, maxBuffer: MAX_OUTPUT,
      });

      const output = truncate(stdout || stderr, MAX_OUTPUT);
      if (output.includes("NO_TESTS") && !output.includes("PASS")) {
        return "[WARN] 未检测到可用的测试命令。请在 package.json scripts 中配置 test，或使用 command 参数指定。";
      }
      const failed = output.match(/(\d+) failing/) || output.match(/FAILED/) || output.match(/E\s+/) ? true : false;
      const icon = failed ? "❌" : "✓";
      return `${icon} 测试结果:\n${output}`;
    } catch (err: any) {
      const output = truncate(err?.stdout ?? err?.stderr ?? formatError(err), MAX_OUTPUT);
      return `❌ 测试失败:\n${output}`;
    }
  },
});

export const testCoverageTool = tool({
  name: "test_coverage",
  description:
    "运行测试覆盖率分析。" +
    "【使用场景】检查代码覆盖率，找出未覆盖的文件。" +
    "【注意】支持 jest --coverage 和 pytest --cov。超时 60s。",
  parameters: z.object({
    command: z.string().optional().describe("自定义覆盖率命令"),
  }),
  execute: async ({ command }) => {
    try {
      const cmd = command ?? "npx jest --coverage --passWithNoTests 2>/dev/null; python -m pytest --cov=. 2>/dev/null; echo 'NO_COVERAGE'";
      const { stdout, stderr } = await execAsync(cmd, {
        timeout: 60_000, maxBuffer: MAX_OUTPUT,
      });

      const output = truncate(stdout || stderr, MAX_OUTPUT);
      if (output.includes("NO_COVERAGE")) {
        return "[WARN] 未检测到覆盖率工具。请安装 jest（npm i -D jest）或 pytest-cov。";
      }
      return `覆盖率结果:\n${output}`;
    } catch (err: any) {
      const output = truncate(err?.stdout ?? err?.stderr ?? formatError(err), MAX_OUTPUT);
      return `覆盖率执行结果:\n${output}`;
    }
  },
});

export const testGenerateTool = tool({
  name: "test_generate",
  description:
    "分析源文件并生成建议的测试用例。" +
    "【使用场景】为新功能编写测试用例时获取建议。" +
    "【注意】生成的是测试建议（自然语言描述），不是可执行代码。需要 Code Agent 或用户手动实现。",
  parameters: z.object({
    sourcePath: z.string().describe("要分析测试的源文件路径"),
  }),
  execute: async ({ sourcePath }) => {
    try {
      const { readFile } = await import("node:fs/promises");
      const content = await readFile(sourcePath, "utf-8").catch(() => "");

      if (!content) {
        return `[ERROR] 无法读取文件: ${sourcePath}`;
      }

      // 提取导出的函数/类名
      const exports = content.match(/export\s+(async\s+)?(function|class|const|let|var)\s+(\w+)/g);
      const names = exports?.map(e => e.split(/\s+/).pop() ?? "").filter(Boolean) ?? [];

      if (names.length === 0) {
        return `在 ${sourcePath} 中未找到可测试的导出函数或类。`;
      }

      let result = `文件: ${sourcePath}\n`;
      result += `可测试的导出: ${names.join(", ")}\n\n`;
      result += "建议的测试用例（自然语言描述）：\n\n";

      for (const name of names) {
        result += `### ${name}\n`;
        result += `- 正常输入：验证 ${name} 在正常参数下返回预期结果\n`;
        result += `- 边界值：测试 ${name} 的空值、极值、边界条件\n`;
        result += `- 错误处理：传入无效参数时 ${name} 应抛出明确的错误\n`;
        result += `- 集成：${name} 与依赖模块协作时的行为\n`;
        result += "\n";
      }

      result += "提示：使用 file_read 查看源文件后，可由 Code Agent 在沙盒中用 run_code 实现测试代码。";
      return result;
    } catch (err) {
      return `[ERROR] 分析失败: ${formatError(err)}`;
    }
  },
});
