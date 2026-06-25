import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { PromptResolver } from "../../core/prompt-resolver.js";

describe("PromptResolver", () => {
  let tmpDir: string;
  let resolver: PromptResolver;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "deepagent-prompt-"));
    resolver = new PromptResolver(tmpDir);
  });

  afterEach(async () => {
    try { await fs.rm(tmpDir, { recursive: true, force: true }); } catch { /* */ }
  });

  it("加载存在的模板文件", async () => {
    await fs.writeFile(path.join(tmpDir, "test.prompt.md"), "Hello {{name}}!");
    const tpl = await resolver.load("test");
    expect(tpl).toBe("Hello {{name}}!");
  });

  it("加载不存在的文件应报错", async () => {
    await expect(resolver.load("missing")).rejects.toThrow("模板文件不存在");
  });

  it("mtime 缓存命中时不应重新读取", async () => {
    await fs.writeFile(path.join(tmpDir, "cached.prompt.md"), "v1");
    const t1 = await resolver.load("cached");
    expect(t1).toBe("v1");

    // 同 mtime → 从缓存返回
    const t2 = await resolver.load("cached");
    expect(t2).toBe("v1");
  });

  it("mtime 变更后应重新读取（热加载）", async () => {
    const filePath = path.join(tmpDir, "hot.prompt.md");
    await fs.writeFile(filePath, "v1");
    const t1 = await resolver.load("hot");
    expect(t1).toBe("v1");

    // 变更文件
    await new Promise(r => setTimeout(r, 10)); // 确保 mtime 不同
    await fs.writeFile(filePath, "v2");
    const t2 = await resolver.load("hot");
    expect(t2).toBe("v2");
  });

  // ── resolve ──

  it("替换单个变量", () => {
    expect(resolver.resolve("Hello {{name}}", { name: "World" })).toBe("Hello World");
  });

  it("替换多个变量", () => {
    expect(resolver.resolve("{{greeting}} {{name}}!", {
      greeting: "Hello",
      name: "DeepAgent",
    })).toBe("Hello DeepAgent!");
  });

  it("未匹配变量保留原样", () => {
    expect(resolver.resolve("Hi {{missing}}", {})).toBe("Hi {{missing}}");
  });

  it("部分匹配的变量", () => {
    expect(resolver.resolve("{{a}} and {{b}}", { a: "1" })).toBe("1 and {{b}}");
  });

  // ── loadAndResolve ──

  it("一步加载并解析", async () => {
    await fs.writeFile(path.join(tmpDir, "greet.prompt.md"), "Hello {{user}}!");
    const result = await resolver.loadAndResolve("greet", { user: "Tester" });
    expect(result).toBe("Hello Tester!");
  });
});
