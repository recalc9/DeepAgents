/**
 * ShellServiceImpl — SDK Shell 接口实现
 *
 * 在沙盒根目录内执行 shell 命令。
 * 使用 child_process.exec，cwd 锁定沙盒，超时 + 输出截断保护。
 */
import { exec } from "node:child_process";
import { promisify } from "node:util";
import type { Shell, ShellAction, ShellResult, ShellOutputResult } from "@openai/agents";
import { formatError } from "./agent-helpers.js";

const execAsync = promisify(exec);

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_OUTPUT_BYTES = 50 * 1024;

export class ShellServiceImpl implements Shell {
  constructor(private cwd: string) {}

  async run(action: ShellAction): Promise<ShellResult> {
    const timeoutMs = action.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const maxLen = action.maxOutputLength ?? MAX_OUTPUT_BYTES;

    const outputs: ShellOutputResult[] = [];

    for (const command of action.commands) {
      try {
        const { stdout, stderr } = await this.execOne(command, timeoutMs);
        outputs.push({
          stdout: this.truncate(stdout, maxLen),
          stderr: this.truncate(stderr, maxLen),
          outcome: { type: "exit" as const, exitCode: 0 },
        });
      } catch (err) {
        outputs.push({
          stdout: "",
          stderr: formatError(err),
          outcome: { type: "exit" as const, exitCode: 1 },
        });
      }
    }

    return { output: outputs, maxOutputLength: maxLen };
  }

  private async execOne(command: string, timeoutMs: number): Promise<{ stdout: string; stderr: string }> {
    try {
      const { stdout, stderr } = await execAsync(command, { cwd: this.cwd, timeout: timeoutMs, maxBuffer: MAX_OUTPUT_BYTES });
      return { stdout, stderr };
    } catch (err: any) {
      return { stdout: (err as any)?.stdout ?? "", stderr: (err as any)?.stderr ?? formatError(err) };
    }
  }

  private truncate(text: string, maxLen: number): string {
    if (text.length <= maxLen) return text;
    return text.substring(0, maxLen) + `\n[TRUNCATED ${text.length - maxLen} bytes]`;
  }
}
