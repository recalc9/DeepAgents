import { describe, it, expect } from "vitest";
import type { AgentConfig, ToolConfig, McpServerConfig, AssembleOptions } from "../../harness/types.js";

describe("Harness Types — 配置验证", () => {
  it("AgentConfig 必填字段检查", () => {
    const cfg: AgentConfig = {
      name: "test",
      factory: () => ({} as any),
      promptKey: "t",
      description: "d",
      children: [],
      handoffToParents: [],
      tools: [],
      guardrails: [],
      mcpServers: [],
    };
    expect(cfg.name).toBe("test");
    expect(cfg.children).toEqual([]);
    expect(cfg.mcpServers).toEqual([]);
  });

  it("ToolConfig 签名正确", () => {
    const cfg: ToolConfig = {
      name: "t",
      factory: (ctx) => ({ type: "function", name: "t" } as any),
    };
    expect(cfg.name).toBe("t");
    expect(typeof cfg.factory).toBe("function");
  });

  it("McpServerConfig stdio 模式", () => {
    const cfg: McpServerConfig = {
      name: "fs",
      stdio: { command: "npx", args: ["-y", "server"] },
      autoConnect: true,
    };
    expect(cfg.stdio?.command).toBe("npx");
    expect(cfg.autoConnect).toBe(true);
  });

  it("McpServerConfig SSE 模式", () => {
    const cfg: McpServerConfig = {
      name: "web",
      sse: { url: "http://localhost:3000/sse" },
    };
    expect(cfg.sse?.url).toBeDefined();
  });

  it("AssembleOptions 包含所有必填", () => {
    const opts: AssembleOptions = {
      workspaceRoot: "/tmp",
      editor: {} as any,
      mcpServers: [],
    };
    expect(opts.workspaceRoot).toBe("/tmp");
    expect(opts.mcpServers).toEqual([]);
  });

  it("AgentConfig 可选字段默认", () => {
    const cfg: AgentConfig = {
      name: "t",
      factory: () => ({} as any),
      promptKey: "k",
      description: "d",
      children: [],
      handoffToParents: [],
      tools: [],
      guardrails: [],
      mcpServers: [],
    };
    expect(cfg.rootHandoff).toBeUndefined();
    expect(cfg.asTool).toBeUndefined();
  });
});
