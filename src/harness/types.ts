/**
 * Harness 类型定义 — Agent 运行时容器的核心类型
 */
import type { Agent, Tool, OutputGuardrail, MCPServer } from "@openai/agents";
import type { OpenAIChatCompletionsModel } from "@openai/agents";
import type { PromptResolver } from "../core/prompt-resolver.js";
import type { AppContext } from "../core/agent-context.js";
import type { Editor } from "@openai/agents";
import type { Shell } from "@openai/agents";

// ────────── Agent 声明式配置 ──────────

export interface AgentConfig {
  name: string;
  factory: (ctx: AgentBuildContext) => Agent<AppContext, "text">;
  promptKey: string;
  description: string;
  children: string[];
  handoffToParents: string[];
  tools: string[];
  guardrails: string[];
  mcpServers: string[];
  asTool?: AgentAsToolConfig;
  rootHandoff?: boolean;
}

export interface AgentAsToolConfig {
  toolName: string;
  toolDescription: string;
  exposeTo: string;
}

// ────────── MCP 服务器声明式配置 ──────────

export interface McpServerConfig {
  name: string;
  stdio?: { command: string; args?: string[]; env?: Record<string, string>; cwd?: string };
  streamableHttp?: { url: string };
  sse?: { url: string };
  autoConnect?: boolean;
  sandboxOnly?: boolean;
}

export interface McpServerStatus {
  name: string;
  mode: "stdio" | "http" | "sse";
  connected: boolean;
  toolCount: number;
  error: string;
}

// ────────── 工具声明式配置 ──────────

export interface ToolConfig {
  name: string;
  factory: (ctx: ToolBuildContext) => Tool;
  sandboxOnly?: boolean;
}

export interface ToolBuildContext {
  editor: Editor;
  shell: Shell | undefined;
  workspaceRoot: string;
}

// ────────── 护栏声明式配置 ──────────

export interface GuardrailConfig {
  name: string;
  guardrail: OutputGuardrail;
}

// ────────── 构建上下文 ──────────

export interface AgentBuildContext {
  model: OpenAIChatCompletionsModel;
  resolver: PromptResolver;
  workspaceRoot: string;
  agentName: string;
  promptKey: string;
  toolNames: string[];
  guardrailNames: string[];
  extraPromptVars: Record<string, string>;
  getTools: () => Tool[];
  getGuardrails: () => OutputGuardrail[];
}

// ────────── 装配选项 ──────────

export interface AssembleOptions {
  workspaceRoot: string;
  editor: Editor;
  shell?: Shell;
  mcpServers: MCPServer[];
  extraPromptVars?: Record<string, string>;
}

// ────────── 装配结果 ──────────

export interface AssembledGraph {
  root: Agent<AppContext, "text">;
  agents: Map<string, Agent<AppContext, "text">>;
}
