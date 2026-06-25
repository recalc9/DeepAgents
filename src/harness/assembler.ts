/**
 * Assembler — Harness 装配引擎
 *
 * 输入：声明式配置 → 输出：完整连线的 Agent 拓扑图
 *
 * 流程：
 *   1. 构建 ToolBuildContext → 解析所有工具
 *   2. 构建 AgentBuildContext
 *   3. 拓扑排序（叶子优先）
 *   4. 按序创建 Agent 实例
 *   5. 连线 handoffs（children + handoffToParents）
 *   6. 处理 asTool（挂到父 Agent）
 *   7. 注入 rootHandoff 到根 Agent
 */
import { type Agent, handoff } from "@openai/agents";
import type { OutputGuardrail, Tool, MCPServer } from "@openai/agents";
import { container } from "../core/container.js";
import { PromptResolver } from "../core/prompt-resolver.js";
import { FileSystemService } from "../core/filesystem.js";
import { EditorImpl } from "../core/code-editor.js";
import type { AppContext } from "../core/agent-context.js";
import type {
  AgentConfig,
  ToolConfig,
  GuardrailConfig,
  AssembleOptions,
  AssembledGraph,
  AgentBuildContext,
  ToolBuildContext,
} from "./types.js";

/** 拓扑排序：子节点在父节点之前 */
function topoSort(configs: AgentConfig[]): AgentConfig[] {
  const nameSet = new Set(configs.map(c => c.name));
  const visited = new Set<string>();
  const result: AgentConfig[] = [];

  function visit(name: string) {
    if (visited.has(name)) return;
    visited.add(name);
    const config = configs.find(c => c.name === name);
    if (!config) throw new Error(`[Assembler] 未知 Agent: ${name}`);
    // 先访问所有子节点
    for (const child of config.children) {
      if (!nameSet.has(child)) throw new Error(`[Assembler] ${name} 引用了未注册的子 Agent: ${child}`);
      visit(child);
    }
    result.push(config);
  }

  // 从所有节点出发（处理孤立节点和多根）
  for (const c of configs) visit(c.name);
  return result;
}

export function assemble(
  agentConfigs: AgentConfig[],
  toolConfigs: ToolConfig[],
  guardrailConfigs: GuardrailConfig[],
  options: AssembleOptions,
): AssembledGraph {
  const model = container.getDeepSeekModel();
  const resolver = new PromptResolver();
  const fs = new FileSystemService(options.workspaceRoot);
  const editor = new EditorImpl(fs);

  // ── 解析工具（懒创建：只在 Agent 实际请求时实例化）──
  const toolCtx: ToolBuildContext = {
    editor,
    shell: options.shell,
    workspaceRoot: options.workspaceRoot,
  };
  const toolFactoryMap = new Map<string, (ctx: ToolBuildContext) => Tool>();
  for (const tc of toolConfigs) {
    toolFactoryMap.set(tc.name, tc.factory);
  }
  // 懒加载缓存：第一次 getTools() 调用时创建并缓存
  const toolInstanceCache = new Map<string, Tool>();

  // ── 解析护栏 ──
  const guardrailMap = new Map<string, OutputGuardrail>();
  for (const gc of guardrailConfigs) {
    guardrailMap.set(gc.name, gc.guardrail);
  }

  // ── MCP 服务器索引 ──
  const mcpServerMap = new Map<string, MCPServer>();
  for (const s of options.mcpServers) {
    mcpServerMap.set(s.name, s);
  }

  // ── 拓扑排序 + 创建 Agent ──
  const sorted = topoSort(agentConfigs);
  const agentMap = new Map<string, Agent<AppContext, "text">>();

  for (const config of sorted) {
    // 为每个 Agent 创建独立上下文（闭包绑定其工具/护栏名称）
    const toolNames = config.tools;
    const guardrailNames = config.guardrails;

    const buildCtx: AgentBuildContext = {
      model,
      resolver,
      workspaceRoot: options.workspaceRoot,
      agentName: config.name,
      promptKey: config.promptKey,
      extraPromptVars: options.extraPromptVars ?? {},
      toolNames,
      guardrailNames,
      getTools: () => {
        return toolNames.map(n => {
          let t = toolInstanceCache.get(n);
          if (t) return t;
          const factory = toolFactoryMap.get(n);
          if (!factory) throw new Error(`[Assembler] 未找到工具: ${n}`);
          t = factory(toolCtx);
          toolInstanceCache.set(n, t);
          return t;
        });
      },
      getGuardrails: () => {
        return guardrailNames.map(n => {
          const g = guardrailMap.get(n);
          if (!g) throw new Error(`[Assembler] 未找到护栏: ${n}`);
          return g;
        });
      },
    };

    const agent = config.factory(buildCtx);
    // Assembler 注入配置元数据（Agent 对象支持这些字段，但 SDK 类型不暴露为构造函数参数）
    if (config.description) agent.handoffDescription = config.description;
    if (config.mcpServers.length > 0) {
      const servers = config.mcpServers.map(n => mcpServerMap.get(n)).filter((s): s is MCPServer => s != null);
      if (servers.length > 0) agent.mcpServers = servers;
    }
    agentMap.set(config.name, agent);
  }

  // ── 连线 handoffs ──
  // children: parent.handoffs = [handoff(child1), handoff(child2), ...]
  for (const config of agentConfigs) {
    const parent = agentMap.get(config.name);
    if (!parent) continue;
    if (config.children.length > 0) {
      parent.handoffs = config.children.map(childName => {
        const child = agentMap.get(childName);
        if (!child) throw new Error(`[Assembler] ${config.name} 引用了未知子 Agent: ${childName}`);
        return handoff(child);
      });
    }
  }

  // handoffToParents: agent.handoffs += [handoff(parent1), ...]
  for (const config of agentConfigs) {
    const agent = agentMap.get(config.name);
    if (!agent || config.handoffToParents.length === 0) continue;
    const parentHandoffs = config.handoffToParents
      .map(pn => agentMap.get(pn))
      .filter(Boolean)
      .map(p => handoff(p!));
    agent.handoffs = [...(agent.handoffs ?? []), ...parentHandoffs];
  }

  // ── asTool: 将 Agent 转为工具挂到父 Agent ──
  for (const config of agentConfigs) {
    if (!config.asTool) continue;
    const agent = agentMap.get(config.name);
    const parent = agentMap.get(config.asTool.exposeTo);
    if (!agent || !parent) {
      throw new Error(`[Assembler] asTool 连线失败: ${config.name} → ${config.asTool.exposeTo}`);
    }
    const tool = agent.asTool({
      toolName: config.asTool.toolName,
      toolDescription: config.asTool.toolDescription,
    });
    parent.tools = [...(parent.tools ?? []), tool as any];
  }

  // ── rootHandoff: 暴露为根 Agent 的 handoff ──
  const root = agentMap.get("triage");
  if (root) {
    const rootHandoffConfigs = agentConfigs.filter(c => c.rootHandoff);
    const rootHandoffs = rootHandoffConfigs
      .map(c => agentMap.get(c.name))
      .filter(Boolean)
      .map(a => handoff(a!));
    root.handoffs = [...(root.handoffs ?? []), ...rootHandoffs];
  }

  // ── 验证 ──
  // 检测缺失引用
  for (const config of agentConfigs) {
    for (const childName of config.children) {
      if (!agentMap.has(childName)) {
        throw new Error(`[Assembler] ${config.name}.children 引用未注册 Agent: ${childName}`);
      }
    }
    for (const parentName of config.handoffToParents) {
      if (!agentMap.has(parentName)) {
        throw new Error(`[Assembler] ${config.name}.handoffToParents 引用未注册 Agent: ${parentName}`);
      }
    }
    for (const toolName of config.tools) {
      if (!toolFactoryMap.has(toolName)) {
        throw new Error(`[Assembler] ${config.name}.tools 引用未注册工具: ${toolName}`);
      }
    }
    for (const guardName of config.guardrails) {
      if (!guardrailMap.has(guardName)) {
        throw new Error(`[Assembler] ${config.name}.guardrails 引用未注册护栏: ${guardName}`);
      }
    }
  }

  return { root: root!, agents: agentMap };
}
