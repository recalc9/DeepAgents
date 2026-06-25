/**
 * ShellServiceImpl — SDK Shell 接口实现
 *
 * 在沙盒根目录内执行 shell 命令。
 * 使用 child_process.exec，cwd 锁定沙盒，超时 + 输出截断保护。
 */
import { exec } from "node:child_process";
import type { Shell, ShellAction, ShellResult, ShellOutputResult } from "@openai/agents";

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
        const msg = err instanceof Error ? err.message : String(err);
        outputs.push({
          stdout: "",
          stderr: msg,
          outcome: { type: "exit" as const, exitCode: 1 },
        });
      }
    }

    return { output: outputs, maxOutputLength: maxLen };
  }

  private execOne(
    command: string,
    timeoutMs: number
  ): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      exec(
        command,
        { cwd: this.cwd, timeout: timeoutMs, maxBuffer: MAX_OUTPUT_BYTES },
        (error, stdout, stderr) => {
          if (error && !stdout && !stderr) {
            reject(error);
            return;
          }
          resolve({ stdout, stderr });
        }
      );
    });
  }

  private truncate(text: string, maxLen: number): string {
    if (text.length <= maxLen) return text;
    return text.substring(0, maxLen) + `\n[TRUNCATED ${text.length - maxLen} bytes]`;
  }
}
