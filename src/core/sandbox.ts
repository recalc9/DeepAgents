/**
 * SandboxManager — 本地沙盒临时目录管理
 *
 * 创建 /tmp/deepagent-sandbox-{random}/，所有 Agent 文件操作圈在此内。
 * 退出/Ctrl+C/进程崩溃时自动清理，不留泄漏。
 */
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

export class SandboxManager {
  private _active: string | null = null;
  private _cleanedUp = false;

  /** 创建沙盒临时目录，返回绝对路径 */
  async create(label?: string): Promise<string> {
    if (this._active) {
      throw new Error(`沙盒已激活: ${this._active}，请先 /exit-sandbox`);
    }
    const prefix = label ? `deepagent-sandbox-${label}-` : "deepagent-sandbox-";
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
    this._active = dir;
    this._cleanedUp = false;
    return dir;
  }

  /** 当前沙盒路径（无沙盒返回 null） */
  get active(): string | null {
    return this._active;
  }

  get isActive(): boolean {
    return this._active !== null;
  }

  /** 销毁沙盒：递归删除临时目录 */
  async destroy(): Promise<void> {
    if (!this._active || this._cleanedUp) return;
    const dir = this._active;
    this._active = null;
    this._cleanedUp = true;
    try {
      await fs.rm(dir, { recursive: true, force: true });
    } catch {
      // 目录可能已被手动删除，忽略
    }
  }

  /** 注册自动清理，调用方应在 process.on("exit") 和 SIGINT 中触发 */
  async autoDestroy(): Promise<void> {
    if (this._active && !this._cleanedUp) {
      await this.destroy();
    }
  }
}
