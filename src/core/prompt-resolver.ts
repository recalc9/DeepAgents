/**
 * PromptResolver — Harness 工程 Prompt 模板系统
 *
 * 三层设计中的第 2 层：
 *   1. 从 src/prompts/{key}.md 加载模板
 *   2. mtime 缓存：文件未变直接命中，改了即时生效（热加载）
 *   3. {{variable}} Mustache 风格变量替换
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";

interface CacheEntry {
  template: string;
  mtimeMs: number;
}

export class PromptResolver {
  private cache = new Map<string, CacheEntry>();
  private baseDir: string;

  constructor(baseDir?: string) {
    this.baseDir = baseDir ?? path.join(process.cwd(), "src", "prompts");
  }

  /**
   * 加载模板文件，自动处理 mtime 缓存。
   * 文件不存在或不可读时抛出明确错误。
   */
  async load(key: string): Promise<string> {
    const filePath = path.join(this.baseDir, `${key}.prompt.md`);

    let stat: { mtimeMs: number };
    try {
      stat = await fs.stat(filePath);
    } catch {
      throw new Error(`[PromptResolver] 模板文件不存在: ${filePath}`);
    }

    // mtime 缓存命中 → 直接返回
    const cached = this.cache.get(key);
    if (cached && cached.mtimeMs === stat.mtimeMs) {
      return cached.template;
    }

    // 读取并缓存
    const template = await fs.readFile(filePath, "utf-8");
    this.cache.set(key, { template, mtimeMs: stat.mtimeMs });
    return template;
  }

  /**
   * 替换模板中的 {{variable}} 占位符。
   * 未匹配的变量保留原样，方便发现遗漏。
   */
  resolve(template: string, vars: Record<string, string>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
      return key in vars ? vars[key]! : match;
    });
  }

  /**
   * 便捷方法：加载并解析一步完成。
   */
  async loadAndResolve(key: string, vars: Record<string, string>): Promise<string> {
    const template = await this.load(key);
    return this.resolve(template, vars);
  }
}
