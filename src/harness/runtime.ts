/**
 * AgentRuntime — Harness 运行时容器
 *
 * 管理 Agent 图的完整生命周期：启动、MCP 连接、沙盒进入/退出、关闭。
 */
import { SandboxManager } from "../core/sandbox.js";
import { ShellServiceImpl } from "../core/shell-service.js";
import { FileSystemService } from "../core/filesystem.js";
import { EditorImpl } from "../core/code-editor.js";
import { McpRegistry } from "./mcp-registry.js";
import { assemble } from "./assembler.js";
import {
  agentConfigs,
  toolConfigs,
  guardrailConfigs,
  mcpServerConfigs,
  buildSandboxAgentConfigs,
} from "../config.js";
import type { AssembledGraph, AssembleOptions, McpServerStatus } from "./types.js";
import type { AppContext } from "../core/agent-context.js";
import type { Agent } from "@openai/agents";

export class AgentRuntime {
  private _graph: AssembledGraph | null = null;
  private _sandbox: SandboxManager = new SandboxManager();
  private _inSandbox = false;
  private _mcp: McpRegistry = new McpRegistry();

  get graph(): AssembledGraph {
    if (!this._graph) throw new Error("AgentRuntime 尚未初始化，请先调用 init()");
    return this._graph;
  }

  get rootAgent(): Agent<AppContext, "text"> {
    return this.graph.root;
  }

  get inSandbox(): boolean {
    return this._inSandbox;
  }

  get sandboxPath(): string | null {
    return this._sandbox.active;
  }

  // ── MCP 命令代理 ──
  get mcpRegistry(): McpRegistry { return this._mcp; }

  /** 初始化：装配默认 Agent 拓扑 + 自动连接 MCP */
  async init(workspaceRoot?: string): Promise<void> {
    const root = workspaceRoot ?? process.cwd();
    const fs = new FileSystemService(root);
    const editor = new EditorImpl(fs);

    // 加载 MCP 服务器配置
    const mcpServers = this._mcp.load(mcpServerConfigs, false);
    await this._mcp.connectAuto();

    const options: AssembleOptions = { workspaceRoot: root, editor, mcpServers };
    this._graph = assemble(agentConfigs, toolConfigs, guardrailConfigs, options);
    this._inSandbox = false;
  }

  /** 进入沙盒模式 */
  async enterSandbox(label?: string): Promise<void> {
    if (this._inSandbox) throw new Error("已在沙盒中");

    const root = await this._sandbox.create(label);
    const shell = new ShellServiceImpl(root);
    const fs = new FileSystemService(root);
    const editor = new EditorImpl(fs);

    const mcpServers = this._mcp.load(mcpServerConfigs, true);
    await this._mcp.connectAuto();

    const options: AssembleOptions = {
      workspaceRoot: root,
      editor,
      shell,
      mcpServers,
      extraPromptVars: { sandbox_root: root, sandbox_mode: "true" },
    };

    this._graph = assemble(
      buildSandboxAgentConfigs(),
      toolConfigs,
      guardrailConfigs,
      options,
    );
    this._inSandbox = true;
  }

  /** 退出沙盒 */
  async exitSandbox(): Promise<void> {
    if (!this._inSandbox) throw new Error("当前不在沙盒中");
    await this._mcp.disconnectAll();
    await this._sandbox.destroy();
    await this.init();
  }

  /** 优雅关闭 */
  async shutdown(): Promise<void> {
    await this._mcp.disconnectAll();
    await this._sandbox.autoDestroy();
  }
}
