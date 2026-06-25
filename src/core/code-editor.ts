/**
 * EditorImpl — 实现 @openai/agents SDK 的 Editor 接口
 *
 * SDK 的 applyPatchTool 将 LLM 生成的 V4A diff 解析为三种操作：
 *   create_file / update_file / delete_file
 *
 * 接收已构建的 FileSystemService 实例，共享路径安全边界。
 */
import type { Editor, ApplyPatchResult, EditorInvocationContext } from "@openai/agents";
import { applyDiff } from "@openai/agents";
import type { FileSystemService } from "./filesystem.js";

export class EditorImpl implements Editor {
  constructor(private fs: FileSystemService) {}

  async createFile(
    operation: { type: "create_file"; path: string; diff: string },
    _context?: EditorInvocationContext
  ): Promise<ApplyPatchResult> {
    try {
      const content = applyDiff("", operation.diff, "create");
      await this.fs.writeFile(operation.path, content);
      return {
        status: "completed",
        output: `[OK] 已创建文件: ${operation.path} (${content.split("\n").length} 行)`,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { status: "failed", output: `[ERROR] 创建文件失败: ${msg}` };
    }
  }

  async updateFile(
    operation: { type: "update_file"; path: string; diff: string; moveTo?: string },
    _context?: EditorInvocationContext
  ): Promise<ApplyPatchResult> {
    try {
      const existing = await this.fs.readFile(operation.path);
      const updated = applyDiff(existing, operation.diff, "default");
      const targetPath = operation.moveTo ?? operation.path;
      await this.fs.writeFile(targetPath, updated);
      const action = operation.moveTo
        ? `已移动并更新: ${operation.path} → ${targetPath}`
        : `已更新文件: ${targetPath}`;
      return { status: "completed", output: `[OK] ${action}` };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { status: "failed", output: `[ERROR] 更新文件失败: ${msg}` };
    }
  }

  async deleteFile(
    operation: { type: "delete_file"; path: string },
    _context?: EditorInvocationContext
  ): Promise<ApplyPatchResult> {
    try {
      await this.fs.deleteFile(operation.path);
      return { status: "completed", output: `[OK] 已删除文件: ${operation.path}` };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { status: "failed", output: `[ERROR] 删除文件失败: ${msg}` };
    }
  }
}
