/**
 * Harness 声明式配置 — 单一事实来源
 *
 * 新增 Agent / 工具 / 护栏只需在此文件添加配置，不动框架代码。
 */
import { applyPatchTool, shellTool } from "@openai/agents";
import { fileReadTool } from "./tools/file.tool.js";
import { sqlQueryTool, sqlExecuteTool } from "./tools/db.tool.js";
import { webSearchTool, webFetchTool } from "./tools/web.tool.js";
import { runCodeTool } from "./tools/code-exec.tool.js";
import { gitTool } from "./tools/git.tool.js";
import { secretsGuardrail } from "./core/guardrails.js";
import { createAgent } from "./agents/factory.js";
import { createManagerAgent } from "./agents/manager.agent.js";
import type {
  AgentConfig,
  ToolConfig,
  GuardrailConfig,
  McpServerConfig,
} from "./harness/types.js";

// ────────── 工具注册表 ──────────

export const toolConfigs: ToolConfig[] = [
  {
    name: "file_read",
    factory: () => fileReadTool,
  },
  {
    name: "apply_patch",
    factory: (ctx) =>
      applyPatchTool({
        editor: ctx.editor,
        needsApproval: async (_rc, op) => op.type === "delete_file",
      }),
  },
  {
    name: "sql_query",
    factory: () => sqlQueryTool,
  },
  {
    name: "sql_execute",
    factory: () => sqlExecuteTool,
  },
  {
    name: "shell",
    factory: (ctx) =>
      shellTool({
        shell: ctx.shell,
        needsApproval: true,
      }),
    sandboxOnly: true,
  },
  {
    name: "web_search",
    factory: () => webSearchTool,
  },
  {
    name: "web_fetch",
    factory: () => webFetchTool,
  },
  {
    name: "run_code",
    factory: () => runCodeTool,
    sandboxOnly: true,
  },
  {
    name: "git",
    factory: () => gitTool,
  },
];

// ────────── 护栏注册表 ──────────

export const guardrailConfigs: GuardrailConfig[] = [
  { name: "secrets", guardrail: secretsGuardrail },
];

// ────────── Agent 拓扑配置 ──────────

export const agentConfigs: AgentConfig[] = [
  {
    name: "code",
    factory: createAgent,
    promptKey: "code",
    description: "编程专家，负责代码编写、审查、文件编辑和代码相关的数据查询",
    children: [],
    handoffToParents: ["manager"],
    tools: ["file_read", "apply_patch", "sql_query", "web_fetch", "git"],
    guardrails: ["secrets"],
    mcpServers: [],
  },
  {
    name: "db",
    factory: createAgent,
    promptKey: "db",
    description: "数据库专家，负责 SQL 查询、数据分析、建表优化等任务",
    children: [],
    handoffToParents: ["manager"],
    tools: ["sql_query", "sql_execute"],
    guardrails: ["secrets"],
    mcpServers: [],
  },
  {
    name: "general",
    factory: createAgent,
    promptKey: "general",
    description: "通用问答专家，处理不属于编程、数据库、搜索的各类问题",
    children: [],
    handoffToParents: ["triage"],
    tools: ["file_read", "web_fetch"],
    guardrails: ["secrets"],
    mcpServers: [],
    rootHandoff: true,
  },
  {
    name: "search",
    factory: createAgent,
    promptKey: "search",
    description: "搜索和信息检索专家，处理外部知识检索请求",
    children: [],
    handoffToParents: ["triage"],
    tools: ["web_search", "web_fetch"],
    guardrails: ["secrets"],
    mcpServers: [],
    rootHandoff: true,
  },
  {
    name: "manager",
    factory: createManagerAgent,
    promptKey: "manager",
    description: "开发总管：处理编程、代码审查、文件编辑、数据库查询和建表等开发任务",
    children: ["code", "db"],
    handoffToParents: [],
    tools: [],
    guardrails: ["secrets"],
    mcpServers: [],
    asTool: {
      toolName: "manager_dev",
      toolDescription:
        "开发总管：处理编程、代码审查、文件编辑、数据库查询/建表等所有开发相关任务。" +
        "输入用自然语言描述需求，Manager 会自动分发给编程专家或数据库专家。",
      exposeTo: "triage",
    },
  },
  {
    name: "triage",
    factory: createAgent,
    promptKey: "triage",
    description: "智能任务分发器",
    children: [],
    handoffToParents: [],
    tools: [],
    guardrails: ["secrets"],
    mcpServers: [],
  },
];

// ────────── MCP 服务器配置 ──────────

/** 示例 MCP 服务器配置。按需取消注释以启用。
 *
 *  filesystem: 让 Agent 访问指定目录的文件系统（需先 `npx @anthropic/mcp-server-filesystem /path`）
 *  puppeteer:  浏览器自动化（需 `npx -y @anthropic/mcp-server-puppeteer`）
 *  github:     GitHub API（需设置 GITHUB_TOKEN 环境变量）
 */
export const mcpServerConfigs: McpServerConfig[] = [
  // {
  //   name: "filesystem",
  //   stdio: { command: "npx", args: ["-y", "@anthropic/mcp-server-filesystem", "/tmp"] },
  //   autoConnect: false,
  // },
  // {
  //   name: "puppeteer",
  //   stdio: { command: "npx", args: ["-y", "@anthropic/mcp-server-puppeteer"] },
  //   autoConnect: false,
  // },
];

/** 沙盒模式下的 Agent 配置变体（Code 额外挂载 shell 工具） */
export function buildSandboxAgentConfigs(): AgentConfig[] {
  return agentConfigs.map(c => {
    if (c.name === "code") {
      return { ...c, tools: [...c.tools, "shell", "run_code"] };
    }
    return c;
  });
}
