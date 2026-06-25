import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { FileSystemService } from "../../core/filesystem.js";

describe("FileSystemService", () => {
  let tmpDir: string;
  let fsService: FileSystemService;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "deepagent-test-"));
    fsService = new FileSystemService(tmpDir);
  });

  afterEach(async () => {
    try { await fs.rm(tmpDir, { recursive: true, force: true }); } catch { /* */ }
  });

  // ── resolvePath 边界 ──

  it("空路径应报错", async () => {
    await expect(fsService.readFile("")).rejects.toThrow("文件路径不能为空");
    await expect(fsService.readFile("  ")).rejects.toThrow("文件路径不能为空");
  });

  it(".. 路径穿越应被拒绝", async () => {
    await expect(fsService.readFile("../../../etc/passwd")).rejects.toThrow("..");
    await expect(fsService.readFile("foo/../../bar")).rejects.toThrow("..");
  });

  it("~ 路径应被拒绝", async () => {
    await expect(fsService.readFile("~/secret.txt")).rejects.toThrow('不支持 "~" 路径');
  });

  it("空字节注入应被拒绝", async () => {
    await expect(fsService.readFile("ok\0bad.txt")).rejects.toThrow("空字节");
  });

  it("越界绝对路径应被拒绝", async () => {
    await expect(fsService.readFile("/etc/passwd")).rejects.toThrow("路径越界");
  });

  it("相对路径应在根目录内解析", async () => {
    const file = path.join(tmpDir, "hello.txt");
    await fs.writeFile(file, "world");
    const content = await fsService.readFile("hello.txt");
    expect(content).toBe("world");
  });

  // ── readFile ──

  it("读取不存在的文件应报错", async () => {
    await expect(fsService.readFile("nonexistent.txt")).rejects.toThrow("文件不存在");
  });

  it("读取正常文本文件", async () => {
    const file = path.join(tmpDir, "test.txt");
    await fs.writeFile(file, "Hello, Test!", "utf-8");
    const content = await fsService.readFile("test.txt");
    expect(content).toBe("Hello, Test!");
  });

  it("超过 100KB 的文件应被截断", async () => {
    const file = path.join(tmpDir, "large.txt");
    const bigContent = "A".repeat(102400 + 100);
    await fs.writeFile(file, bigContent, "utf-8");
    const content = await fsService.readFile("large.txt");
    expect(content).toContain("[SERVICE TRUNCATED]");
  });

  // ── writeFile ──

  it("写入文件自动创建父目录", async () => {
    await fsService.writeFile("deep/nested/file.txt", "hello");
    const content = await fs.readFile(path.join(tmpDir, "deep/nested/file.txt"), "utf-8");
    expect(content).toBe("hello");
  });

  // ── deleteFile ──

  it("删除存在的文件", async () => {
    const file = path.join(tmpDir, "del.txt");
    await fs.writeFile(file, "delete me");
    await fsService.deleteFile("del.txt");
    await expect(fs.access(file)).rejects.toThrow();
  });

  it("删除不存在的文件应报错", async () => {
    await expect(fsService.deleteFile("gone.txt")).rejects.toThrow("文件不存在");
  });

  // ── exists ──

  it("exists 正确判断存在与否", async () => {
    expect(await fsService.exists("missing.txt")).toBe(false);
    const file = path.join(tmpDir, "real.txt");
    await fs.writeFile(file, "real");
    expect(await fsService.exists("real.txt")).toBe(true);
  });

  // ── getRoot ──

  it("getRoot 返回根目录", () => {
    expect(fsService.getRoot()).toBe(tmpDir);
  });
});
