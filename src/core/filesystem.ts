/**
 * FileSystemService — 真实文件系统服务
 *
 * 封装 Node.js fs/promises，强制工作目录边界，防止 Agent 越权访问。
 * 与 tools/file.tool.ts 中的 sanitizePath 形成纵深防御：
 *   - 工具层：LLM 输入侧拦截，返回语义错误提示
 *   - 服务层：实际 I/O 前强制边界检查，即便绕过工具层也无法越界
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { formatError } from "./agent-helpers.js";

export class FileSystemService {
  private rootDir: string;

  constructor(rootDir: string) {
    // 规范化根目录，确保始终以绝对路径存储
    this.rootDir = path.resolve(rootDir);
  }

  /** 公开根目录（调试/日志用途） */
  getRoot(): string {
    return this.rootDir;
  }

  /**
   * 将用户/LLM 提供的路径解析到工作目录内。
   * 相对路径拼接 rootDir，绝对路径先归一化再校验是否在 rootDir 内。
   * 抛出异常当：空路径、含空字节、含 .. 穿越、越界。
   */
  private resolvePath(userPath: string): string {
    if (!userPath || userPath.trim().length === 0) {
      throw new Error("文件路径不能为空");
    }

    // 空字节注入检测
    if (userPath.includes("\0")) {
      throw new Error("路径包含非法字符（空字节）");
    }

    // .. 穿越检测（在解析前拦截明显攻击）
    if (userPath.includes("..")) {
      throw new Error('路径穿越被拒绝：".." 不被允许');
    }

    // 处理 ~ 开头的路径（LLM 偶尔会生成）
    let normalized = userPath.trim();
    if (normalized.startsWith("~")) {
      throw new Error('不支持 "~" 路径，请使用项目内相对路径');
    }

    // 转义反斜杠并解析
    const resolved = path.resolve(this.rootDir, normalized);

    // 确保解析后的路径仍在 rootDir 内
    if (!resolved.startsWith(this.rootDir + path.sep) && resolved !== this.rootDir) {
      throw new Error(
        `路径越界：禁止访问工作目录以外的文件。` +
        `root=${this.rootDir}, requested=${normalized}`
      );
    }

    return resolved;
  }

  /**
   * 读取文本文件
   * @param filePath 相对于 rootDir 的文件路径
   * @returns 文件内容（UTF-8），超过 100KB 截断并标注
   */
  async readFile(filePath: string): Promise<string> {
    const safePath = this.resolvePath(filePath);

    // 检查文件是否存在，给出友好错误
    try {
      await fs.access(safePath);
    } catch {
      throw new Error(`文件不存在: ${filePath}`);
    }

    const content = await fs.readFile(safePath, "utf-8");

    // 服务层大文件保护（100KB），工具层另有 10KB Token 窗口保护
    const MAX_BYTES = 100 * 1024;
    if (Buffer.byteLength(content, "utf-8") > MAX_BYTES) {
      const truncated = content.substring(0, MAX_BYTES);
      return (
        truncated +
        `\n\n[SERVICE TRUNCATED] 文件过大（${Buffer.byteLength(content, "utf-8")} 字节），仅显示前 ${MAX_BYTES} 字节。`
      );
    }

    return content;
  }

  /**
   * 创建或覆盖写入文本文件，自动创建父目录
   * @param filePath 相对于 rootDir 的文件路径
   * @param content  要写入的内容
   */
  async writeFile(filePath: string, content: string): Promise<void> {
    const safePath = this.resolvePath(filePath);

    // 自动创建父目录（等效 mkdir -p）
    const dir = path.dirname(safePath);
    await fs.mkdir(dir, { recursive: true });

    await fs.writeFile(safePath, content, "utf-8");
  }

  /**
   * 检查文件是否存在
   */
  async exists(filePath: string): Promise<boolean> {
    try {
      const safePath = this.resolvePath(filePath);
      await fs.access(safePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 删除文件
   * @param filePath 相对于 rootDir 的文件路径
   */
  async deleteFile(filePath: string): Promise<void> {
    const safePath = this.resolvePath(filePath);

    try {
      await fs.access(safePath);
    } catch {
      throw new Error(`文件不存在: ${filePath}`);
    }

    await fs.unlink(safePath);
  }
}
