import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import { SandboxManager } from "../../core/sandbox.js";

describe("SandboxManager", () => {
  let sandbox: SandboxManager;

  beforeEach(() => { sandbox = new SandboxManager(); });
  afterEach(async () => { await sandbox.autoDestroy(); });

  it("初始状态无活跃沙盒", () => {
    expect(sandbox.isActive).toBe(false);
    expect(sandbox.active).toBeNull();
  });

  it("create 创建临时目录并激活", async () => {
    const dir = await sandbox.create("test");
    expect(sandbox.isActive).toBe(true);
    expect(sandbox.active).toBe(dir);
    expect(dir).toContain("deepagent-sandbox-test-");

    // 确认目录真实存在
    const stat = await fs.stat(dir);
    expect(stat.isDirectory()).toBe(true);
  });

  it("重复 create 应报错", async () => {
    await sandbox.create("first");
    await expect(sandbox.create("second")).rejects.toThrow("沙盒已激活");
  });

  it("destroy 删除目录并失活", async () => {
    const dir = await sandbox.create("del-test");
    await sandbox.destroy();
    expect(sandbox.isActive).toBe(false);
    expect(sandbox.active).toBeNull();

    // 确认目录已被删除
    await expect(fs.stat(dir)).rejects.toThrow();
  });

  it("destroy 空操作不报错", async () => {
    await expect(sandbox.destroy()).resolves.toBeUndefined();
  });

  it("autoDestroy 清理残留沙盒", async () => {
    const dir = await sandbox.create("auto");
    await sandbox.autoDestroy();
    await expect(fs.stat(dir)).rejects.toThrow();
  });
});
