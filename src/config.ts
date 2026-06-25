/**
 * Harness 声明式配置 — 红蓝安全 Agent 平台
 */
import { applyPatchTool, shellTool } from "@openai/agents";
import { fileReadTool } from "./tools/file.tool.js";
import { sqlQueryTool, sqlExecuteTool } from "./tools/db.tool.js";
import { webSearchTool, webFetchTool } from "./tools/web.tool.js";
import { runCodeTool } from "./tools/code-exec.tool.js";
import { gitTool } from "./tools/git.tool.js";
import {
  proxyStartTool, proxyStopTool, proxySessionsTool,
  proxyInspectTool, proxyExportTool, proxyInterceptTool, proxyDashboardTool,
} from "./tools/mitm.tool.js";
import { testRunTool } from "./tools/test.tool.js";
import { jsonQueryTool, csvReadTool } from "./tools/data.tool.js";
import { lintRunTool, typeCheckTool, prReviewTool } from "./tools/review.tool.js";
import { memorySaveTool, memorySearchTool, memoryForgetTool, memoryListTool } from "./tools/memory.tool.js";

// ── 安全专用工具 ──
import { portScanTool, dnsEnumTool, whoisTool, sslInspectTool, subdomainEnumTool } from "./tools/recon.tool.js";
import { payloadGenTool, reverseShellTool, exploitSearchTool, privescCheckTool } from "./tools/exploit.tool.js";
import { vulnScanTool, depAuditTool, secretScanTool, yaraScanTool, sigmaValidateTool, iocCheckTool } from "./tools/blue.tool.js";
import { hashIdentifyTool, wordlistGenTool, hashCrackTool, passSprayTool } from "./tools/access.tool.js";

import { secretsGuardrail } from "./core/guardrails.js";
import { createAgent } from "./agents/factory.js";
import type { AgentConfig, ToolConfig, GuardrailConfig, McpServerConfig } from "./harness/types.js";

// ────────── 工具注册表 ──────────

export const toolConfigs: ToolConfig[] = [
  // 通用
  { name: "file_read", factory: () => fileReadTool },
  { name: "apply_patch", factory: (ctx) => applyPatchTool({ editor: ctx.editor, needsApproval: async (_rc, op) => op.type === "delete_file" }) },
  { name: "sql_query", factory: () => sqlQueryTool },
  { name: "sql_execute", factory: () => sqlExecuteTool },
  { name: "git", factory: () => gitTool },
  { name: "json_query", factory: () => jsonQueryTool },
  { name: "csv_read", factory: () => csvReadTool },
  { name: "web_search", factory: () => webSearchTool },
  { name: "web_fetch", factory: () => webFetchTool },
  // 沙盒
  { name: "shell", factory: (ctx) => { if (!ctx.shell) throw new Error("[config] shell 仅沙盒模式"); return shellTool({ shell: ctx.shell, needsApproval: true }); }, sandboxOnly: true },
  { name: "run_code", factory: () => runCodeTool, sandboxOnly: true },
  // MITM
  { name: "proxy_start", factory: () => proxyStartTool },
  { name: "proxy_stop", factory: () => proxyStopTool },
  { name: "proxy_sessions", factory: () => proxySessionsTool },
  { name: "proxy_inspect", factory: () => proxyInspectTool },
  { name: "proxy_export", factory: () => proxyExportTool },
  { name: "proxy_intercept", factory: () => proxyInterceptTool },
  { name: "proxy_dashboard", factory: () => proxyDashboardTool },
  // 审计
  { name: "lint_run", factory: () => lintRunTool },
  { name: "type_check", factory: () => typeCheckTool },
  { name: "pr_review", factory: () => prReviewTool },
  { name: "test_run", factory: () => testRunTool },
  // 记忆（Intel Cache）
  { name: "memory_save", factory: () => memorySaveTool },
  { name: "memory_search", factory: () => memorySearchTool },
  { name: "memory_forget", factory: () => memoryForgetTool },
  { name: "memory_list", factory: () => memoryListTool },
  // 🔴 侦查 (Recon)
  { name: "port_scan", factory: () => portScanTool },
  { name: "dns_enum", factory: () => dnsEnumTool },
  { name: "whois_lookup", factory: () => whoisTool },
  { name: "ssl_inspect", factory: () => sslInspectTool },
  { name: "subdomain_enum", factory: () => subdomainEnumTool },
  // 🔴 利用 (Exploit)
  { name: "payload_gen", factory: () => payloadGenTool, sandboxOnly: true },
  { name: "reverse_shell", factory: () => reverseShellTool },
  { name: "exploit_search", factory: () => exploitSearchTool },
  { name: "privesc_check", factory: () => privescCheckTool },
  // 🔴 凭证 (Access)
  { name: "hash_identify", factory: () => hashIdentifyTool },
  { name: "wordlist_gen", factory: () => wordlistGenTool },
  { name: "hash_crack", factory: () => hashCrackTool, sandboxOnly: true },
  { name: "pass_spray", factory: () => passSprayTool },
  // 🔵 检测 (Blue)
  { name: "vuln_scan", factory: () => vulnScanTool },
  { name: "dep_audit", factory: () => depAuditTool },
  { name: "secret_scan", factory: () => secretScanTool },
  { name: "yara_scan", factory: () => yaraScanTool },
  { name: "sigma_validate", factory: () => sigmaValidateTool },
  { name: "ioc_check", factory: () => iocCheckTool },
];

// ────────── 护栏 ──────────

export const guardrailConfigs: GuardrailConfig[] = [
  { name: "secrets", guardrail: secretsGuardrail },
];

// ────────── Agent 拓扑（红蓝安全）──────────

export const agentConfigs: AgentConfig[] = [
  // 🔴 红队
  {
    name: "exploit",
    factory: createAgent, promptKey: "exploit",
    description: "漏洞利用专家：Payload 生成、反向 Shell、提权、漏洞搜索",
    children: [], handoffToParents: ["mission"],
    tools: ["file_read", "apply_patch", "payload_gen", "reverse_shell", "exploit_search", "privesc_check", "git"],
    guardrails: ["secrets"], mcpServers: [],
  },
  {
    name: "recon",
    factory: createAgent, promptKey: "recon",
    description: "信息侦查专家：端口扫描、DNS 枚举、WHOIS、SSL 检查、子域名发现",
    children: [], handoffToParents: ["triage"],
    tools: ["web_search", "web_fetch", "port_scan", "dns_enum", "whois_lookup", "ssl_inspect", "subdomain_enum"],
    guardrails: ["secrets"], mcpServers: [], rootHandoff: true,
  },
  {
    name: "access",
    factory: createAgent, promptKey: "access",
    description: "凭证攻击专家：哈希识别/破解、词表生成、密码喷洒",
    children: [], handoffToParents: ["triage"],
    tools: ["hash_identify", "wordlist_gen", "hash_crack", "pass_spray", "file_read"],
    guardrails: ["secrets"], mcpServers: [], rootHandoff: true,
  },
  {
    name: "traffic",
    factory: createAgent, promptKey: "traffic",
    description: "流量拦截专家：HTTP/HTTPS MITM 代理、HAR 导出、实时面板",
    children: [], handoffToParents: ["triage"],
    tools: ["proxy_start", "proxy_stop", "proxy_sessions", "proxy_inspect", "proxy_export", "proxy_intercept", "proxy_dashboard"],
    guardrails: ["secrets"], mcpServers: [], rootHandoff: true,
  },

  // 🔵 蓝队
  {
    name: "audit",
    factory: createAgent, promptKey: "audit",
    description: "安全审计专家：漏洞扫描、依赖审计、密钥泄露检测、代码安全审查",
    children: [], handoffToParents: ["triage"],
    tools: ["vuln_scan", "dep_audit", "secret_scan", "lint_run", "type_check", "pr_review"],
    guardrails: ["secrets"], mcpServers: [], rootHandoff: true,
  },
  {
    name: "detect",
    factory: createAgent, promptKey: "detect",
    description: "威胁检测专家：YARA/SIGMA 规则、IOC 查询",
    children: [], handoffToParents: ["triage"],
    tools: ["yara_scan", "sigma_validate", "ioc_check", "web_search"],
    guardrails: ["secrets"], mcpServers: [], rootHandoff: true,
  },
  {
    name: "intel-db",
    factory: createAgent, promptKey: "intel-db",
    description: "情报数据库：SQL 查询威胁情报、日志分析、IOC 存储",
    children: [], handoffToParents: ["triage", "mission"],
    tools: ["sql_query", "sql_execute", "json_query", "csv_read"],
    guardrails: ["secrets"], mcpServers: [],
  },

  // ⚪ 指挥
  {
    name: "mission",
    factory: createAgent, promptKey: "mission",
    description: "任务指挥官：接收开发/利用任务并分发给 exploit/intel-db",
    children: ["exploit", "intel-db"], handoffToParents: [],
    tools: [], guardrails: ["secrets"], mcpServers: [],
    asTool: { toolName: "mission_lead", toolDescription: "红队任务指挥官：处理漏洞利用开发、Payload 生成等攻击性安全任务。输入用自然语言描述需求，指挥官会自动分发给利用专家或情报数据库。", exposeTo: "triage" },
  },
  {
    name: "intel-cache",
    factory: createAgent, promptKey: "intel-cache",
    description: "情报缓存：跨会话记忆 TTPs、IOC、工具用法",
    children: [], handoffToParents: ["triage"],
    tools: ["memory_save", "memory_search", "memory_forget", "memory_list"],
    guardrails: ["secrets"], mcpServers: [], rootHandoff: true,
  },
  {
    name: "general",
    factory: createAgent, promptKey: "general",
    description: "通用问答：非安全类日常问题",
    children: [], handoffToParents: ["triage"],
    tools: ["file_read", "web_fetch", "json_query", "csv_read"],
    guardrails: ["secrets"], mcpServers: [], rootHandoff: true,
  },

  // 根节点
  {
    name: "triage",
    factory: createAgent, promptKey: "triage",
    description: "作战指挥官 (Ops Commander)：红蓝安全任务顶层分发",
    children: [], handoffToParents: [],
    tools: [], guardrails: ["secrets"], mcpServers: [],
  },
];

// ────────── MCP ──────────

export const mcpServerConfigs: McpServerConfig[] = [];

// ────────── 沙盒变体 ──────────

export function buildSandboxAgentConfigs(): AgentConfig[] {
  return agentConfigs.map(c => {
    if (c.name === "exploit") {
      return { ...c, tools: [...c.tools, "shell", "run_code", "hash_crack", "payload_gen"] };
    }
    return c;
  });
}
