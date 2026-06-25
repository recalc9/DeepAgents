import { describe, it, expect, vi, beforeEach } from "vitest";
import { Agent } from "@openai/agents";

// Mock container to avoid DeepSeek model init
vi.mock("../../core/container.js", () => ({
  container: {
    getDeepSeekModel: () => ({}) as any,
  },
}));

import { assemble } from "../../harness/assembler.js";
import type { AgentConfig, ToolConfig, GuardrailConfig, AssembleOptions } from "../../harness/types.js";

function fakeFactory(name: string) {
  return (ctx: any) => new Agent<any, any>({
    name,
    model: ctx.model,
    instructions: name,
    handoffs: [],
    tools: ctx.getTools?.() ?? [],
    outputGuardrails: ctx.getGuardrails?.() ?? [],
  });
}

const baseOptions: AssembleOptions = {
  workspaceRoot: process.cwd(),
  editor: {} as any,
  mcpServers: [],
};

describe("Assembler", () => {
  // ── 拓扑排序 ──

  it("简单的两层层级排序：叶子先于父", () => {
    const configs: AgentConfig[] = [
      {
        name: "child", factory: fakeFactory("child"), promptKey: "child",
        description: "", children: [], handoffToParents: ["parent"],
        tools: [], guardrails: [], mcpServers: [],
      },
      {
        name: "parent", factory: fakeFactory("parent"), promptKey: "parent",
        description: "", children: ["child"], handoffToParents: [],
        tools: [], guardrails: [], mcpServers: [],
      },
    ];
    const graph = assemble(configs, [], [], baseOptions);
    expect(graph.agents.has("child")).toBe(true);
    expect(graph.agents.has("parent")).toBe(true);
  });

  // ── children handoff 连线 ──

  it("children handoff 自动连线", () => {
    const configs: AgentConfig[] = [
      {
        name: "leaf", factory: fakeFactory("leaf"), promptKey: "leaf",
        description: "", children: [], handoffToParents: ["root"],
        tools: [], guardrails: [], mcpServers: [],
      },
      {
        name: "root", factory: fakeFactory("root"), promptKey: "root",
        description: "", children: ["leaf"], handoffToParents: [],
        tools: [], guardrails: [], mcpServers: [],
      },
    ];
    const graph = assemble(configs, [], [], baseOptions);
    const root = graph.agents.get("root")!;
    const leaf = graph.agents.get("leaf")!;

    // root.handoffs 应包含 leaf
    expect(root.handoffs).toBeDefined();
    expect(root.handoffs!.length).toBeGreaterThanOrEqual(1);

    // leaf.handoffs 应包含 root（handoffToParents）
    expect(leaf.handoffs).toBeDefined();
    expect(leaf.handoffs!.length).toBeGreaterThanOrEqual(1);
  });

  // ── asTool 挂载 ──

  it("asTool 挂到父 Agent", () => {
    const configs: AgentConfig[] = [
      {
        name: "sub", factory: fakeFactory("sub"), promptKey: "sub",
        description: "", children: [], handoffToParents: [],
        tools: [], guardrails: [], mcpServers: [],
        asTool: { toolName: "sub_tool", toolDescription: "desc", exposeTo: "main" },
      },
      {
        name: "main", factory: fakeFactory("main"), promptKey: "main",
        description: "", children: [], handoffToParents: [],
        tools: [], guardrails: [], mcpServers: [],
      },
    ];
    const graph = assemble(configs, [], [], baseOptions);
    const main = graph.agents.get("main")!;
    // main.tools 应包含 sub 作为 tool
    expect(main.tools!.length).toBeGreaterThanOrEqual(1);
  });

  // ── rootHandoff 暴露 ──

  it("rootHandoff 暴露给 triage", () => {
    const configs: AgentConfig[] = [
      {
        name: "gpt", factory: fakeFactory("gpt"), promptKey: "gpt",
        description: "", children: [], handoffToParents: ["triage"],
        tools: [], guardrails: [], mcpServers: [], rootHandoff: true,
      },
      {
        name: "triage", factory: fakeFactory("triage"), promptKey: "triage",
        description: "", children: [], handoffToParents: [],
        tools: [], guardrails: [], mcpServers: [],
      },
    ];
    const graph = assemble(configs, [], [], baseOptions);
    const triage = graph.agents.get("triage")!;
    expect(triage.handoffs!.length).toBeGreaterThanOrEqual(1);
  });

  // ── 验证 ──

  it("缺失子 Agent 引用应报错", () => {
    const configs: AgentConfig[] = [
      {
        name: "bad", factory: fakeFactory("bad"), promptKey: "bad",
        description: "", children: ["nonexistent"], handoffToParents: [],
        tools: [], guardrails: [], mcpServers: [],
      },
    ];
    expect(() => assemble(configs, [], [], baseOptions)).toThrow("未注册");
  });

  it("缺失工具引用应报错", () => {
    const configs: AgentConfig[] = [
      {
        name: "a", factory: fakeFactory("a"), promptKey: "a",
        description: "", children: [], handoffToParents: [],
        tools: ["missing_tool"], guardrails: [], mcpServers: [],
      },
    ];
    expect(() => assemble(configs, [], [], baseOptions)).toThrow("未找到工具");
  });

  it("缺失护栏引用应报错", () => {
    const configs: AgentConfig[] = [
      {
        name: "a", factory: fakeFactory("a"), promptKey: "a",
        description: "", children: [], handoffToParents: [],
        tools: [], guardrails: ["missing_guardrail"], mcpServers: [],
      },
    ];
    expect(() => assemble(configs, [], [], baseOptions)).toThrow("未找到护栏");
  });

  // ── handoffDescription 注入 ──

  it("description 注入到 Agent", () => {
    const configs: AgentConfig[] = [
      {
        name: "test", factory: fakeFactory("test"), promptKey: "test",
        description: "测试描述", children: [], handoffToParents: [],
        tools: [], guardrails: [], mcpServers: [],
      },
    ];
    const graph = assemble(configs, [], [], baseOptions);
    const agent = graph.agents.get("test")!;
    expect((agent as any).handoffDescription).toBe("测试描述");
  });

  // ── 工具注入 ──

  it("工具按名称注入到 Agent", () => {
    const toolConfigs: ToolConfig[] = [
      { name: "my_tool", factory: () => ({ type: "function", name: "my_tool" } as any) },
    ];
    const configs: AgentConfig[] = [
      {
        name: "a", factory: fakeFactory("a"), promptKey: "a",
        description: "", children: [], handoffToParents: [],
        tools: ["my_tool"], guardrails: [], mcpServers: [],
      },
    ];
    const graph = assemble(configs, toolConfigs, [], baseOptions);
    const agent = graph.agents.get("a")!;
    expect(agent.tools!.length).toBeGreaterThanOrEqual(1);
    expect((agent.tools![0] as any)?.name).toBe("my_tool");
  });

  // ── 护栏注入 ──

  it("护栏按名称注入到 Agent", () => {
    const guardrailConfigs: GuardrailConfig[] = [
      { name: "sec", guardrail: { name: "sec", execute: async () => ({ tripwireTriggered: false, outputInfo: {} }) } as any },
    ];
    const configs: AgentConfig[] = [
      {
        name: "a", factory: fakeFactory("a"), promptKey: "a",
        description: "", children: [], handoffToParents: [],
        tools: [], guardrails: ["sec"], mcpServers: [],
      },
    ];
    const graph = assemble(configs, [], guardrailConfigs, baseOptions);
    const agent = graph.agents.get("a")!;
    expect(agent.outputGuardrails!.length).toBeGreaterThanOrEqual(1);
    expect(agent.outputGuardrails![0]!.name).toBe("sec");
  });
});
